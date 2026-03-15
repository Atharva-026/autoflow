/**
 * Policy Engine
 * Environment policies are static (sensible defaults).
 * Project-level overrides come from the DB (editable via API/dashboard).
 */

import { getProject } from '../registry/projects.js';

// ─── Static environment policies ──────────────────────────────────────────

const ENV_POLICIES = {
  production: {
    critical: { action: 'require_approval', reasoning: 'Critical production issues require human approval' },
    high:     { action: 'auto-fix',         reasoning: 'High severity — attempt automated fix first',  maxRetries: 2 },
    medium:   { action: 'monitor',          reasoning: 'Medium severity — monitor and follow up' },
    low:      { action: 'ignore',           reasoning: 'Low severity — safe to ignore' }
  },
  staging: {
    critical: { action: 'auto-fix', reasoning: 'Staging allows aggressive auto-fix', maxRetries: 3 },
    high:     { action: 'auto-fix', reasoning: 'Staging allows aggressive auto-fix', maxRetries: 3 },
    medium:   { action: 'auto-fix', reasoning: 'Staging can auto-fix medium issues',  maxRetries: 2 },
    low:      { action: 'ignore',   reasoning: 'Low severity ignored in staging' }
  },
  development: {
    critical: { action: 'auto-fix', reasoning: 'Dev — full automation allowed' },
    high:     { action: 'auto-fix', reasoning: 'Dev — full automation allowed' },
    medium:   { action: 'ignore',   reasoning: 'Dev medium issues ignored' },
    low:      { action: 'ignore',   reasoning: 'Dev low issues ignored' }
  }
};

// ─── Apply policies ────────────────────────────────────────────────────────

export function applyPolicies(eventData, classification, aiDecision) {
  const projectId  = eventData.metadata?.project;
  const environment = eventData.metadata?.environment || 'production';
  const severity    = classification.severity;

  console.log(`\n📋 Applying policies for ${environment}/${severity}...`);

  // 1. Project-level override (from DB — editable via dashboard)
  if (projectId) {
    const project = getProject(projectId);
    const override = project?.policyOverride;

    if (override) {
      // Full project override (e.g. payment-gateway always requires approval)
      if (override.overrideAll) {
        console.log(`🔒 Project policy override: ${override.overrideAll}`);
        return {
          action:          override.overrideAll,
          priority:        severity,
          reasoning:       override.reasoning || `Project policy: ${override.overrideAll}`,
          aiSuggestion:    aiDecision.action,
          policyApplied:   true,
          policySource:    `project:${projectId}`,
          requiresApproval: override.overrideAll === 'require_approval',
          parameters:      aiDecision.parameters
        };
      }

      // Severity-specific project override
      if (override[severity]) {
        const rule = override[severity];
        console.log(`🔒 Project-severity override: ${rule.action}`);
        return {
          action:          rule.action,
          priority:        severity,
          reasoning:       rule.reasoning,
          aiSuggestion:    aiDecision.action,
          policyApplied:   true,
          policySource:    `project:${projectId}:${severity}`,
          requiresApproval: rule.action === 'require_approval',
          parameters:      aiDecision.parameters
        };
      }
    }
  }

  // 2. Environment policy
  const envPolicy = (ENV_POLICIES[environment] || ENV_POLICIES.production)[severity];

  if (!envPolicy) {
    console.log(`✅ No policy match — using AI decision`);
    return { ...aiDecision, policyApplied: false, requiresApproval: false };
  }

  if (envPolicy.action !== aiDecision.action) {
    console.log(`⚠️  Policy overrides AI: ${envPolicy.action} (AI said: ${aiDecision.action})`);
    return {
      action:          envPolicy.action,
      priority:        severity,
      reasoning:       `${envPolicy.reasoning} (AI suggested: ${aiDecision.action})`,
      aiSuggestion:    aiDecision.action,
      policyApplied:   true,
      policySource:    `${environment}:${severity}`,
      requiresApproval: envPolicy.action === 'require_approval',
      parameters:      { ...aiDecision.parameters, maxRetries: envPolicy.maxRetries }
    };
  }

  console.log(`✅ Policy agrees with AI: ${aiDecision.action}`);
  return {
    ...aiDecision,
    policyApplied:   true,
    policySource:    `${environment}:${severity}`,
    requiresApproval: envPolicy.action === 'require_approval',
    parameters:      { ...aiDecision.parameters, maxRetries: envPolicy.maxRetries }
  };
}

export function requiresApproval(decision) {
  return decision.requiresApproval === true || decision.action === 'require_approval';
}

export function getAllPolicies() {
  return { environmentPolicies: ENV_POLICIES };
}