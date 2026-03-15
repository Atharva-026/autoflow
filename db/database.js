/**
 * AutoFlow Database Layer
 * Single SQLite file — survives restarts, zero config, zero cost
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'autoflow.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance settings
db.pragma('journal_mode = WAL');   // Allows concurrent reads during writes
db.pragma('foreign_keys = ON');

// ─── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    source      TEXT NOT NULL,
    severity    TEXT NOT NULL,
    message     TEXT,
    project     TEXT,
    environment TEXT,
    metadata    TEXT,          -- JSON string
    status      TEXT DEFAULT 'processing',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workflow_results (
    id              TEXT PRIMARY KEY,
    event_id        TEXT NOT NULL,
    classification  TEXT,      -- JSON string
    decision        TEXT,      -- JSON string
    execution       TEXT,      -- JSON string
    verification    TEXT,      -- JSON string
    follow_up       TEXT,      -- JSON string
    summary         TEXT,
    completed_at    TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id              TEXT PRIMARY KEY,
    event_id        TEXT NOT NULL,
    project         TEXT,
    environment     TEXT,
    status          TEXT DEFAULT 'pending',   -- pending|approved|rejected|timeout
    event_data      TEXT NOT NULL,            -- JSON string
    classification  TEXT NOT NULL,            -- JSON string
    proposed_action TEXT NOT NULL,            -- JSON string
    approver        TEXT,
    comments        TEXT,
    rejection_reason TEXT,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    resolved_at     TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS workflow_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   TEXT NOT NULL,
    type       TEXT NOT NULL,
    step       TEXT,
    message    TEXT,
    data       TEXT,           -- JSON string for extra fields
    created_at TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_events_project    ON events(project);
  CREATE INDEX IF NOT EXISTS idx_events_status     ON events(status);
  CREATE INDEX IF NOT EXISTS idx_events_created    ON events(created_at);
  CREATE INDEX IF NOT EXISTS idx_approvals_status  ON approvals(status);
  CREATE INDEX IF NOT EXISTS idx_logs_event_id     ON workflow_logs(event_id);
  CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    environment     TEXT DEFAULT 'production',
    owner           TEXT DEFAULT 'unknown',
    criticality     TEXT DEFAULT 'medium',
    contacts        TEXT DEFAULT '{}',     -- JSON
    policy_override TEXT DEFAULT NULL,     -- JSON: {overrideAll, severity overrides}
    webhook_url     TEXT DEFAULT NULL,     -- called on every escalate
    fix_script      TEXT DEFAULT NULL,     -- shell command run on auto-fix
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_projects_criticality ON projects(criticality);

`);

console.log(`✅ Database ready: ${DB_PATH}`);

// ─── Events ────────────────────────────────────────────────────────────────

export const eventsDB = {

  insert(event) {
    const stmt = db.prepare(`
      INSERT INTO events (id, type, source, severity, message, project, environment, metadata, status, created_at, updated_at)
      VALUES (@id, @type, @source, @severity, @message, @project, @environment, @metadata, @status, @created_at, @updated_at)
    `);
    stmt.run({
      id:          event.id,
      type:        event.type,
      source:      event.source,
      severity:    event.severity || 'medium',
      message:     event.message || '',
      project:     event.metadata?.project || 'unknown',
      environment: event.metadata?.environment || 'production',
      metadata:    JSON.stringify(event.metadata || {}),
      status:      event.status || 'processing',
      created_at:  event.timestamp || new Date().toISOString(),
      updated_at:  new Date().toISOString()
    });
    return event;
  },

  updateStatus(id, status) {
    db.prepare(`UPDATE events SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), id);
  },

  getAll({ project, limit = 50 } = {}) {
    let query = `SELECT * FROM events`;
    const params = [];
    if (project && project !== 'all') {
      query += ` WHERE project = ?`;
      params.push(project);
    }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    return db.prepare(query).all(...params).map(parseEvent);
  },

  getById(id) {
    const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id);
    return row ? parseEvent(row) : null;
  },

  count({ project } = {}) {
    if (project) {
      return db.prepare(`SELECT COUNT(*) as c FROM events WHERE project = ?`).get(project).c;
    }
    return db.prepare(`SELECT COUNT(*) as c FROM events`).get().c;
  }
};

function parseEvent(row) {
  return {
    ...row,
    metadata: safeJSON(row.metadata, {})
  };
}

// ─── Workflow Results ───────────────────────────────────────────────────────

export const resultsDB = {

  upsert(eventId, result) {
    const existing = db.prepare(`SELECT id FROM workflow_results WHERE event_id = ?`).get(eventId);

    if (existing) {
      db.prepare(`
        UPDATE workflow_results
        SET classification=?, decision=?, execution=?, verification=?, follow_up=?, summary=?, completed_at=?
        WHERE event_id=?
      `).run(
        JSON.stringify(result.classification),
        JSON.stringify(result.decision),
        JSON.stringify(result.execution),
        JSON.stringify(result.verification),
        JSON.stringify(result.followUp),
        result.summary || '',
        result.completedAt || new Date().toISOString(),
        eventId
      );
    } else {
      db.prepare(`
        INSERT INTO workflow_results (id, event_id, classification, decision, execution, verification, follow_up, summary, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `result_${eventId}`,
        eventId,
        JSON.stringify(result.classification),
        JSON.stringify(result.decision),
        JSON.stringify(result.execution),
        JSON.stringify(result.verification),
        JSON.stringify(result.followUp),
        result.summary || '',
        result.completedAt || new Date().toISOString()
      );
    }
  },

  getByEventId(eventId) {
    const row = db.prepare(`SELECT * FROM workflow_results WHERE event_id = ?`).get(eventId);
    if (!row) return null;
    return {
      ...row,
      classification: safeJSON(row.classification),
      decision:       safeJSON(row.decision),
      execution:      safeJSON(row.execution),
      verification:   safeJSON(row.verification),
      followUp:       safeJSON(row.follow_up)
    };
  }
};

// ─── Approvals ─────────────────────────────────────────────────────────────

export const approvalsDB = {

  insert(approval) {
    db.prepare(`
      INSERT INTO approvals (id, event_id, project, environment, status, event_data, classification, proposed_action, created_at, expires_at)
      VALUES (@id, @event_id, @project, @environment, @status, @event_data, @classification, @proposed_action, @created_at, @expires_at)
    `).run({
      id:              approval.id,
      event_id:        approval.eventId,
      project:         approval.project || 'unknown',
      environment:     approval.environment || 'production',
      status:          'pending',
      event_data:      JSON.stringify(approval.event),
      classification:  JSON.stringify(approval.classification),
      proposed_action: JSON.stringify(approval.proposedAction),
      created_at:      approval.createdAt,
      expires_at:      approval.expiresAt
    });
    return approval;
  },

  resolve(id, { status, approver, comments, rejectionReason }) {
    db.prepare(`
      UPDATE approvals
      SET status=?, approver=?, comments=?, rejection_reason=?, resolved_at=?
      WHERE id=?
    `).run(
      status,
      approver || 'unknown',
      comments || '',
      rejectionReason || '',
      new Date().toISOString(),
      id
    );
    return this.getById(id);
  },

  getById(id) {
    const row = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(id);
    return row ? parseApproval(row) : null;
  },

  getPending() {
    return db.prepare(`SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC`)
      .all().map(parseApproval);
  },

  getHistory(limit = 50) {
    return db.prepare(`SELECT * FROM approvals WHERE status != 'pending' ORDER BY resolved_at DESC LIMIT ?`)
      .all(limit).map(parseApproval);
  },

  getStats() {
    const all     = db.prepare(`SELECT status, COUNT(*) as c FROM approvals GROUP BY status`).all();
    const pending = db.prepare(`SELECT COUNT(*) as c FROM approvals WHERE status = 'pending'`).get().c;

    const counts = { approved: 0, rejected: 0, timeout: 0 };
    let total = 0;
    all.forEach(r => {
      if (r.status !== 'pending') {
        counts[r.status] = (counts[r.status] || 0) + r.c;
        total += r.c;
      }
    });

    return {
      total,
      pending,
      approved: counts.approved,
      rejected: counts.rejected,
      timeout:  counts.timeout,
      approvalRate: total > 0 ? ((counts.approved / total) * 100).toFixed(1) : '0.0'
    };
  }
};

function parseApproval(row) {
  return {
    ...row,
    eventId:        row.event_id,
    event:          safeJSON(row.event_data, {}),
    classification: safeJSON(row.classification, {}),
    proposedAction: safeJSON(row.proposed_action, {}),
    createdAt:      row.created_at,
    expiresAt:      row.expires_at,
    resolvedAt:     row.resolved_at
  };
}

// ─── Workflow Logs ──────────────────────────────────────────────────────────

export const logsDB = {

  insert(eventId, log) {
    db.prepare(`
      INSERT INTO workflow_logs (event_id, type, step, message, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      log.type,
      log.step || null,
      log.message || null,
      JSON.stringify(log),
      log.timestamp || new Date().toISOString()
    );
  },

  getByEventId(eventId) {
    return db.prepare(`SELECT * FROM workflow_logs WHERE event_id = ? ORDER BY id ASC`)
      .all(eventId)
      .map(row => safeJSON(row.data, { type: row.type, step: row.step }));
  }
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeJSON(str, fallback = null) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export default db;

// ─── Projects (replaces hardcoded registry) ────────────────────────────────

export const projectsDB = {

  // Called once on startup to seed default projects if table is empty
  seed(defaults) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM projects`).get().c;
    if (count > 0) return;
    console.log('🌱 Seeding default projects...');
    defaults.forEach(p => this.insert(p));
  },

  insert(p) {
    db.prepare(`
      INSERT OR REPLACE INTO projects
        (id, name, environment, owner, criticality, contacts, policy_override,
         webhook_url, fix_script, created_at, updated_at)
      VALUES
        (@id,@name,@environment,@owner,@criticality,@contacts,@policy_override,
         @webhook_url,@fix_script,@created_at,@updated_at)
    `).run({
      id:              p.id,
      name:            p.name,
      environment:     p.environment     || 'production',
      owner:           p.owner           || 'unknown',
      criticality:     p.criticality     || 'medium',
      contacts:        JSON.stringify(p.contacts        || {}),
      policy_override: JSON.stringify(p.policyOverride  || null),
      webhook_url:     p.webhookUrl      || null,
      fix_script:      p.fixScript       || null,
      created_at:      p.createdAt       || new Date().toISOString(),
      updated_at:      new Date().toISOString()
    });
    return this.getById(p.id);
  },

  update(id, fields) {
    const existing = this.getById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const merged = { ...existing, ...fields, id, updatedAt: new Date().toISOString() };
    return this.insert({ ...merged,
      policyOverride: fields.policyOverride ?? existing.policyOverride,
      webhookUrl:     fields.webhookUrl     ?? existing.webhookUrl,
      fixScript:      fields.fixScript      ?? existing.fixScript
    });
  },

  delete(id) {
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  },

  getById(id) {
    const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    return row ? parseProject(row) : null;
  },

  getAll() {
    return db.prepare(`SELECT * FROM projects ORDER BY criticality DESC, name ASC`)
      .all().map(parseProject);
  }
};

function parseProject(row) {
  return {
    id:             row.id,
    name:           row.name,
    environment:    row.environment,
    owner:          row.owner,
    criticality:    row.criticality,
    contacts:       safeJSON(row.contacts, {}),
    policyOverride: safeJSON(row.policy_override, null),
    webhookUrl:     row.webhook_url  || null,
    fixScript:      row.fix_script   || null,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at
  };
}

// ─── Analytics queries ─────────────────────────────────────────────────────

export const analyticsDB = {

  // Overall metrics
  getMetrics() {
    const total     = db.prepare(`SELECT COUNT(*) as c FROM events`).get().c;
    const completed = db.prepare(`SELECT COUNT(*) as c FROM events WHERE status='completed'`).get().c;
    const failed    = db.prepare(`SELECT COUNT(*) as c FROM events WHERE status='failed'`).get().c;
    const processing= db.prepare(`SELECT COUNT(*) as c FROM events WHERE status='processing'`).get().c;

    // Average resolution time in minutes
    const avgTime = db.prepare(`
      SELECT AVG((julianday(r.completed_at) - julianday(e.created_at)) * 1440) as avg_minutes
      FROM workflow_results r
      JOIN events e ON e.id = r.event_id
      WHERE r.completed_at IS NOT NULL
    `).get().avg_minutes;

    // Severity breakdown
    const bySeverity = db.prepare(`
      SELECT severity, COUNT(*) as count FROM events GROUP BY severity
    `).all();

    // Action breakdown from workflow_results
    const byAction = db.prepare(`
      SELECT json_extract(decision, '$.action') as action, COUNT(*) as count
      FROM workflow_results
      WHERE decision IS NOT NULL
      GROUP BY action
    `).all();

    // Events per day (last 7 days)
    const perDay = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count
      FROM events
      WHERE created_at >= date('now', '-7 days')
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all();

    // AI accuracy — how often AI decision matched final action
    const aiAccuracy = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN json_extract(decision,'$.aiSuggestion') = json_extract(decision,'$.action')
                   OR json_extract(decision,'$.policyApplied') = 0
            THEN 1 ELSE 0 END) as matched
      FROM workflow_results WHERE decision IS NOT NULL
    `).get();

    return {
      total, completed, failed, processing,
      resolutionRate: total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0',
      avgResolutionMinutes: avgTime ? avgTime.toFixed(1) : null,
      bySeverity: Object.fromEntries(bySeverity.map(r => [r.severity, r.count])),
      byAction:   Object.fromEntries(byAction.filter(r => r.action).map(r => [r.action, r.count])),
      perDay,
      aiAccuracy: aiAccuracy.total > 0
        ? ((aiAccuracy.matched / aiAccuracy.total) * 100).toFixed(1)
        : '0.0'
    };
  },

  // Per-project metrics
  getProjectMetrics(projectId) {
    const events = db.prepare(`
      SELECT e.*, r.classification, r.decision, r.verification, r.summary, r.completed_at
      FROM events e
      LEFT JOIN workflow_results r ON r.event_id = e.id
      WHERE e.project = ?
      ORDER BY e.created_at DESC
    `).all(projectId).map(row => ({
      ...row,
      classification: safeJSON(row.classification),
      decision:       safeJSON(row.decision),
      verification:   safeJSON(row.verification)
    }));

    const total     = events.length;
    const resolved  = events.filter(e => e.verification?.status === 'resolved').length;
    const escalated = events.filter(e => e.decision?.action === 'escalate').length;
    const autoFixed = events.filter(e => e.decision?.action === 'auto-fix').length;

    // Most common error messages
    const messageCounts = {};
    events.forEach(e => {
      const key = (e.message || 'unknown').slice(0, 60);
      messageCounts[key] = (messageCounts[key] || 0) + 1;
    });
    const topErrors = Object.entries(messageCounts)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([message, count]) => ({ message, count }));

    return { projectId, total, resolved, escalated, autoFixed, topErrors, recentEvents: events.slice(0, 20) };
  },

  // Incident history with filters
  getHistory({ project, severity, status, search, limit = 50, offset = 0 } = {}) {
    let where = [];
    let params = [];

    if (project && project !== 'all') { where.push(`e.project = ?`);   params.push(project); }
    if (severity)  { where.push(`e.severity = ?`);  params.push(severity); }
    if (status)    { where.push(`e.status = ?`);    params.push(status); }
    if (search)    { where.push(`(e.message LIKE ? OR e.source LIKE ?)`); params.push(`%${search}%`, `%${search}%`); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT e.*, r.classification, r.decision, r.verification, r.summary
      FROM events e
      LEFT JOIN workflow_results r ON r.event_id = e.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const countRow = db.prepare(`
      SELECT COUNT(*) as c FROM events e ${whereClause}
    `).get(...params);

    return {
      incidents: rows.map(row => ({
        ...row,
        classification: safeJSON(row.classification),
        decision:       safeJSON(row.decision),
        verification:   safeJSON(row.verification)
      })),
      total:  countRow.c,
      limit,
      offset
    };
  },

  // Pattern detection — finds recurring issues
  getPatterns(projectId, windowHours = 24) {
    const rows = db.prepare(`
      SELECT e.message, e.severity, e.source, e.type,
             COUNT(*) as count,
             MAX(e.created_at) as last_seen,
             MIN(e.created_at) as first_seen
      FROM events e
      WHERE e.created_at >= datetime('now', '-${windowHours} hours')
      ${projectId ? 'AND e.project = ?' : ''}
      GROUP BY e.type, e.source, substr(e.message, 1, 60)
      HAVING count >= 2
      ORDER BY count DESC
      LIMIT 20
    `).all(...(projectId ? [projectId] : []));

    return rows.map(r => ({
      ...r,
      pattern: r.count >= 5 ? 'storm' : r.count >= 3 ? 'recurring' : 'repeat',
      suggestion: getSuggestion(r)
    }));
  },

  // Runbook: past resolutions for similar events
  getRunbook(eventType, source, projectId) {
    const rows = db.prepare(`
      SELECT e.message, e.severity,
             r.decision, r.verification, r.summary,
             e.created_at
      FROM events e
      JOIN workflow_results r ON r.event_id = e.id
      WHERE e.type = ?
        AND e.source = ?
        AND r.verification IS NOT NULL
        AND json_extract(r.verification,'$.status') = 'resolved'
      ORDER BY e.created_at DESC
      LIMIT 5
    `).all(eventType, source).map(row => ({
      ...row,
      decision:     safeJSON(row.decision),
      verification: safeJSON(row.verification)
    }));

    return rows;
  }
};

function getSuggestion(row) {
  if (row.count >= 5)  return `Alert storm — consider auto-escalating ${row.source}`;
  if (row.severity === 'critical') return `Recurring critical issue — review ${row.source} infrastructure`;
  if (row.type === 'error')        return `Repeated errors from ${row.source} — check deployment or config`;
  return `Monitor ${row.source} closely — ${row.count} occurrences in ${24}h`;
}