import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

// Configuration - choose AI provider
const USE_OPENROUTER = process.env.USE_OPENROUTER === 'true';
const MOCK_MODE = false; // Set to true if you want mock data

// Initialize clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Call AI API (OpenRouter or Anthropic)
 */
async function callAI(prompt) {
  if (USE_OPENROUTER) {
    // Use OpenRouter with FREE models
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AutoFlow Hackathon'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku', // FREE Claude model!
        // Alternative free models:
        // model: 'meta-llama/llama-3.1-8b-instruct:free',
        // model: 'google/gemini-flash-1.5',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
    
  } else {
    // Use Anthropic
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    return response.content[0].text;
  }
}

/**
 * AI Agent that classifies events
 */
export async function classifyEvent(eventData) {
  // MOCK MODE for offline demo
  if (MOCK_MODE) {
    console.log('🤖 AI Classification (Mock Mode)');
    
    let severity = 'medium';
    let category = eventData.type || 'info';
    
    if (eventData.severity === 'critical' || eventData.message?.includes('critical')) {
      severity = 'critical';
    } else if (eventData.severity === 'high' || eventData.type === 'error' || eventData.message?.includes('timeout')) {
      severity = 'high';
    } else if (eventData.severity === 'low' || eventData.type === 'info') {
      severity = 'low';
    }
    
    return {
      severity,
      category,
      confidence: 0.92,
      reasoning: `${eventData.type} event from ${eventData.source} indicates ${severity} priority operational issue`
    };
  }
  
  // REAL AI MODE
  const prompt = `You are an operational event classifier. Analyze this event and return ONLY a JSON object.

Event Details:
- Type: ${eventData.type}
- Source: ${eventData.source}
- Message: ${eventData.message || 'N/A'}
- Metadata: ${JSON.stringify(eventData.metadata || {})}

Respond with this exact JSON structure (nothing else):
{
  "severity": "low|medium|high|critical",
  "category": "error|alert|info|warning",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

  try {
    console.log(`🤖 Calling ${USE_OPENROUTER ? 'OpenRouter' : 'Anthropic'} API...`);
    const text = await callAI(prompt);
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }
    
    const classification = JSON.parse(jsonMatch[0]);
    console.log('✅ AI Classification:', classification);
    
    return classification;
    
  } catch (error) {
    console.error('❌ AI classification error:', error.message);
    
    // Intelligent fallback
    let severity = 'medium';
    if (eventData.severity === 'critical') severity = 'critical';
    else if (eventData.severity === 'high' || eventData.type === 'error') severity = 'high';
    else if (eventData.severity === 'low') severity = 'low';
    
    return {
      severity,
      category: eventData.type || 'info',
      confidence: 0.6,
      reasoning: 'AI unavailable, using rule-based classification'
    };
  }
}

/**
 * AI Agent that decides what action to take
 */
export async function decideAction(eventData, classification) {
  // MOCK MODE
  if (MOCK_MODE) {
    console.log('🤖 AI Decision (Mock Mode)');
    
    let action = 'monitor';
    let reasoning = '';
    
    if (classification.severity === 'critical') {
      action = 'escalate';
      reasoning = 'Critical severity requires immediate human intervention';
    } else if (classification.severity === 'high') {
      action = 'auto-fix';
      reasoning = 'High severity error - attempting automated remediation';
    } else if (classification.severity === 'low') {
      action = 'ignore';
      reasoning = 'Low severity informational event requires no action';
    } else {
      action = 'monitor';
      reasoning = 'Medium severity - monitoring with follow-up';
    }
    
    return {
      action,
      priority: classification.severity,
      reasoning,
      parameters: {
        retryCount: action === 'auto-fix' ? 3 : 0,
        timeout: action === 'escalate' ? 60 : 300,
        notifyChannels: action === 'escalate' ? ['slack', 'email'] : []
      }
    };
  }
  
  // REAL AI MODE
  const prompt = `You are an operational decision agent. Based on the event and classification, decide what action to take.

Event:
- Type: ${eventData.type}
- Source: ${eventData.source}
- Message: ${eventData.message || 'N/A'}

Classification:
- Severity: ${classification.severity}
- Category: ${classification.category}

Available actions:
1. "ignore" - not important
2. "auto-fix" - automated remediation
3. "escalate" - notify humans
4. "monitor" - watch and follow-up

Respond with this exact JSON structure (nothing else):
{
  "action": "ignore|auto-fix|escalate|monitor",
  "priority": "low|medium|high|critical",
  "reasoning": "why this action",
  "parameters": {
    "retryCount": 3,
    "timeout": 300,
    "notifyChannels": ["slack"]
  }
}`;

  try {
    console.log(`🤖 Calling ${USE_OPENROUTER ? 'OpenRouter' : 'Anthropic'} API...`);
    const text = await callAI(prompt);
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }
    
    const decision = JSON.parse(jsonMatch[0]);
    console.log('✅ AI Decision:', decision);
    
    return decision;
    
  } catch (error) {
    console.error('❌ AI decision error:', error.message);
    
    const fallbackAction = classification.severity === 'critical' 
      ? 'escalate' 
      : classification.severity === 'high'
      ? 'auto-fix'
      : 'monitor';
    
    return {
      action: fallbackAction,
      priority: classification.severity,
      reasoning: 'AI unavailable, using rule-based decision',
      parameters: {
        retryCount: 3,
        timeout: 300
      }
    };
  }
}

/**
 * Generate summary
 */
export async function generateSummary(workflowData) {
  if (MOCK_MODE) {
    const { eventType, classification, decision, outcome } = workflowData;
    return `Processed ${eventType} event (${classification.severity} severity). AI decided to ${decision.action}. Status: ${outcome}.`;
  }
  
  const prompt = `Summarize in 2 sentences:
Event: ${workflowData.eventType}
Severity: ${workflowData.classification.severity}
Action: ${workflowData.decision.action}
Outcome: ${workflowData.outcome}`;

  try {
    const summary = await callAI(prompt);
    return summary;
  } catch (error) {
    console.error('❌ Summary error:', error.message);
    return `Workflow executed. Event: ${workflowData.eventType}, Action: ${workflowData.decision.action}.`;
  }
}