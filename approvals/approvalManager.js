/**
 * Human-in-the-Loop Approval System
 * Manages approval requests for critical actions
 */

const pendingApprovals = new Map();
const approvalHistory = [];

/**
 * Create approval request
 */
export function createApprovalRequest(eventData, decision, classification) {
  const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const request = {
    id: approvalId,
    eventId: eventData.id,
    project: eventData.metadata?.project,
    environment: eventData.metadata?.environment,
    createdAt: new Date().toISOString(),
    status: 'pending',
    event: {
      type: eventData.type,
      source: eventData.source,
      message: eventData.message,
      severity: eventData.severity
    },
    classification: {
      severity: classification.severity,
      category: classification.category,
      confidence: classification.confidence
    },
    proposedAction: {
      action: decision.action,
      reasoning: decision.reasoning,
      aiSuggestion: decision.aiSuggestion,
      policyApplied: decision.policyApplied
    },
    timeout: 10 * 60 * 1000, // 10 minutes
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  };
  
  pendingApprovals.set(approvalId, request);
  
  console.log(`\n⏸️ Approval required: ${approvalId}`);
  console.log(`   Event: ${eventData.type} - ${eventData.message}`);
  console.log(`   Action: ${decision.action}`);
  console.log(`   Expires: ${request.expiresAt}`);
  
  // Auto-escalate if timeout
  setTimeout(() => {
    if (pendingApprovals.has(approvalId)) {
      const req = pendingApprovals.get(approvalId);
      if (req.status === 'pending') {
        handleTimeout(approvalId);
      }
    }
  }, request.timeout);
  
  return request;
}

/**
 * Approve action
 */
export function approveAction(approvalId, approver, comments) {
  const request = pendingApprovals.get(approvalId);
  
  if (!request) {
    throw new Error(`Approval ${approvalId} not found`);
  }
  
  if (request.status !== 'pending') {
    throw new Error(`Approval ${approvalId} is already ${request.status}`);
  }
  
  request.status = 'approved';
  request.approvedAt = new Date().toISOString();
  request.approver = approver;
  request.comments = comments;
  
  pendingApprovals.delete(approvalId);
  approvalHistory.push(request);
  
  console.log(`\n✅ Approval granted: ${approvalId}`);
  console.log(`   By: ${approver}`);
  console.log(`   Action: ${request.proposedAction.action} will proceed`);
  
  return request;
}

/**
 * Reject action
 */
export function rejectAction(approvalId, approver, reason) {
  const request = pendingApprovals.get(approvalId);
  
  if (!request) {
    throw new Error(`Approval ${approvalId} not found`);
  }
  
  if (request.status !== 'pending') {
    throw new Error(`Approval ${approvalId} is already ${request.status}`);
  }
  
  request.status = 'rejected';
  request.rejectedAt = new Date().toISOString();
  request.approver = approver;
  request.rejectionReason = reason;
  request.fallbackAction = 'escalate'; // Always escalate when rejected
  
  pendingApprovals.delete(approvalId);
  approvalHistory.push(request);
  
  console.log(`\n❌ Approval rejected: ${approvalId}`);
  console.log(`   By: ${approver}`);
  console.log(`   Reason: ${reason}`);
  console.log(`   Fallback: escalate`);
  
  return request;
}

/**
 * Handle approval timeout
 */
function handleTimeout(approvalId) {
  const request = pendingApprovals.get(approvalId);
  
  if (!request || request.status !== 'pending') {
    return;
  }
  
  request.status = 'timeout';
  request.timedOutAt = new Date().toISOString();
  request.fallbackAction = 'escalate'; // Always escalate on timeout
  
  pendingApprovals.delete(approvalId);
  approvalHistory.push(request);
  
  console.log(`\n⏰ Approval timeout: ${approvalId}`);
  console.log(`   Action: escalate (no response received)`);
}

/**
 * Get pending approvals
 */
export function getPendingApprovals() {
  return Array.from(pendingApprovals.values());
}

/**
 * Get approval by ID
 */
export function getApproval(approvalId) {
  // Check pending first
  if (pendingApprovals.has(approvalId)) {
    return pendingApprovals.get(approvalId);
  }
  
  // Check history
  return approvalHistory.find(a => a.id === approvalId);
}

/**
 * Get approval history
 */
export function getApprovalHistory(limit = 50) {
  return approvalHistory.slice(-limit).reverse();
}

/**
 * Get approval statistics
 */
export function getApprovalStats() {
  const total = approvalHistory.length;
  const approved = approvalHistory.filter(a => a.status === 'approved').length;
  const rejected = approvalHistory.filter(a => a.status === 'rejected').length;
  const timeout = approvalHistory.filter(a => a.status === 'timeout').length;
  
  return {
    total,
    approved,
    rejected,
    timeout,
    pending: pendingApprovals.size,
    approvalRate: total > 0 ? (approved / total * 100).toFixed(1) : 0
  };
}

/**
 * Wait for approval (used in workflow)
 */
export async function waitForApproval(approvalId, pollInterval = 1000) {
  return new Promise((resolve, reject) => {
    const checkApproval = setInterval(() => {
      const request = getApproval(approvalId);
      
      if (!request) {
        clearInterval(checkApproval);
        reject(new Error('Approval request not found'));
        return;
      }
      
      if (request.status === 'approved') {
        clearInterval(checkApproval);
        resolve({ approved: true, request });
      } else if (request.status === 'rejected') {
        clearInterval(checkApproval);
        resolve({ approved: false, request, fallbackAction: 'escalate' });
      } else if (request.status === 'timeout') {
        clearInterval(checkApproval);
        resolve({ approved: false, request, fallbackAction: 'escalate', timeout: true });
      }
    }, pollInterval);
  });
}