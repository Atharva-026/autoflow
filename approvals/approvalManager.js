/**
 * Human-in-the-Loop Approval System
 * - Persisted in SQLite (survives restarts)
 * - Workflow genuinely pauses and waits for a real human click
 * - 10-minute timeout auto-escalates
 */

import { approvalsDB } from '../db/database.js';

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function createApprovalRequest(eventData, decision, classification) {
  const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now        = new Date();
  const expiresAt  = new Date(now.getTime() + APPROVAL_TIMEOUT_MS);

  const request = {
    id:          approvalId,
    eventId:     eventData.id,
    project:     eventData.metadata?.project || 'unknown',
    environment: eventData.metadata?.environment || 'production',
    createdAt:   now.toISOString(),
    expiresAt:   expiresAt.toISOString(),
    event: {
      type:     eventData.type,
      source:   eventData.source,
      message:  eventData.message,
      severity: eventData.severity
    },
    classification: {
      severity:   classification.severity,
      category:   classification.category,
      confidence: classification.confidence,
      reasoning:  classification.reasoning
    },
    proposedAction: {
      action:        decision.action,
      reasoning:     decision.reasoning,
      aiSuggestion:  decision.aiSuggestion,
      policyApplied: decision.policyApplied
    }
  };

  approvalsDB.insert(request);

  // Auto-escalate on timeout
  setTimeout(() => {
    const current = approvalsDB.getById(approvalId);
    if (current && current.status === 'pending') {
      handleTimeout(approvalId);
    }
  }, APPROVAL_TIMEOUT_MS);

  console.log(`\n⏸️  Approval required: ${approvalId}`);
  console.log(`   Event  : ${eventData.type} — ${eventData.message}`);
  console.log(`   Action : ${decision.action}`);
  console.log(`   Expires: ${expiresAt.toISOString()}`);
  console.log(`   👉 Open the dashboard and click Approve or Reject!\n`);

  return request;
}

export function approveAction(approvalId, approver, comments) {
  const request = approvalsDB.getById(approvalId);
  if (!request)                     throw new Error(`Approval ${approvalId} not found`);
  if (request.status !== 'pending') throw new Error(`Approval ${approvalId} is already ${request.status}`);

  const updated = approvalsDB.resolve(approvalId, {
    status:   'approved',
    approver: approver || 'operator',
    comments: comments || ''
  });

  console.log(`\n✅ Approval GRANTED: ${approvalId}`);
  console.log(`   By    : ${approver}`);
  console.log(`   Action: ${request.proposedAction?.action} will proceed\n`);
  return updated;
}

export function rejectAction(approvalId, approver, reason) {
  const request = approvalsDB.getById(approvalId);
  if (!request)                     throw new Error(`Approval ${approvalId} not found`);
  if (request.status !== 'pending') throw new Error(`Approval ${approvalId} is already ${request.status}`);

  const updated = approvalsDB.resolve(approvalId, {
    status:          'rejected',
    approver:        approver || 'operator',
    rejectionReason: reason || 'No reason provided'
  });

  console.log(`\n❌ Approval REJECTED: ${approvalId}`);
  console.log(`   By    : ${approver}`);
  console.log(`   Reason: ${reason}\n`);
  return updated;
}

function handleTimeout(approvalId) {
  approvalsDB.resolve(approvalId, {
    status:   'timeout',
    approver: 'system',
    comments: 'Auto-escalated: no response within 10 minutes'
  });
  console.log(`\n⏰ Approval TIMED OUT: ${approvalId} — escalating\n`);
}

export function getPendingApprovals()        { return approvalsDB.getPending(); }
export function getApproval(approvalId)      { return approvalsDB.getById(approvalId); }
export function getApprovalHistory(limit=50) { return approvalsDB.getHistory(limit); }
export function getApprovalStats()           { return approvalsDB.getStats(); }

/**
 * Genuinely pauses the workflow until a human clicks Approve/Reject.
 * Polls SQLite every 2 seconds. No random timers, no coin flips.
 */
export async function waitForApproval(approvalId, pollInterval = 2000) {
  console.log(`⏳ Workflow PAUSED — waiting for human decision on ${approvalId}`);
  console.log(`   👉 Open dashboard at http://localhost:3001 and click Approve or Reject\n`);

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const request = approvalsDB.getById(approvalId);

      if (!request) {
        clearInterval(interval);
        resolve({ approved: false, timedOut: true });
        return;
      }

      if (request.status === 'approved') {
        clearInterval(interval);
        console.log(`✅ Human APPROVED — workflow resuming\n`);
        resolve({ approved: true, request });
      } else if (request.status === 'rejected') {
        clearInterval(interval);
        console.log(`❌ Human REJECTED — will escalate\n`);
        resolve({ approved: false, request, fallbackAction: 'escalate' });
      } else if (request.status === 'timeout') {
        clearInterval(interval);
        console.log(`⏰ TIMED OUT — will escalate\n`);
        resolve({ approved: false, request, fallbackAction: 'escalate', timedOut: true });
      }
    }, pollInterval);
  });
}