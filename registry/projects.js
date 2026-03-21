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

  // Load from DB if not passed in
  const events = recentEvents.length > 0
    ? recentEvents.filter(e => (e.metadata?.project || e.project) === projectId)
    : eventsDB.getAll({ project: projectId, limit: 100 });

  const now = Date.now();
  const last24h = events.filter(e => (now - new Date(e.created_at).getTime()) < 86400000);
  const last1h  = events.filter(e => (now - new Date(e.created_at).getTime()) < 3600000);

  // Open incidents (not yet completed)
  const openCritical = events.filter(e => e.severity === 'critical' && e.status !== 'completed').length;
  const openHigh     = events.filter(e => e.severity === 'high'     && e.status !== 'completed').length;
  const failedCount  = events.filter(e => e.status === 'failed').length;

  // Resolution rate
  const completed   = events.filter(e => e.status === 'completed').length;
  const total       = events.length;
  const resolveRate = total > 0 ? Math.round((completed / total) * 100) : 100;

  // Health status
  let health = 'healthy';
  let healthReason = 'No active incidents';
  if (openCritical > 0 || failedCount > 2) {
    health = 'critical';
    healthReason = openCritical > 0
      ? `${openCritical} unresolved critical incident${openCritical > 1 ? 's' : ''}`
      : `${failedCount} failed workflows`;
  } else if (openHigh > 2) {
    health = 'degraded';
    healthReason = `${openHigh} unresolved high-severity incidents`;
  } else if (openHigh > 0) {
    health = 'warning';
    healthReason = `${openHigh} high-severity incident${openHigh > 1 ? 's' : ''} under review`;
  }

  // Most recent incident
  const lastIncident = events.length > 0 ? events[0] : null;

  return {
    // Core fields — for embedding in status pages / CI pipelines
    project:      projectId,
    name:         project.name,
    health,                           // healthy | warning | degraded | critical
    healthReason,
    owner:        project.owner,
    criticality:  project.criticality,
    environment:  project.environment,
    checkedAt:    new Date().toISOString(),

    // Incident counts
    openIncidents: {
      critical: openCritical,
      high:     openHigh,
      total:    openCritical + openHigh
    },

    // Activity windows
    activity: {
      last1h:  last1h.length,
      last24h: last24h.length,
      total:   total
    },

    // Performance
    resolutionRate: resolveRate,
    failedWorkflows: failedCount,

    // Last incident summary
    lastIncident: lastIncident ? {
      id:        lastIncident.id,
      message:   lastIncident.message,
      severity:  lastIncident.severity,
      status:    lastIncident.status,
      timestamp: lastIncident.created_at
    } : null,

    // Contact info
    contacts: project.contacts || {}
  };
  }