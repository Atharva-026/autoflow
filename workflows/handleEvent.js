import { ingestEvent } from '../steps/ingestEvent.js';
import { classifyEvent } from '../steps/classifyEvent.js';
import { decideAction } from '../steps/decideAction.js';
import { executeAction } from '../steps/executeAction.js';
import { verifyOutcome } from '../steps/verifyOutcome.js';
import { scheduleFollowUp } from '../steps/scheduleFollowUp.js';
import { generateSummary } from '../agents/decisionAgent.js';

/**
 * MAIN WORKFLOW: handleOperationalEvent
 * 
 * This is the core of our system - a unified workflow that:
 * 1. Ingests events
 * 2. Uses AI to classify them
 * 3. Uses AI to decide actions
 * 4. Executes actions (background jobs)
 * 5. Verifies outcomes
 * 6. Schedules follow-ups
 * 
 * All steps are observable, resumable, and stream updates in real-time
 */
export default async function handleOperationalEvent(input, context) {
  const { eventId, data } = input;
  
  console.log(`\n🚀 Starting workflow for event: ${eventId}`);
  console.log(`📍 Event type: ${data.type}`);
  
  try {
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
    
    // STEP 4: Execute Action (Background Job for long-running tasks)
    console.log('\n--- STEP 4: Execute Action ---');
    const step4Result = await context.step('executeAction', async () => {
      return executeAction(step3Result, context);
    });
    
    // STEP 5: Verify Outcome
    console.log('\n--- STEP 5: Verify Outcome ---');
    const step5Result = await context.step('verifyOutcome', async () => {
      return verifyOutcome(step4Result, context);
    });
    
    // STEP 6: Schedule Follow-Up (if needed)
    console.log('\n--- STEP 6: Schedule Follow-Up ---');
    const step6Result = await context.step('scheduleFollowUp', async () => {
      return scheduleFollowUp(step5Result, context);
    });
    
    // Generate AI summary of the entire workflow
    console.log('\n--- Generating Summary ---');
    const summary = await generateSummary({
      eventType: step1Result.eventData.type,
      classification: step2Result.classification,
      decision: step3Result.decision,
      outcome: step5Result.verification.status
    });
    
    const finalResult = {
      ...step6Result,
      summary,
      completedAt: new Date().toISOString()
    };
    
    console.log(`\n✅ Workflow completed for event: ${eventId}`);
    console.log(`📝 Summary: ${summary}\n`);
    
    return finalResult;
    
  } catch (error) {
    console.error(`\n❌ Workflow failed for event: ${eventId}`, error);
    throw error;
  }
}