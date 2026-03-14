import { ingestEvent }    from '../steps/ingestEvent.js';
import { classifyEvent }  from '../steps/classifyEvent.js';
import { decideAction }   from '../steps/decideAction.js';
import { executeAction }  from '../steps/executeAction.js';
import { verifyOutcome }  from '../steps/verifyOutcome.js';
import { scheduleFollowUp } from '../steps/scheduleFollowUp.js';
import { generateSummary }  from '../agents/decisionAgent.js';
import { findCorrelatedEvents, recordEvent, getProjectPatterns } from '../correlation/eventCorrelator.js';
import { applyPolicies, requiresApproval } from '../policies/policyEngine.js';
import { createApprovalRequest, waitForApproval } from '../approvals/approvalManager.js';
import { getProject, getProjectHealth } from '../registry/projects.js';
import { resultsDB } from '../db/database.js';

export default async function handleOperationalEvent(input, context) {
  const { eventId, data } = input;

  console.log(`\n🚀 Starting workflow for event: ${eventId}`);
  console.log(`📍 Type: ${data.type} | Project: ${data.metadata?.project || 'unknown'}`);

  const project = data.metadata?.project ? getProject(data.metadata.project) : null;
  if (project) {
    console.log(`🏢 ${project.name} (${project.criticality} criticality) — owner: ${project.owner}`);
  }

  try {
    // STEP 0: Correlation & deduplication
    console.log('\n--- STEP 0: Event Correlation ---');
    const correlation = findCorrelatedEvents(data);

    if (correlation.isDuplicate) {
      console.log(`⚠️  DUPLICATE — skipping workflow (${correlation.events.length} similar recent events)`);
      recordEvent(data);
      return { eventId, action: 'correlated', message: 'Duplicate suppressed' };
    }

    if (correlation.isStorm) {
      console.log(`🌪️  ALERT STORM — ${correlation.count} similar events in 5 min, will auto-escalate`);
    }

    recordEvent(data);

    // STEP 1: Ingest
    console.log('\n--- STEP 1: Ingest ---');
    const step1 = await context.step('ingestEvent', () => ingestEvent({ eventId, data }, context));

    // STEP 2: AI Classification
    console.log('\n--- STEP 2: AI Classification ---');
    const step2 = await context.step('classifyEvent', () => classifyEvent(step1, context));

    // STEP 3: AI Decision
    console.log('\n--- STEP 3: AI Decision ---');
    const step3 = await context.step('decideAction', () => decideAction(step2, context));

    // STEP 3.5: Policy Engine
    console.log('\n--- STEP 3.5: Policy Engine ---');
    const policyStep = await context.step('applyPolicies', async () => {
      const decision = applyPolicies(step1.eventData, step2.classification, step3.decision);
      console.log(`📋 Final Action : ${decision.action}`);
      console.log(`   AI Suggested : ${decision.aiSuggestion || decision.action}`);
      console.log(`   Policy Used  : ${decision.policyApplied ? 'YES' : 'NO'}`);
      console.log(`   Need Approval: ${decision.requiresApproval ? 'YES ⚠️' : 'NO'}`);
      return { ...step3, decision, policyApplied: decision.policyApplied };
    });

    let finalDecision  = policyStep.decision;
    let approvalResult = null;

    // Alert storm overrides approval requirement
    if (correlation.isStorm) {
      console.log('\n🌪️  Alert storm override — forcing escalate');
      finalDecision = {
        ...finalDecision,
        action: 'escalate',
        reasoning: `Alert storm (${correlation.count} events). Auto-escalating.`,
        stormOverride: true
      };
    }

    // STEP 4: Real Human Approval (only if required and not a storm)
    if (requiresApproval(finalDecision) && !correlation.isStorm) {
      console.log('\n--- STEP 4: Human Approval Required ---');

      const approvalRequest = await context.step('requestApproval', async () => {
        return createApprovalRequest(step1.eventData, finalDecision, step2.classification);
      });

      // ← THIS is the real change: genuinely waits for a human click
      const approvalOutcome = await waitForApproval(approvalRequest.id);
      approvalResult = approvalOutcome;

      if (!approvalOutcome.approved) {
        // Human rejected or timed out — force escalate
        finalDecision = {
          ...finalDecision,
          action:      'escalate',
          reasoning:   approvalOutcome.timedOut
            ? 'No response within 10 minutes — auto-escalated'
            : 'Operator rejected action — escalating to team',
          wasRejected: !approvalOutcome.timedOut
        };
        console.log(`⚡ Continuing with escalate\n`);
      } else {
        // Approved — execute the original AI suggestion
        finalDecision = {
          ...finalDecision,
          action:   finalDecision.aiSuggestion || 'escalate',
          approved: true
        };
        console.log(`⚡ Continuing with approved action: ${finalDecision.action}\n`);
      }
    }

    // STEP 5: Execute
    console.log('\n--- STEP 5: Execute Action ---');
    const step5 = await context.step('executeAction', () =>
      executeAction({
        ...policyStep,
        decision:       finalDecision,
        classification: step2.classification,
        approvalResult
      }, context)
    );

    // STEP 6: Verify
    console.log('\n--- STEP 6: Verify Outcome ---');
    const step6 = await context.step('verifyOutcome', () => verifyOutcome(step5, context));

    // STEP 7: Follow-Up
    console.log('\n--- STEP 7: Schedule Follow-Up ---');
    const step7 = await context.step('scheduleFollowUp', () => scheduleFollowUp(step6, context));

    // Summary
    console.log('\n--- Generating Summary ---');
    const summary = await generateSummary({
      eventType:      step1.eventData.type,
      classification: step2.classification,
      decision:       finalDecision,
      outcome:        step6.verification.status
    });

    // Project health
    let projectHealth = null;
    if (project) {
      projectHealth = getProjectHealth(data.metadata.project, []);
      console.log(`📊 Project Health: ${projectHealth?.health || 'unknown'}`);
    }

    // Patterns
    let patterns = null;
    if (data.metadata?.project) {
      patterns = getProjectPatterns(data.metadata.project);
      if (patterns.patterns.length > 0) {
        console.log('\n⚠️  Patterns detected:');
        patterns.patterns.forEach(p => console.log(`   - ${p.message}`));
      }
    }

    const finalResult = {
      ...step7,
      summary,
      projectHealth,
      patterns,
      correlation:    { isDuplicate: false, isStorm: correlation.isStorm, count: correlation.count },
      approvalResult,
      completedAt:    new Date().toISOString()
    };

    // Persist workflow result
    resultsDB.upsert(eventId, {
      classification: step2.classification,
      decision:       finalDecision,
      execution:      step5.execution,
      verification:   step6.verification,
      followUp:       step7.followUp,
      summary,
      completedAt:    finalResult.completedAt
    });

    console.log(`\n✅ Workflow complete: ${eventId}`);
    console.log(`📝 ${summary}\n`);

    return finalResult;

  } catch (error) {
    console.error(`\n❌ Workflow failed for ${eventId}:`, error.message);
    throw error;
  }
}