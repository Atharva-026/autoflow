/**
 * STEP 5: Execute Action
 * - escalate   → real notifications (email + slack) + project webhook
 * - auto-fix   → project fixScript if defined, else simulated
 * - monitor    → flag and schedule follow-up
 * - ignore     → log only
 */

import { execSync } from 'child_process';
import { notify }   from '../services/notifier.js';
import { getProject } from '../registry/projects.js';

export async function executeAction(previousStepOutput, context) {
  const { decision, eventData, classification, approvalResult } = previousStepOutput;

  let actionToExecute = decision.action;
  if (decision.action === 'require_approval') {
    actionToExecute = decision.aiSuggestion || 'escalate';
    console.log(`✅ Post-approval — executing: ${actionToExecute}`);
  }

  console.log(`⚙️  Executing action: ${actionToExecute}`);

  // Load project config (webhook URL, fix script, etc.)
  const projectId = eventData.metadata?.project;
  const project   = projectId ? getProject(projectId) : null;

  let result;
  switch (actionToExecute) {
    case 'ignore':   result = await handleIgnore(eventData);                             break;
    case 'monitor':  result = await handleMonitor(eventData, decision.parameters);       break;
    case 'auto-fix': result = await handleAutoFix(eventData, classification, decision, project); break;
    case 'escalate': result = await handleEscalate(eventData, classification, decision, project); break;
    default: throw new Error(`Unknown action: ${actionToExecute}`);
  }

  console.log(`✅ Action complete: ${result.message}`);

  return {
    ...previousStepOutput,
    execution: { action: actionToExecute, result, executedAt: new Date().toISOString() }
  };
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function handleIgnore(eventData) {
  console.log(`ℹ️  Ignoring: ${eventData.type}`);
  return { success: true, message: 'Event logged and ignored', action: 'ignore' };
}

async function handleMonitor(eventData, parameters) {
  console.log(`👁️  Monitoring: ${eventData.type}`);
  return {
    success: true, action: 'monitor',
    message: 'Event flagged for monitoring, follow-up scheduled',
    checkInterval: parameters?.timeout || 300
  };
}

async function handleAutoFix(eventData, classification, decision, project) {
  console.log(`🔧 Attempting auto-fix for: ${eventData.type}`);

  // If project has a real fix script — run it
  if (project?.fixScript) {
    return await runFixScript(project.fixScript, eventData, classification, decision);
  }

  // Simulated fix (coin flip) — replaced once you define a fixScript per project
  console.log(`   ⚠️  No fixScript configured for project — running simulation`);
  console.log(`      (Set fixScript on the project to run a real command)`);

  const steps = ['Analyzing root cause...', 'Applying remediation...', 'Verifying fix...', 'Cleanup...'];
  for (const s of steps) { console.log(`   ${s}`); await sleep(400); }

  const success = Math.random() > 0.2;
  if (success) {
    console.log(`   ✅ Simulated fix succeeded`);
    return { success: true, message: 'Auto-fix applied (simulated)', action: 'auto-fix', simulated: true };
  }

  // Failed → notify team
  console.log(`   ❌ Auto-fix failed — escalating`);
  const notifyResult = await notify(eventData, classification, { ...decision, action: 'escalate' }, 'auto-fix-failed');
  await callWebhook(project?.webhookUrl, { event: eventData, action: 'auto-fix-failed', classification });
  return { success: false, message: 'Auto-fix failed — team notified', action: 'auto-fix', notifications: notifyResult };
}

async function handleEscalate(eventData, classification, decision, project) {
  console.log(`🚨 Escalating: ${eventData.type} (${classification.severity})`);

  // Run notifications and project webhook in parallel
  const [notifyResult, webhookResult] = await Promise.allSettled([
    notify(eventData, classification, decision, 'escalated'),
    callWebhook(project?.webhookUrl, { event: eventData, action: 'escalate', classification, decision })
  ]);

  const notifications = notifyResult.status === 'fulfilled' ? notifyResult.value : { error: notifyResult.reason?.message };
  const webhook       = webhookResult.status === 'fulfilled' ? webhookResult.value : { called: false, error: webhookResult.reason?.message };

  const sentChannels = notifications
    ? Object.entries(notifications).filter(([, r]) => r?.sent || r?.success).map(([ch]) => ch)
    : [];

  if (webhook.called) sentChannels.push('webhook');

  return {
    success:       true,
    action:        'escalate',
    message:       sentChannels.length > 0
      ? `Escalated via: ${sentChannels.join(', ')}`
      : 'Escalated — configure EMAIL_ENABLED, SLACK_WEBHOOK_URL, or project webhookUrl',
    channels:      sentChannels,
    notifications,
    webhook
  };
}

// ─── Real fix script runner ────────────────────────────────────────────────

async function runFixScript(script, eventData, classification, decision) {
  console.log(`🔧 Running fix script: ${script}`);

  // Inject event context as environment variables so scripts can use them
  const env = {
    ...process.env,
    AUTOFLOW_EVENT_ID:      eventData.id,
    AUTOFLOW_EVENT_TYPE:    eventData.type,
    AUTOFLOW_SOURCE:        eventData.source,
    AUTOFLOW_SEVERITY:      classification.severity,
    AUTOFLOW_PROJECT:       eventData.metadata?.project || '',
    AUTOFLOW_ENVIRONMENT:   eventData.metadata?.environment || '',
    AUTOFLOW_MESSAGE:       eventData.message || ''
  };

  try {
    const output = execSync(script, {
      env,
      timeout: 30000,      // 30 second max
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    console.log(`   ✅ Fix script succeeded`);
    if (output.trim()) console.log(`   Output: ${output.trim().slice(0, 200)}`);

    return {
      success:  true,
      action:   'auto-fix',
      message:  'Fix script executed successfully',
      script,
      output:   output.trim().slice(0, 500)
    };
  } catch (err) {
    const stderr = err.stderr?.toString()?.trim() || err.message;
    console.error(`   ❌ Fix script failed: ${stderr.slice(0, 200)}`);

    // Script failed → notify team
    await notify(eventData, classification, { ...decision, action: 'escalate' }, 'fix-script-failed');

    return {
      success:  false,
      action:   'auto-fix',
      message:  `Fix script failed: ${stderr.slice(0, 200)}`,
      script,
      error:    stderr
    };
  }
}

// ─── Webhook executor ──────────────────────────────────────────────────────

async function callWebhook(webhookUrl, payload) {
  if (!webhookUrl) {
    console.log(`   ⏭️  No project webhook configured`);
    return { called: false, reason: 'not configured' };
  }

  console.log(`   🌐 Calling project webhook: ${webhookUrl}`);

  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-AutoFlow': 'true' },
      body:    JSON.stringify({
        ...payload,
        timestamp:  new Date().toISOString(),
        autoflow:   true
      }),
      signal: AbortSignal.timeout(10000)   // 10 second timeout
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    console.log(`   ✅ Webhook called successfully (${res.status})`);
    return { called: true, status: res.status, url: webhookUrl };
  } catch (err) {
    console.error(`   ❌ Webhook failed: ${err.message}`);
    return { called: false, error: err.message, url: webhookUrl };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }