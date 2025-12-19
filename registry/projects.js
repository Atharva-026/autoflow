/**
 * Project Registry
 * Defines all services/projects in the system
 */

export const projects = {
  'auth-service': {
    name: 'Authentication Service',
    environment: 'production',
    owner: 'security-team',
    criticality: 'high',
    dependencies: ['user-database', 'redis-cache'],
    contacts: {
      slack: '#security-alerts',
      email: 'security-team@company.com',
      pagerduty: 'security-oncall'
    }
  },
  'payment-gateway': {
    name: 'Payment Processing Gateway',
    environment: 'production',
    owner: 'payments-team',
    criticality: 'critical',
    dependencies: ['stripe-api', 'payment-database'],
    contacts: {
      slack: '#payments-critical',
      email: 'payments-team@company.com',
      pagerduty: 'payments-oncall'
    }
  },
  'user-service': {
    name: 'User Management Service',
    environment: 'production',
    owner: 'backend-team',
    criticality: 'high',
    dependencies: ['user-database', 'email-service'],
    contacts: {
      slack: '#backend-alerts',
      email: 'backend-team@company.com'
    }
  },
  'notification-service': {
    name: 'Notification Service',
    environment: 'production',
    owner: 'platform-team',
    criticality: 'medium',
    dependencies: ['email-service', 'sms-gateway'],
    contacts: {
      slack: '#platform-alerts',
      email: 'platform-team@company.com'
    }
  },
  'analytics-pipeline': {
    name: 'Analytics Data Pipeline',
    environment: 'production',
    owner: 'data-team',
    criticality: 'low',
    dependencies: ['data-warehouse', 'kafka'],
    contacts: {
      slack: '#data-alerts',
      email: 'data-team@company.com'
    }
  }
};

/**
 * Get project information
 */
export function getProject(projectId) {
  return projects[projectId] || null;
}

/**
 * Get all projects
 */
export function getAllProjects() {
  return Object.entries(projects).map(([id, info]) => ({
    id,
    ...info
  }));
}

/**
 * Get projects by owner
 */
export function getProjectsByOwner(owner) {
  return Object.entries(projects)
    .filter(([_, info]) => info.owner === owner)
    .map(([id, info]) => ({ id, ...info }));
}

/**
 * Get projects by criticality
 */
export function getProjectsByCriticality(criticality) {
  return Object.entries(projects)
    .filter(([_, info]) => info.criticality === criticality)
    .map(([id, info]) => ({ id, ...info }));
}

/**
 * Get project health summary
 */
export function getProjectHealth(projectId, recentEvents) {
  const project = getProject(projectId);
  if (!project) return null;

  const projectEvents = recentEvents.filter(e => 
    e.metadata?.project === projectId
  );

  const criticalCount = projectEvents.filter(e => 
    e.severity === 'critical' && e.status !== 'completed'
  ).length;

  const highCount = projectEvents.filter(e => 
    e.severity === 'high' && e.status !== 'completed'
  ).length;

  const failedCount = projectEvents.filter(e => 
    e.status === 'failed'
  ).length;

  let health = 'healthy';
  if (criticalCount > 0 || failedCount > 2) {
    health = 'critical';
  } else if (highCount > 2) {
    health = 'degraded';
  } else if (highCount > 0) {
    health = 'warning';
  }

  return {
    project: projectId,
    name: project.name,
    health,
    stats: {
      total: projectEvents.length,
      critical: criticalCount,
      high: highCount,
      failed: failedCount
    },
    recentEvents: projectEvents.slice(-5)
  };
}