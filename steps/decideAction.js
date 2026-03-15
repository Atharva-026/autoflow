import { decideAction as aiDecide } from '../agents/decisionAgent.js';

/**
 * STEP 3: Decide action using AI Agent
 * Passes runbookHint through so AI has historical context
 */
export async function decideAction(previousStepOutput, context) {
  // Pull runbookHint through from previous step so it isn't lost
  const { eventData, classification, runbookHint = '' } = previousStepOutput;

  console.log(`🤖 Deciding action for ${classification.severity} event`);

  const decision = await aiDecide(eventData, classification, runbookHint);

  console.log(`✅ Decision made: ${decision.action}`);
  console.log(`   Priority: ${decision.priority}`);
  console.log(`   Reasoning: ${decision.reasoning}`);

  return {
    ...previousStepOutput,
    decision
  };
}