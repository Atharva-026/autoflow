/**
 * STEP 6: Schedule follow-up check
 * Logs when follow-up should happen (scheduler integration for hackathon demo)
 */
export async function scheduleFollowUp(previousStepOutput, context) {
  const { verification, decision, eventData } = previousStepOutput;
  
  console.log(`📅 Scheduling follow-up for ${decision.action}...`);
  
  // Only schedule follow-up for certain actions
  const needsFollowUp = ['auto-fix', 'monitor', 'escalate'].includes(decision.action);
  
  if (!needsFollowUp) {
    console.log(`ℹ️ No follow-up needed for ${decision.action}`);
    
    return {
      ...previousStepOutput,
      followUp: null
    };
  }
  
  // Determine follow-up timing
  let delayMinutes;
  
  switch (decision.action) {
    case 'auto-fix':
      delayMinutes = verification.verified ? 30 : 5; // Quick recheck if failed
      break;
    case 'monitor':
      delayMinutes = 15;
      break;
    case 'escalate':
      delayMinutes = 60; // Check if human resolved it
      break;
    default:
      delayMinutes = 30;
  }
  
  const scheduledTime = new Date(Date.now() + delayMinutes * 60 * 1000);
  
  // Log scheduled follow-up (in production, use Motia's scheduler)
  console.log(`✅ Follow-up scheduled for ${scheduledTime.toISOString()}`);
  console.log(`   Check in ${delayMinutes} minutes`);
  
  return {
    ...previousStepOutput,
    followUp: {
      scheduledAt: scheduledTime.toISOString(),
      delayMinutes,
      checkType: 'status_verification'
    }
  };
}