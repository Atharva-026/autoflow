import { ingestEvent } from '../steps/ingestEvent.js';
import { classifyEvent } from '../steps/classifyEvent.js';
import { decideAction } from '../steps/decideAction.js';
import { executeAction } from '../steps/executeAction.js';
import { verifyOutcome } from '../steps/verifyOutcome.js';
import { scheduleFollowUp } from '../steps/scheduleFollowUp.js';
import { generateSummary } from '../agents/decisionAgent.js';
import { findCorrelatedEvents, recordEvent, getProjectPatterns } from '../correlation/eventCorrelator.js';
import { applyPolicies, requiresApproval } from '../policies/policyEngine.js';
import { createApprovalRequest, waitForApproval } from '../approvals/approvalManager.js';
import { getProject, getProjectHealth } from '../registry/projects.js';

/**
 * ENHANCED WORKFLOW: handleOperationalEvent
 * 
 * Features:
 * - Project/Service awareness
 * - Event correlation & deduplication  
 * - Policy engine (AI + Rules)
 * - Human-in-the-loop approvals
 */
export default async function handleOperationalEvent(input, context) {
  const { eventId, data } = input;
  
  console.log(`\n🚀 Starting ENHANCED workflow for event: ${eventId}`);
  console.log(`📍 Event type: ${data.type}`);
  
  // Get project info if available
  const project = data.metadata?.project ? getProject(data.metadata.project) : null;
  if (project) {
    console.log(`🏢 Project: ${project.name} (${project.criticality} criticality)`);
    console.log(`👥 Owner: ${project.owner}`);
  }
  
  try {
    // STEP 0: Check for correlated/duplicate events
    console.log('\n--- STEP 0: Event Correlation ---');
    const correlation = findCorrelatedEvents(data);
    
    if (correlation.isDuplicate) {
      console.log(`⚠️ DUPLICATE EVENT DETECTED!`);
      console.log(`   Similar event occurred ${correlation.events.length} time(s) recently`);
      console.log(`   Skipping workflow, correlating with existing events`);
      
      recordEvent(data);
      
      return {
        eventId,
        action: 'correlated',
        correlatedWith: correlation.events.map(e => e.id),
        message: 'Event correlated with recent similar events, no new workflow needed'
      };
    }
    
    if (correlation.isStorm) {
      console.log(`🌪️ ALERT STORM DETECTED!`);
      console.log(`   ${correlation.count} similar events in last 5 minutes`);
      console.log(`   Auto-escalating to prevent spam`);
    }
    
    recordEvent(data);
    
    // STEP 1: Ingest Event
    console.log('\n--- STEP 1: Ingest Event ---');
    const step1Result = await context.step('ingestEvent', async () => {
      return ingestEvent({ eventId, data }, context);
    });
    
    // STEP 2: Classify Event (AI Agent)
    console.log('\n--- STEP 2: Classify Event (AI) ---');
    const step2Result = await context.step('classifyEvent', async () => {
      return classifyEvent(step1Result, context);
    });
    
    // STEP 3: Decide Action (AI Agent)
    console.log('\n--- STEP 3: Decide Action (AI) ---');
    const step3Result = await context.step('decideAction', async () => {
      return decideAction(step2Result, context);
    });
    
    // STEP 3.5: Apply Policy Engine
    console.log('\n--- STEP 3.5: Apply Policy Engine ---');
    const policyDecision = await context.step('applyPolicies', async () => {
      const decision = applyPolicies(
        step1Result.eventData,
        step2Result.classification,
        step3Result.decision
      );
      
      console.log(`📋 Policy Result:`);
      console.log(`   Final Action: ${decision.action}`);
      console.log(`   AI Suggested: ${decision.aiSuggestion || decision.action}`);
      console.log(`   Policy Applied: ${decision.policyApplied ? 'YES' : 'NO'}`);
      console.log(`   Requires Approval: ${decision.requiresApproval ? 'YES' : 'NO'}`);
      
      return {
        ...step3Result,
        decision,
        policyApplied: decision.policyApplied
      };
    });
    
    // Check if approval needed (alert storm override)
    let finalDecision = policyDecision.decision;
    let approvalResult = null;
    
    if (correlation.isStorm) {
      console.log('\n🌪️ Alert storm override: Auto-escalating');
      finalDecision = {
        ...finalDecision,
        action: 'escalate',
        reasoning: `Alert storm detected (${correlation.count} similar events). Auto-escalating to prevent noise.`,
        stormOverride: true
      };
    }
    
    // STEP 4: Human-in-the-Loop Approval (if needed)
    if (requiresApproval(finalDecision) && !correlation.isStorm) {
      console.log('\n--- STEP 4: Request Human Approval ---');
      
      const approvalRequest = await context.step('requestApproval', async () => {
        const request = createApprovalRequest(
          step1Result.eventData,
          finalDecision,
          step2Result.classification
        );
        
        console.log(`⏸️ Workflow PAUSED - Waiting for approval`);
        console.log(`   Approval ID: ${request.id}`);
        console.log(`   Expires: ${request.expiresAt}`);
        console.log(`   👉 Check frontend for approval interface!`);
        
        return request;
      });
      
      // Simulate approval wait (in real system, would wait for actual human input)
      console.log(`\n⏳ Simulating approval wait (5 seconds for demo)...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Simulate approval decision
      const shouldApprove = Math.random() > 0.3; // 70% approve rate for demo
      
      if (shouldApprove) {
        console.log(`✅ APPROVED by operator (simulated)`);
        approvalResult = { approved: true, approvalRequest };
      } else {
        console.log(`❌ REJECTED by operator (simulated)`);
        finalDecision = {
          ...finalDecision,
          action: 'escalate',
          reasoning: 'Action rejected by operator, escalating to team',
          wasRejected: true
        };
        approvalResult = { approved: false, approvalRequest };
      }
    }
    
    // STEP 5: Execute Action
    console.log('\n--- STEP 5: Execute Action ---');
    const step4Result = await context.step('executeAction', async () => {
      return executeAction({
        ...policyDecision,
        decision: finalDecision,
        approvalResult
      }, context);
    });
    
    // STEP 6: Verify Outcome
    console.log('\n--- STEP 6: Verify Outcome ---');
    const step5Result = await context.step('verifyOutcome', async () => {
      return verifyOutcome(step4Result, context);
    });
    
    // STEP 7: Schedule Follow-Up
    console.log('\n--- STEP 7: Schedule Follow-Up ---');
    const step6Result = await context.step('scheduleFollowUp', async () => {
      return scheduleFollowUp(step5Result, context);
    });
    
    // Generate AI summary
    console.log('\n--- Generating Summary ---');
    const summary = await generateSummary({
      eventType: step1Result.eventData.type,
      classification: step2Result.classification,
      decision: finalDecision,
      outcome: step5Result.verification.status
    });
    
    // Get project health if applicable
    let projectHealth = null;
    if (project) {
      console.log('\n--- Checking Project Health ---');
      projectHealth = getProjectHealth(data.metadata.project, []);
      console.log(`📊 Project Health: ${projectHealth?.health || 'unknown'}`);
    }
    
    // Get event patterns
    let patterns = null;
    if (data.metadata?.project) {
      patterns = getProjectPatterns(data.metadata.project);
      if (patterns.patterns.length > 0) {
        console.log('\n⚠️ Detected Patterns:');
        patterns.patterns.forEach(p => {
          console.log(`   - ${p.message}`);
        });
      }
    }
    
    const finalResult = {
      ...step6Result,
      summary,
      projectHealth,
      patterns,
      correlation: {
        isDuplicate: correlation.isDuplicate,
        isStorm: correlation.isStorm,
        count: correlation.count
      },
      approvalNeeded: requiresApproval(finalDecision),
      approvalResult,
      completedAt: new Date().toISOString()
    };
    
    console.log(`\n✅ ENHANCED Workflow completed: ${eventId}`);
    console.log(`📝 Summary: ${summary}\n`);
    
    return finalResult;
    
  } catch (error) {
    console.error(`\n❌ Workflow failed for event: ${eventId}`, error);
    throw error;
  }
}