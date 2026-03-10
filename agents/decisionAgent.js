import dotenv from 'dotenv';
dotenv.config();

// ─── Provider Config ───────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Groq free models (fast & capable)
// Options: llama-3.3-70b-versatile | llama3-8b-8192 | mixtral-8x7b-32768 | gemma2-9b-it
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ─── Core AI Caller ────────────────────────────────────────────────────────
async function callAI(prompt) {

  // PRIMARY: Groq (free, very fast)
  if (GROQ_API_KEY) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,      // Lower = more consistent JSON output
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // FALLBACK: Anthropic (if no Groq key but has Anthropic key)
  if (ANTHROPIC_API_KEY) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  throw new Error('No AI provider configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY in .env');
}

// ─── JSON Extractor ────────────────────────────────────────────────────────
function extractJSON(text) {
  // Try direct parse first
  try { return JSON.parse(text.trim()); } catch {}

  // Try extracting from markdown code blocks
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch {}
  }

  // Try extracting raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }

  throw new Error(`Could not extract JSON from AI response: ${text.slice(0, 200)}`);
}

// ─── Event Classifier ──────────────────────────────────────────────────────
export async function classifyEvent(eventData) {
  const provider = GROQ_API_KEY ? 'Groq' : ANTHROPIC_API_KEY ? 'Anthropic' : 'None';
  console.log(`🤖 Classifying event via ${provider} (${GROQ_MODEL})...`);

  const prompt = `You are an operational event classifier for a backend monitoring system.
Analyze this event and respond with ONLY a valid JSON object, no explanation.

Event:
- Type: ${eventData.type}
- Source: ${eventData.source}
- Message: ${eventData.message || 'N/A'}
- Severity hint: ${eventData.severity || 'unknown'}
- Project: ${eventData.metadata?.project || 'unknown'}
- Environment: ${eventData.metadata?.environment || 'production'}

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
    const text = await callAI(prompt);
    const classification = extractJSON(text);

    // Validate required fields
    if (!classification.severity || !classification.category) {
      throw new Error('Missing required fields in classification response');
    }

    console.log(`✅ AI Classified: ${classification.severity} severity (confidence: ${classification.confidence})`);
    console.log(`   Reasoning: ${classification.reasoning}`);
    return classification;

  } catch (error) {
    console.error('❌ AI classification error:', error.message);

    // Smart rule-based fallback
    let severity = eventData.severity || 'medium';
    // Normalize severity from message keywords
    const msg = (eventData.message || '').toLowerCase();
    if (msg.includes('payment') || msg.includes('auth') || msg.includes('breach')) severity = 'critical';
    else if (msg.includes('crash') || msg.includes('timeout') || msg.includes('database')) severity = 'high';
    else if (msg.includes('warn') || msg.includes('rate limit') || msg.includes('slow')) severity = 'medium';

    return {
      severity,
      category: eventData.type || 'error',
      confidence: 0.55,
      reasoning: `Rule-based fallback (AI error: ${error.message.slice(0, 60)})`
    };
  }
}

// ─── Action Decider ────────────────────────────────────────────────────────
export async function decideAction(eventData, classification) {
  const provider = GROQ_API_KEY ? 'Groq' : 'Anthropic';
  console.log(`🤖 Deciding action via ${provider}...`);

  const prompt = `You are an autonomous incident response agent for a production backend system.
Based on the event below, decide the best action. Respond with ONLY valid JSON.

Event:
- Type: ${eventData.type}
- Source: ${eventData.source}  
- Message: ${eventData.message || 'N/A'}
- Project: ${eventData.metadata?.project || 'unknown'}
- Environment: ${eventData.metadata?.environment || 'production'}

AI Classification:
- Severity: ${classification.severity}
- Category: ${classification.category}
- Confidence: ${classification.confidence}
- Reasoning: ${classification.reasoning}

Action guidelines:
- "ignore": low severity, informational, no impact on users
- "monitor": medium severity, watch for escalation, schedule follow-up
- "auto-fix": high severity with known automated remediation (restart, reconnect, clear cache)
- "escalate": critical severity, unknown cause, needs human, security issues, financial impact

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
    const text = await callAI(prompt);
    const decision = extractJSON(text);

    if (!decision.action) {
      throw new Error('Missing action field in decision response');
    }

    console.log(`✅ AI Decision: ${decision.action} (priority: ${decision.priority})`);
    console.log(`   Reasoning: ${decision.reasoning}`);
    return decision;

  } catch (error) {
    console.error('❌ AI decision error:', error.message);

    const fallbackAction =
      classification.severity === 'critical' ? 'escalate' :
      classification.severity === 'high'     ? 'auto-fix' :
      classification.severity === 'medium'   ? 'monitor'  : 'ignore';

    return {
      action: fallbackAction,
      priority: classification.severity,
      reasoning: `Rule-based fallback (AI error: ${error.message.slice(0, 60)})`,
      parameters: { retryCount: 3, timeout: 300, notifyChannels: ['slack'] }
    };
  }
}

// ─── Summary Generator ─────────────────────────────────────────────────────
export async function generateSummary(workflowData) {
  const prompt = `Write a 2-sentence incident summary for an ops dashboard. Be specific and factual.

Incident data:
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
    return `${workflowData.classification.severity.toUpperCase()} ${workflowData.eventType} event detected from ${workflowData.decision.reasoning}. Action taken: ${workflowData.decision.action} — outcome: ${workflowData.outcome}.`;
  }
}