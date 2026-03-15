import { classifyEvent as aiClassify } from '../agents/decisionAgent.js';

/**
 * STEP 2: Classify event using AI Agent
 * Passes runbookHint (past resolutions) and confidenceHint (approval patterns)
 */
export async function classifyEvent(previousStepOutput, context) {
  const { eventData, runbookHint = '', confidenceHint = '' } = previousStepOutput;

  console.log(`🤖 Classifying event: ${eventData.type}`);

  const classification = await aiClassify(eventData, runbookHint, confidenceHint);

  console.log(`✅ Classification complete: ${classification.severity} severity`);
  console.log(`   Category: ${classification.category}`);
  console.log(`   Confidence: ${classification.confidence}`);
  console.log(`   Reasoning: ${classification.reasoning}`);

  return {
    ...previousStepOutput,
    classification
  };
}