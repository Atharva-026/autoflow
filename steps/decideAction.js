import { decideAction as aiDecide } from '../agents/decisionAgent.js';

/**
 * STEP 3: Decide action using AI Agent
 * Determines what action to take based on classification
 */
export async function decideAction(previousStepOutput, context) {
  const { eventData, classification } = previousStepOutput;
  
  console.log(`🤖 Deciding action for ${classification.severity} event`);
  
  // Get AI decision
  const decision = await aiDecide(eventData, classification);
  
  console.log(`✅ Decision made: ${decision.action}`);
  console.log(`   Priority: ${decision.priority}`);
  console.log(`   Reasoning: ${decision.reasoning}`);
  
  return {
    ...previousStepOutput,
    decision
  };
}