/**
 * Policy Engine
 * Defines rules that override or guide AI decisions
 */

const policies = {
  // Environment-based policies
  production: {
    critical: {
      action: 'require_approval',
      reasoning: 'Critical production issues require human approval before automated actions'
    },
    high: {
      action: 'auto_fix',
      maxRetries: 2,
      reasoning: 'High severity can auto-fix with limited retries'
    },
    medium: {
      action: 'monitor',
      reasoning: 'Medium severity should be monitored'
    },
    low: {
      action: 'ignore',
      reasoning: 'Low severity can be safely ignored'
    }
  },
  
  staging: {
    critical: {
      action: 'auto_fix',
      maxRetries: 3,
      reasoning: 'Staging allows aggressive auto-fix'
    },
    high: {
      action: 'auto_fix',
      maxRetries: 3,
      reasoning: 'Staging allows aggressive auto-fix'
    },
    medium: {
      action: 'auto_fix',
      maxRetries: 2,
      reasoning: 'Staging can auto-fix medium issues'
    },
    low: {
      action: 'ignore',
      reasoning: 'Low severity ignored in staging'
    }
  },
  
  development: {
    critical: {
      action: 'auto_fix',
      reasoning: 'Dev environment allows full automation'
    },
    high: {
      action: 'auto_fix',
      reasoning: 'Dev environment allows full automation'
    },
    medium: {
      action: 'ignore',
      reasoning: 'Dev medium issues can be ignored'
    },
    low: {
      action: 'ignore',
      reasoning: 'Dev low issues ignored'
    }
  }
};

// Project-specific overrides
const projectPolicies = {
  'payment-gateway': {
    // Payments always require approval
    overrideAll: 'require_approval',
    reasoning: 'Payment system changes always need approval due to financial impact'
  },
  'auth-service': {
    critical: {
      action: 'escalate',
      reasoning: 'Auth issues escalate immediately - security critical'
    }
  }
};

/**
 * Apply policies to AI decision
 */
export function applyPolicies(eventData, classification, aiDecision) {
  const project = eventData.metadata?.project;
  const environment = eventData.metadata?.environment || 'production';
  const severity = classification.severity;

  console.log(`\n📋 Applying policies for ${environment}/${severity}...`);

  // Check project-specific overrides first
  if (project && projectPolicies[project]) {
    const projectPolicy = projectPolicies[project];
    
    // Complete override for project
    if (projectPolicy.overrideAll) {
      console.log(`🔒 Project policy override: ${projectPolicy.overrideAll}`);
      return {
        action: projectPolicy.overrideAll,
        priority: severity,
        reasoning: projectPolicy.reasoning,
        aiSuggestion: aiDecision.action,
        policyApplied: true,
        policySource: `project:${project}`,
        requiresApproval: projectPolicy.overrideAll === 'require_approval',
        parameters: aiDecision.parameters
      };
    }
    
    // Severity-specific project override
    if (projectPolicy[severity]) {
      console.log(`🔒 Project-severity policy override: ${projectPolicy[severity].action}`);
      return {
        action: projectPolicy[severity].action,
        priority: severity,
        reasoning: projectPolicy[severity].reasoning,
        aiSuggestion: aiDecision.action,
        policyApplied: true,
        policySource: `project:${project}:${severity}`,
        requiresApproval: projectPolicy[severity].action === 'require_approval',
        parameters: aiDecision.parameters
      };
    }
  }

  // Apply environment-based policies
  const envPolicies = policies[environment] || policies.production;
  const policy = envPolicies[severity];

  if (!policy) {
    console.log(`✅ No policy match, using AI decision`);
    return {
      ...aiDecision,
      policyApplied: false,
      requiresApproval: false
    };
  }

  // Check if AI decision conflicts with policy
  if (policy.action !== aiDecision.action && policy.action !== 'auto_fix') {
    console.log(`⚠️ Policy overrides AI: ${policy.action} (AI suggested: ${aiDecision.action})`);
    
    return {
      action: policy.action,
      priority: severity,
      reasoning: `${policy.reasoning} (AI suggested: ${aiDecision.action})`,
      aiSuggestion: aiDecision.action,
      policyApplied: true,
      policySource: `${environment}:${severity}`,
      requiresApproval: policy.action === 'require_approval' || policy.action === 'escalate',
      parameters: {
        ...aiDecision.parameters,
        maxRetries: policy.maxRetries
      }
    };
  }

  // Policy agrees with AI
  console.log(`✅ Policy agrees with AI decision: ${aiDecision.action}`);
  return {
    ...aiDecision,
    policyApplied: true,
    policySource: `${environment}:${severity}`,
    requiresApproval: policy.action === 'require_approval',
    parameters: {
      ...aiDecision.parameters,
      maxRetries: policy.maxRetries
    }
  };
}

/**
 * Check if action requires approval
 */
export function requiresApproval(decision) {
  return decision.requiresApproval === true || 
         decision.action === 'require_approval';
}

/**
 * Get all policies
 */
export function getAllPolicies() {
  return {
    environmentPolicies: policies,
    projectPolicies
  };
}

/**
 * Get policy for specific context
 */
export function getPolicy(environment, severity, project) {
  // Check project override first
  if (project && projectPolicies[project]) {
    const projectPolicy = projectPolicies[project];
    if (projectPolicy.overrideAll) {
      return {
        ...projectPolicy,
        action: projectPolicy.overrideAll,
        source: 'project_override'
      };
    }
    if (projectPolicy[severity]) {
      return {
        ...projectPolicy[severity],
        source: 'project_severity'
      };
    }
  }

  // Get environment policy
  const envPolicies = policies[environment] || policies.production;
  return {
    ...envPolicies[severity],
    source: 'environment'
  };
}