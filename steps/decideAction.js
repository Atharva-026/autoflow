import { decideAction as aiDecide } from '../agents/decisionAgent.js';

/**
 * STEP 3: Decide action using AI Agent
 * Passes runbookHint + confidenceHint so AI has full historical context
 */
export async function decideAction(previousStepOutput, context) {
  const { eventData, classification, runbookHint = '', confidenceHint = '' } = previousStepOutput;

  console.log(`🤖 Deciding action for ${classification.severity} event`);

  const decision = await aiDecide(eventData, classification, runbookHint, confidenceHint);

  console.log(`✅ Decision made: ${decision.action}`);
  console.log(`   Priority: ${decision.priority}`);
  console.log(`   Reasoning: ${decision.reasoning}`);

  return {
    ...previousStepOutput,
    decision
  };
}