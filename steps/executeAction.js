/**
 * STEP 4: Execute the decided action
 * This can run as a background job for long-running tasks
 */
export async function executeAction(previousStepOutput, context) {
  const { decision, eventData, classification, approvalResult } = previousStepOutput;
  
  // After approval, execute the ORIGINAL action (escalate)
  let actionToExecute = decision.action;
  
  if (decision.action === 'require_approval') {
    // Approval was given, execute the AI's original suggestion
    actionToExecute = decision.aiSuggestion || 'escalate';
    console.log(`✅ Approval granted - executing: ${actionToExecute}`);
  }
  
  console.log(`⚙️ Executing action: ${actionToExecute}`);
  
  let result;
  
  try {
    // Execute action based on decision
    switch (actionToExecute) {
      case 'ignore':
        result = await handleIgnore(eventData);
        break;
        
      case 'auto-fix':
        // Simulate auto-fix process
        result = await handleAutoFix(eventData, decision.parameters);
        break;
        
      case 'escalate':
        result = await handleEscalate(eventData, actionToExecute, classification, decision.parameters);
        break;
        
      case 'monitor':
        result = await handleMonitor(eventData, decision.parameters);
        break;
        
      default:
        throw new Error(`Unknown action: ${actionToExecute}`);
    }
    
    console.log(`✅ Action executed successfully: ${result.message}`);
    
    return {
      ...previousStepOutput,
      execution: {
        action: decision.action,
        result,
        executedAt: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error(`❌ Action execution failed:`, error);
    throw error;
  }
}

// Action handlers
async function handleIgnore(eventData) {
  console.log(`ℹ️ Ignoring event: ${eventData.type}`);
  return {
    success: true,
    message: 'Event marked as ignored',
    action: 'ignore'
  };
}

async function handleAutoFix(eventData, parameters) {
  console.log(`🔧 Attempting auto-fix for: ${eventData.type}`);
  
  // Simulate remediation steps
  const steps = [
    'Analyzing issue root cause...',
    'Applying fix attempt 1...',
    'Verifying fix...',
    'Cleanup and validation...'
  ];
  
  for (const step of steps) {
    console.log(`  ${step}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Random success for demo (80% success rate)
  const success = Math.random() > 0.2;
  
  if (success) {
    return {
      success: true,
      message: 'Auto-fix applied successfully',
      action: 'auto-fix',
      stepsCompleted: steps.length
    };
  } else {
    return {
      success: false,
      message: 'Auto-fix failed, escalation required',
      action: 'auto-fix',
      stepsCompleted: steps.length
    };
  }
}

async function handleEscalate(eventData, actionName, classification, parameters) {
  console.log(`🚨 Escalating event to: ${parameters?.notifyChannels?.join(', ') || 'slack'}`);
  
  // EMAIL FUNCTIONALITY REMOVED - was causing ReferenceError
  // Email sending has been disabled
  console.log(`📧 Email notifications disabled`);
  
  // Simulate Slack/other notifications
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log(`✅ Slack notification sent`);
  
  return {
    success: true,
    message: `Escalated to ${parameters?.notifyChannels?.length || 1} channels (email disabled)`,
    action: 'escalate',
    channels: parameters?.notifyChannels || ['slack'],
    emailSent: false,
    note: 'Email functionality disabled'
  };
}

async function handleMonitor(eventData, parameters) {
  console.log(`👁️ Monitoring event: ${eventData.type}`);
  
  return {
    success: true,
    message: 'Event marked for monitoring',
    action: 'monitor',
    checkInterval: parameters?.timeout || 300
  };
}