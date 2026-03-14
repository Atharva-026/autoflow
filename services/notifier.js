/**
 * AutoFlow Notifier
 * Uses the existing emailService.js for email.
 * Add SLACK_WEBHOOK_URL to .env to also enable Slack alerts.
 */

import { sendEscalationEmail } from './emailService.js';

const SEVERITY_COLOR = {
  critical: '#ff4b2b', high: '#f6ad55', medium: '#f6e05e', low: '#68d391'
};
const SEVERITY_EMOJI = {
  critical: '🚨', high: '⚠️', medium: '📊', low: 'ℹ️'
};

async function sendSlack(eventData, classification, decision, outcome) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('   ⏭️  Slack skipped (SLACK_WEBHOOK_URL not set in .env)');
    return { sent: false, reason: 'not configured' };
  }

  const sev = classification.severity;
  const payload = {
    text: `${SEVERITY_EMOJI[sev] || '⚡'} *AutoFlow Alert* — ${sev.toUpperCase()} on \`${eventData.metadata?.project || eventData.source}\``,
    attachments: [{
      color: SEVERITY_COLOR[sev] || '#999',
      fields: [
        { title: 'Message',     value: eventData.message || '—',               short: false },
        { title: 'Event Type',  value: eventData.type,                          short: true  },
        { title: 'Severity',    value: sev,                                     short: true  },
        { title: 'Action',      value: decision.action,                         short: true  },
        { title: 'Environment', value: eventData.metadata?.environment || '—',  short: true  },
        { title: 'AI Reasoning',value: classification.reasoning || '—',         short: false },
        { title: 'Outcome',     value: outcome,                                 short: true  }
      ],
      footer: `AutoFlow • ${new Date().toISOString()}`
    }]
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Slack ${res.status}: ${await res.text()}`);
    console.log('   ✅ Slack notification sent');
    return { sent: true };
  } catch (err) {
    console.error('   ❌ Slack failed:', err.message);
    return { sent: false, error: err.message };
  }
}

export async function notify(eventData, classification, decision, outcome = 'escalated') {
  console.log(`\n📣 Sending notifications (${classification.severity} — ${decision.action})`);

  const [emailResult, slackResult] = await Promise.allSettled([
    sendEscalationEmail(eventData, classification, decision),
    sendSlack(eventData, classification, decision, outcome)
  ]);

  const results = {
    email: emailResult.status === 'fulfilled' ? emailResult.value : { success: false, error: emailResult.reason?.message },
    slack: slackResult.status === 'fulfilled' ? slackResult.value : { sent: false,    error: slackResult.reason?.message }
  };

  const sent = [results.email?.success && 'email', results.slack?.sent && 'slack'].filter(Boolean);
  if (sent.length > 0) {
    console.log(`   ✅ Notified via: ${sent.join(', ')}`);
  } else {
    console.log(`   ⚠️  No notifications sent — check EMAIL_ENABLED=true in .env`);
  }

  return results;
} 