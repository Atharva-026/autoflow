import { notify } from '../services/notifier.js';

/**
 * STEP 5: Execute the decided action
 * Now with real notifications on escalate/auto-fix-failed
 */
export async function executeAction(previousStepOutput, context) {
  const { decision, eventData, classification, approvalResult } = previousStepOutput;

  let actionToExecute = decision.action;

  // If approval flow passed through, use the approved action
  if (decision.action === 'require_approval') {
    actionToExecute = decision.aiSuggestion || 'escalate';
    console.log(`✅ Post-approval — executing: ${actionToExecute}`);
  }

  console.log(`⚙️ Executing action: ${actionToExecute}`);

  let result;

  switch (actionToExecute) {

    case 'ignore':
      result = await handleIgnore(eventData);
      break;

    case 'monitor':
      result = await handleMonitor(eventData, decision.parameters);
      break;

    case 'auto-fix':
      result = await handleAutoFix(eventData, classification, decision);
      break;

    case 'escalate':
      result = await handleEscalate(eventData, classification, decision);
      break;

    default:
      throw new Error(`Unknown action: ${actionToExecute}`);
  }

  console.log(`✅ Action complete: ${result.message}`);

  return {
    ...previousStepOutput,
    execution: {
      action:      actionToExecute,
      result,
      executedAt:  new Date().toISOString()
    }
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleIgnore(eventData) {
  console.log(`ℹ️  Ignoring: ${eventData.type} (low priority)`);
  return { success: true, message: 'Event logged and ignored', action: 'ignore' };
}

async function handleMonitor(eventData, parameters) {
  console.log(`👁️  Monitoring: ${eventData.type}`);
  return {
    success:       true,
    message:       'Event flagged for monitoring, follow-up scheduled',
    action:        'monitor',
    checkInterval: parameters?.timeout || 300
  };
}

async function handleAutoFix(eventData, classification, decision) {
  console.log(`🔧 Attempting auto-fix for: ${eventData.type}`);

  const steps = [
    'Analyzing root cause...',
    'Applying remediation...',
    'Verifying fix...',
    'Cleanup and validation...'
  ];

  for (const step of steps) {
    console.log(`   ${step}`);
    await new Promise(r => setTimeout(r, 400));
  }

  // 80% success rate
  const success = Math.random() > 0.2;

  if (success) {
    console.log(`   ✅ Auto-fix succeeded`);
    return {
      success:        true,
      message:        'Auto-fix applied successfully',
      action:         'auto-fix',
      stepsCompleted: steps.length
    };
  } else {
    // Auto-fix failed → escalate with real notification
    console.log(`   ❌ Auto-fix failed — escalating`);
    const notifyResult = await notify(
      eventData,
      classification,
      { ...decision, action: 'escalate' },
      'auto-fix-failed'
    );
    return {
      success:        false,
      message:        'Auto-fix failed — team notified',
      action:         'auto-fix',
      stepsCompleted: steps.length,
      notifications:  notifyResult
    };
  }
}

async function handleEscalate(eventData, classification, decision) {
  console.log(`🚨 Escalating: ${eventData.type} (${classification.severity})`);

  const notifyResult = await notify(
    eventData,
    classification,
    decision,
    'escalated'
  );

  const sentChannels = Object.entries(notifyResult)
    .filter(([, r]) => r.sent)
    .map(([ch]) => ch);

  return {
    success:       true,
    message:       sentChannels.length > 0
      ? `Escalated via: ${sentChannels.join(', ')}`
      : 'Escalated (no notification channels configured — add SLACK_WEBHOOK_URL or GMAIL_USER to .env)',
    action:        'escalate',
    channels:      sentChannels,
    notifications: notifyResult
  };
}