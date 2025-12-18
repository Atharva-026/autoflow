import { classifyEvent as aiClassify } from '../agents/decisionAgent.js';

/**
 * STEP 2: Classify event using AI Agent
 * Determines severity, category, and confidence
 */
export async function classifyEvent(previousStepOutput, context) {
  const { eventData } = previousStepOutput;
  
  console.log(`🤖 Classifying event: ${eventData.type}`);
  
  // Call AI agent for classification
  const classification = await aiClassify(eventData);
  
  console.log(`✅ Classification complete: ${classification.severity} severity`);
  console.log(`   Category: ${classification.category}`);
  console.log(`   Confidence: ${classification.confidence}`);
  console.log(`   Reasoning: ${classification.reasoning}`);
  
  return {
    ...previousStepOutput,
    classification
  };
}