/**
 * Project Registry — now backed by SQLite
 * All functions are backwards-compatible with the rest of the codebase.
 */

import { projectsDB, eventsDB } from '../db/database.js';

// ─── Default projects (seeded once into DB on first run) ───────────────────

const DEFAULTS = [
  {
    id: 'auth-service', name: 'Authentication Service',
    environment: 'production', owner: 'security-team', criticality: 'high',
    contacts: { slack: '#security-alerts', email: 'security-team@company.com' },
    policyOverride: { critical: { action: 'escalate', reasoning: 'Auth issues escalate immediately — security critical' } },
    webhookUrl: null, fixScript: null
  },
  {
    id: 'payment-gateway', name: 'Payment Processing Gateway',
    environment: 'production', owner: 'payments-team', criticality: 'critical',
    contacts: { slack: '#payments-critical', email: 'payments-team@company.com' },
    policyOverride: { overrideAll: 'require_approval', reasoning: 'Payment system changes always need approval' },
    webhookUrl: null, fixScript: null
  },
  {
    id: 'user-service', name: 'User Management Service',
    environment: 'production', owner: 'backend-team', criticality: 'high',
    contacts: { slack: '#backend-alerts', email: 'backend-team@company.com' },
    policyOverride: null, webhookUrl: null, fixScript: null
  },
  {
    id: 'notification-service', name: 'Notification Service',
    environment: 'production', owner: 'platform-team', criticality: 'medium',
    contacts: { slack: '#platform-alerts', email: 'platform-team@company.com' },
    policyOverride: null, webhookUrl: null, fixScript: null
  },
  {
    id: 'analytics-pipeline', name: 'Analytics Data Pipeline',
    environment: 'production', owner: 'data-team', criticality: 'low',
    contacts: { slack: '#data-alerts', email: 'data-team@company.com' },
    policyOverride: null, webhookUrl: null, fixScript: null
  }
];

// Seed on module load
projectsDB.seed(DEFAULTS);

// ─── Public API (same interface as before + new CRUD) ──────────────────────

export function getProject(id)      { return projectsDB.getById(id); }
export function getAllProjects()     { return projectsDB.getAll(); }
export function createProject(data) { return projectsDB.insert(data); }
export function updateProject(id, data) { return projectsDB.update(id, data); }
export function deleteProject(id)   { return projectsDB.delete(id); }

export function getProjectHealth(projectId, recentEvents = []) {
  const project = getProject(projectId);
  if (!project) return null;

  // If no events passed in, load from DB
  const events = recentEvents.length > 0
    ? recentEvents.filter(e => (e.metadata?.project || e.project) === projectId)
    : eventsDB.getAll({ project: projectId, limit: 100 });

  const criticalCount = events.filter(e => e.severity === 'critical' && e.status !== 'completed').length;
  const highCount     = events.filter(e => e.severity === 'high'     && e.status !== 'completed').length;
  const failedCount   = events.filter(e => e.status === 'failed').length;

  let health = 'healthy';
  if (criticalCount > 0 || failedCount > 2) health = 'critical';
  else if (highCount > 2)                    health = 'degraded';
  else if (highCount > 0)                    health = 'warning';

  return {
    project: projectId,
    name:    project.name,
    health,
    stats:   { total: events.length, critical: criticalCount, high: highCount, failed: failedCount },
    recentEvents: events.slice(0, 5)
  };
}