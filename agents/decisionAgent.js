import dotenv from 'dotenv';
dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

// ─── Core AI caller (Groq only) ────────────────────────────────────────────
async function callAI(prompt) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set in .env');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens:  500
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ─── JSON extractor ────────────────────────────────────────────────────────
function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) { try { return JSON.parse(block[1].trim()); } catch {} }
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj)   { try { return JSON.parse(obj[0]); } catch {} }
  throw new Error(`No JSON in response: ${text.slice(0, 200)}`);
}

// ─── Event Classifier ──────────────────────────────────────────────────────
export async function classifyEvent(eventData, runbookHint = '', confidenceHint = '') {
  console.log(`🤖 Classifying event via Groq (${GROQ_MODEL})...`);

  const prompt = `You are an operational event classifier for a backend monitoring system.
Analyze this event and respond with ONLY a valid JSON object, no explanation.

Event:
- Type: ${eventData.type}
- Source: ${eventData.source}
- Message: ${eventData.message || 'N/A'}
- Severity hint: ${eventData.severity || 'unknown'}
- Project: ${eventData.metadata?.project || 'unknown'}
- Environment: ${eventData.metadata?.environment || 'production'}
${runbookHint ? `\nPast resolution: ${runbookHint}` : ''}
${confidenceHint ? `\nApproval patterns: ${confidenceHint}` : ''}

Rules:
- critical: payment failures, auth breaches, data loss, complete outages
- high: database errors, service crashes, repeated failures, timeouts
- medium: rate limits, slow responses, validation errors, warnings
- low: informational events, successful ops, minor warnings

Return ONLY this JSON (no markdown, no explanation):
{
  "severity": "low|medium|high|critical",
  "category": "error|alert|info|warning",
  "confidence": 0.0,
  "reasoning": "one sentence explanation"
}`;

  try {
    const text           = await callAI(prompt);
    const classification = extractJSON(text);
    if (!classification.severity || !classification.category) throw new Error('Missing required fields');
    console.log(`✅ AI Classified: ${classification.severity} severity (confidence: ${classification.confidence})`);
    console.log(`   Reasoning: ${classification.reasoning}`);
    return classification;
  } catch (error) {
    console.error('❌ AI classification error:', error.message);
    let severity = eventData.severity || 'medium';
    const msg = (eventData.message || '').toLowerCase();
    if (msg.includes('payment') || msg.includes('auth'))     severity = 'critical';
    else if (msg.includes('timeout') || msg.includes('crash')) severity = 'high';
    return { severity, category: eventData.type || 'error', confidence: 0.55,
             reasoning: `Rule-based fallback (AI error: ${error.message.slice(0, 60)})` };
  }
}

// ─── Action Decider ────────────────────────────────────────────────────────
export async function decideAction(eventData, classification, runbookHint = '', confidenceHint = '') {
  console.log(`🤖 Deciding action via Groq...`);

  const prompt = `You are an autonomous incident response agent for a production backend system.
Based on the event below, decide the best action. Respond with ONLY valid JSON.

Event:
- Type: ${eventData.type}
- Source: ${eventData.source}
- Message: ${eventData.message || 'N/A'}
- Project: ${eventData.metadata?.project || 'unknown'}
- Environment: ${eventData.metadata?.environment || 'production'}
${runbookHint ? `\nPast resolution: ${runbookHint}` : ''}
${confidenceHint ? `\nApproval patterns (use to calibrate your recommendation): ${confidenceHint}` : ''}

AI Classification:
- Severity: ${classification.severity}
- Category: ${classification.category}
- Confidence: ${classification.confidence}
- Reasoning: ${classification.reasoning}

Action guidelines:
- "ignore": low severity, informational, no user impact
- "monitor": medium severity, watch for escalation
- "auto-fix": high severity with known automated remediation
- "escalate": critical severity, unknown cause, needs human, security/financial impact

Return ONLY this JSON (no markdown, no explanation):
{
  "action": "ignore|monitor|auto-fix|escalate",
  "priority": "low|medium|high|critical",
  "reasoning": "one sentence why this action",
  "parameters": {
    "retryCount": 3,
    "timeout": 300,
    "notifyChannels": ["slack"]
  }
}`;

  try {
    const text     = await callAI(prompt);
    const decision = extractJSON(text);
    if (!decision.action) throw new Error('Missing action field');
    console.log(`✅ AI Decision: ${decision.action} (priority: ${decision.priority})`);
    console.log(`   Reasoning: ${decision.reasoning}`);
    return decision;
  } catch (error) {
    console.error('❌ AI decision error:', error.message);
    const fallback = classification.severity === 'critical' ? 'escalate'
                   : classification.severity === 'high'     ? 'auto-fix'
                   : classification.severity === 'medium'   ? 'monitor' : 'ignore';
    return { action: fallback, priority: classification.severity,
             reasoning: `Rule-based fallback (AI error: ${error.message.slice(0, 60)})`,
             parameters: { retryCount: 3, timeout: 300, notifyChannels: ['slack'] } };
  }
}

// ─── Summary Generator ─────────────────────────────────────────────────────
export async function generateSummary(workflowData) {
  const prompt = `Write a 2-sentence incident summary for an ops dashboard. Be specific and factual.

Incident:
- Event type: ${workflowData.eventType}
- Severity: ${workflowData.classification.severity}
- AI reasoning: ${workflowData.classification.reasoning}
- Action taken: ${workflowData.decision.action}
- Action reasoning: ${workflowData.decision.reasoning}
- Outcome: ${workflowData.outcome}

Write only the 2 sentences, no labels or formatting.`;

  try {
    const summary = await callAI(prompt);
    return summary.trim();
  } catch (error) {
    console.error('❌ Summary error:', error.message);
    return `${workflowData.classification.severity.toUpperCase()} ${workflowData.eventType} event detected. Action taken: ${workflowData.decision.action} — outcome: ${workflowData.outcome}.`;
  }
}