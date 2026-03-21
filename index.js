import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { eventsDB, logsDB, analyticsDB } from './db/database.js';
import handleOperationalEvent from './workflows/handleEvent.js';
import { getAllProjects, getProject, createProject, updateProject, deleteProject, getProjectHealth } from './registry/projects.js';
import { getCorrelationStats } from './correlation/eventCorrelator.js';
import { getAllPolicies } from './policies/policyEngine.js';
import {
  getPendingApprovals,
  approveAction,
  rejectAction,
  getApprovalStats,
  getApprovalHistory
} from './approvals/approvalManager.js';

// SSE clients (in-memory is fine — they reconnect on restart)
const sseClients = [];

function broadcastLog(log) {
  const data = `data: ${JSON.stringify(log)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      if (sseClients[i].destroyed) { sseClients.splice(i, 1); continue; }
      sseClients[i].write(data);
    } catch { sseClients.splice(i, 1); }
  }
}

// ─── Request Handler ───────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // ── SSE Stream ──────────────────────────────────────────────────────────
  if (req.url === '/api/logs/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    sseClients.push(res);
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'AutoFlow live stream connected' })}\n\n`);
    req.on('close', () => { const i = sseClients.indexOf(res); if (i !== -1) sseClients.splice(i, 1); });
    return;
  }

  // ── Health ──────────────────────────────────────────────────────────────
  if (req.url === '/api/health' && req.method === 'GET') {
    json(res, {
      status: 'ok',
      message: 'AutoFlow running',
      timestamp: new Date().toISOString(),
      activeStreams: sseClients.length,
      storage: 'SQLite (persistent)'
    });
    return;
  }

  // ── Projects ────────────────────────────────────────────────────────────
  // GET all projects
  if (req.url === '/api/projects' && req.method === 'GET') {
    json(res, { success: true, projects: getAllProjects() });
    return;
  }

  // POST /api/projects — create new project
  if (req.url === '/api/projects' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const data = JSON.parse(body);
      if (!data.id || !data.name) { json(res, { error: 'id and name are required' }, 400); return; }
      // Slugify id
      data.id = data.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      const project = createProject({ ...data, createdAt: new Date().toISOString() });
      broadcastLog({ type: 'project_created', project, timestamp: new Date().toISOString() });
      json(res, { success: true, project }, 201);
    } catch (e) { json(res, { error: e.message }, 400); }
    return;
  }

  // GET /api/projects/:id
  if (req.url.match(/^\/api\/projects\/[^\/]+$/) && req.method === 'GET') {
    const id = req.url.split('/')[3];
    const project = getProject(id);
    if (!project) { json(res, { error: 'Project not found' }, 404); return; }
    json(res, { success: true, project });
    return;
  }

  // PUT /api/projects/:id — update project
  if (req.url.match(/^\/api\/projects\/[^\/]+$/) && req.method === 'PUT') {
    const id   = req.url.split('/')[3];
    const body = await readBody(req);
    try {
      const data    = JSON.parse(body);
      const project = updateProject(id, data);
      broadcastLog({ type: 'project_updated', project, timestamp: new Date().toISOString() });
      json(res, { success: true, project });
    } catch (e) { json(res, { error: e.message }, 400); }
    return;
  }

  // DELETE /api/projects/:id
  if (req.url.match(/^\/api\/projects\/[^\/]+$/) && req.method === 'DELETE') {
    const id = req.url.split('/')[3];
    try {
      deleteProject(id);
      json(res, { success: true, message: `Project ${id} deleted` });
    } catch (e) { json(res, { error: e.message }, 400); }
    return;
  }

  // GET /api/projects/:id/health — rich health status for CI/status pages
  if (req.url.startsWith('/api/projects/') && req.url.includes('/health')) {
    const projectId = req.url.split('/')[3];
    const health    = getProjectHealth(projectId);

    if (!health) { json(res, { error: 'Project not found' }, 404); return; }

    // Support ?format=simple for lightweight CI checks
    const url    = new URL(req.url, 'http://localhost');
    const simple = url.searchParams.get('format') === 'simple';

    if (simple) {
      // Minimal response for CI pipelines / uptime monitors
      json(res, {
        project:  health.project,
        name:     health.name,
        health:   health.health,
        reason:   health.healthReason,
        ok:       health.health === 'healthy' || health.health === 'warning',
        checkedAt: health.checkedAt
      }, health.health === 'critical' ? 503 : 200);
      return;
    }

    json(res, { success: true, health }, health.health === 'critical' ? 503 : 200);
    return;
  }

  // GET /api/health/all — health summary for ALL projects
  if (req.url === '/api/health/all' && req.method === 'GET') {
    const projects = getAllProjects();
    const summary  = projects.map(p => {
      const h = getProjectHealth(p.id);
      return {
        project:     p.id,
        name:        p.name,
        health:      h?.health        || 'unknown',
        reason:      h?.healthReason  || '',
        openIncidents: h?.openIncidents?.total || 0,
        last24h:     h?.activity?.last24h || 0,
        criticality: p.criticality
      };
    });

    const counts = { healthy: 0, warning: 0, degraded: 0, critical: 0, unknown: 0 };
    summary.forEach(p => { counts[p.health] = (counts[p.health] || 0) + 1; });

    const overallHealth = counts.critical > 0 ? 'critical'
      : counts.degraded > 0 ? 'degraded'
      : counts.warning  > 0 ? 'warning'
      : 'healthy';

    json(res, {
      success:  true,
      overall:  overallHealth,
      counts,
      projects: summary,
      checkedAt: new Date().toISOString()
    }, counts.critical > 0 ? 503 : 200);
    return;
  }

  // ── Policies ────────────────────────────────────────────────────────────
  if (req.url === '/api/policies' && req.method === 'GET') {
    json(res, { success: true, policies: getAllPolicies() });
    return;
  }

  // ── Correlation ─────────────────────────────────────────────────────────
  if (req.url === '/api/correlation/stats' && req.method === 'GET') {
    json(res, { success: true, stats: getCorrelationStats() });
    return;
  }

  // ── Approvals ───────────────────────────────────────────────────────────
  if (req.url === '/api/approvals/pending' && req.method === 'GET') {
    json(res, { success: true, approvals: getPendingApprovals() });
    return;
  }

  if (req.url === '/api/approvals/stats' && req.method === 'GET') {
    json(res, { success: true, stats: getApprovalStats() });
    return;
  }

  if (req.url === '/api/approvals/history' && req.method === 'GET') {
    json(res, { success: true, history: getApprovalHistory() });
    return;
  }

  if (req.url.match(/\/api\/approvals\/.+\/approve/) && req.method === 'POST') {
    const approvalId = req.url.split('/')[3];
    const body = await readBody(req);
    try {
      const { approver, comments } = JSON.parse(body);
      const result = approveAction(approvalId, approver || 'operator', comments || '');
      broadcastLog({ type: 'approval_granted', approvalId, approver, timestamp: new Date().toISOString() });
      json(res, { success: true, approval: result });
    } catch (e) { json(res, { error: e.message }, 400); }
    return;
  }

  if (req.url.match(/\/api\/approvals\/.+\/reject/) && req.method === 'POST') {
    const approvalId = req.url.split('/')[3];
    const body = await readBody(req);
    try {
      const { approver, reason } = JSON.parse(body);
      const result = rejectAction(approvalId, approver || 'operator', reason || 'Rejected');
      broadcastLog({ type: 'approval_rejected', approvalId, approver, reason, timestamp: new Date().toISOString() });
      json(res, { success: true, approval: result });
    } catch (e) { json(res, { error: e.message }, 400); }
    return;
  }

  // ── Receive Event ────────────────────────────────────────────────────────
  if (req.url === '/api/event' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const eventData = JSON.parse(body);

      const event = {
        id:        `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        ...eventData,
        status: 'processing',
        metadata: {
          ...eventData.metadata,
          project:     eventData.metadata?.project     || 'unknown',
          environment: eventData.metadata?.environment || 'production'
        }
      };

      // Persist immediately
      eventsDB.insert(event);

      console.log(`\n✅ Event received: ${event.id}`);
      console.log(`   Type: ${event.type} | Source: ${event.source}`);
      console.log(`   Project: ${event.metadata.project} | Env: ${event.metadata.environment}\n`);

      broadcastLog({ type: 'event_received', eventId: event.id, event, timestamp: new Date().toISOString() });

      // Build observable context that streams every step to SSE
      const context = {
        step: async (name, fn) => {
          const startLog = { type: 'step_start', eventId: event.id, step: name, timestamp: new Date().toISOString() };
          logsDB.insert(event.id, startLog);
          broadcastLog(startLog);

          try {
            const result = await fn();
            const doneLog = { type: 'step_complete', eventId: event.id, step: name, result, timestamp: new Date().toISOString() };
            logsDB.insert(event.id, doneLog);
            broadcastLog(doneLog);
            return result;
          } catch (err) {
            const errLog = { type: 'step_error', eventId: event.id, step: name, error: err.message, timestamp: new Date().toISOString() };
            logsDB.insert(event.id, errLog);
            broadcastLog(errLog);
            throw err;
          }
        }
      };

      // Run workflow asynchronously
      handleOperationalEvent({ eventId: event.id, data: event }, context)
        .then(() => {
          eventsDB.updateStatus(event.id, 'completed');
          broadcastLog({ type: 'workflow_complete', eventId: event.id, timestamp: new Date().toISOString() });
          console.log(`🎉 Workflow complete: ${event.id}\n`);
        })
        .catch(err => {
          eventsDB.updateStatus(event.id, 'failed');
          broadcastLog({ type: 'workflow_failed', eventId: event.id, error: err.message, timestamp: new Date().toISOString() });
          console.error(`❌ Workflow failed: ${err.message}\n`);
        });

      // Respond immediately with 202 Accepted
      json(res, { success: true, message: 'Event accepted', eventId: event.id }, 202);

    } catch (e) { json(res, { error: e.message }, 400); }
    return;
  }

  // ── Get Events ───────────────────────────────────────────────────────────
  if (req.url.startsWith('/api/event') && req.method === 'GET') {
    const url     = new URL(req.url, `http://localhost`);
    const project = url.searchParams.get('project');
    const events  = eventsDB.getAll({ project: project || undefined });
    const total   = eventsDB.count({ project: project || undefined });
    json(res, { success: true, events, total });
    return;
  }

  // ── Get Logs for Event ───────────────────────────────────────────────────
  if (req.url.startsWith('/api/logs/') && req.method === 'GET') {
    const eventId = req.url.split('/api/logs/')[1];
    json(res, { success: true, eventId, logs: logsDB.getByEventId(eventId) });
    return;
  }

  // GET /api/analytics/metrics — overall system metrics
  if (req.url === '/api/analytics/metrics' && req.method === 'GET') {
    json(res, { success: true, metrics: analyticsDB.getMetrics() });
    return;
  }

  // GET /api/analytics/history — incident history with filters
  if (req.url.startsWith('/api/analytics/history') && req.method === 'GET') {
    const url      = new URL(req.url, 'http://localhost');
    const project  = url.searchParams.get('project')  || undefined;
    const severity = url.searchParams.get('severity') || undefined;
    const status   = url.searchParams.get('status')   || undefined;
    const search   = url.searchParams.get('search')   || undefined;
    const limit    = parseInt(url.searchParams.get('limit')  || '50');
    const offset   = parseInt(url.searchParams.get('offset') || '0');
    json(res, { success: true, ...analyticsDB.getHistory({ project, severity, status, search, limit, offset }) });
    return;
  }

  // GET /api/analytics/patterns — recurring issue detection
  if (req.url.startsWith('/api/analytics/patterns') && req.method === 'GET') {
    const url     = new URL(req.url, 'http://localhost');
    const project = url.searchParams.get('project') || undefined;
    const hours   = parseInt(url.searchParams.get('hours') || '24');
    json(res, { success: true, patterns: analyticsDB.getPatterns(project, hours) });
    return;
  }

  // GET /api/analytics/project/:id — per-project metrics
  if (req.url.match(/^\/api\/analytics\/project\/[^\/]+$/) && req.method === 'GET') {
    const projectId = req.url.split('/')[4];
    json(res, { success: true, ...analyticsDB.getProjectMetrics(projectId) });
    return;
  }

  // GET /api/analytics/confidence/:projectId — approval patterns for a project
  if (req.url.match(/^\/api\/analytics\/confidence\/[^\/]+$/) && req.method === 'GET') {
    const projectId = req.url.split('/')[4];
    const patterns  = analyticsDB.getApprovalPatterns(projectId);
    const hint      = analyticsDB.buildConfidenceHint(projectId, 'auto-fix', 'high');
    json(res, { success: true, projectId, patterns, hint });
    return;
  }

  // GET /api/analytics/runbook — past resolutions for similar events
  if (req.url.startsWith('/api/analytics/runbook') && req.method === 'GET') {
    const url    = new URL(req.url, 'http://localhost');
    const type   = url.searchParams.get('type')   || '';
    const source = url.searchParams.get('source') || '';
    const project= url.searchParams.get('project')|| '';
    json(res, { success: true, runbook: analyticsDB.getRunbook(type, source, project) });
    return;
  }

    json(res, { error: 'Not found' }, 404);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  if (!res.headersSent) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 AutoFlow Backend — http://localhost:${PORT}`);
  console.log(`💾 Storage: SQLite (persistent across restarts)`);
  console.log(`👤 Approvals: Real human-in-the-loop (workflow pauses until you click)`);
  console.log(`\n📡 Key endpoints:`);
  console.log(`   POST /api/event              — submit an event`);
  console.log(`   GET  /api/event              — list all events`);
  console.log(`   GET  /api/approvals/pending  — pending approvals`);
  console.log(`   POST /api/approvals/:id/approve`);
  console.log(`   POST /api/approvals/:id/reject`);
  console.log(`   GET  /api/logs/stream        — SSE live stream\n`);
});