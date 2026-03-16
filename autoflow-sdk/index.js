/**
 * AutoFlow SDK — ES Module
 * Drop into any Node.js app for autonomous incident response.
 *
 * Usage:
 *   import AutoFlow from 'autoflow-sdk';
 *   const af = new AutoFlow({ endpoint: 'http://localhost:3000/api/event', project: 'my-app' });
 *   af.captureUncaughtExceptions();
 */

import https from 'https';
import http  from 'http';

class AutoFlowClient {

  constructor(config = {}) {
    this.endpoint      = config.endpoint      || 'http://localhost:3000/api/event';
    this.project       = config.project       || process.env.AUTOFLOW_PROJECT || 'unknown-project';
    this.environment   = config.environment   || process.env.NODE_ENV          || 'development';
    this.enabled       = config.enabled !== false;
    this.debug         = config.debug         || false;
    this.batchInterval = config.batchInterval || 0;     // 0 = send immediately
    this.timeout       = config.timeout       || 5000;  // HTTP timeout ms
    this.maxRetries    = config.maxRetries     || 2;

    // Batch queue
    this._queue   = [];
    this._timer   = null;
    this._healthy = null; // cached health status

    if (this.batchInterval > 0) {
      this._startBatchTimer();
    }

    this._log(`AutoFlow SDK ready — project: ${this.project} (${this.environment})`);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Report an error. Automatically detects severity from the error type.
   *
   * @param {Error}  error
   * @param {object} context  — { source, severity, userId, endpoint, ... }
   */
  async reportError(error, context = {}) {
    if (!this.enabled) return null;

    const event = {
      type:     'error',
      source:   context.source || this.project,
      severity: context.severity || this._detectSeverity(error, context),
      message:  error.message || String(error),
      metadata: {
        project:     this.project,
        environment: this.environment,
        stack:       error.stack,
        errorType:   error.name || error.constructor?.name,
        errorCode:   error.code,
        timestamp:   new Date().toISOString(),
        ...this._sanitize(context)
      }
    };

    return this._enqueue(event);
  }

  /**
   * Report any custom event (not just errors).
   *
   * @param {string} type      — e.g. 'warning', 'info', 'alert'
   * @param {string} message
   * @param {string} severity  — 'low' | 'medium' | 'high' | 'critical'
   * @param {object} metadata
   */
  async reportEvent(type, message, severity = 'medium', metadata = {}) {
    if (!this.enabled) return null;

    const event = {
      type:     type || 'info',
      source:   metadata.source || this.project,
      severity: severity,
      message:  message,
      metadata: {
        project:     this.project,
        environment: this.environment,
        timestamp:   new Date().toISOString(),
        ...this._sanitize(metadata)
      }
    };

    return this._enqueue(event);
  }

  /**
   * Check if the AutoFlow backend is reachable.
   * Returns { ok: true/false, latencyMs, status }
   */
  async health() {
    const healthUrl = this.endpoint.replace('/api/event', '/api/health');
    const start = Date.now();
    try {
      const res = await this._fetch(healthUrl, 'GET', null);
      const latencyMs = Date.now() - start;
      this._healthy = res.status === 'ok';
      return { ok: true, latencyMs, status: res.status, message: res.message };
    } catch (err) {
      this._healthy = false;
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }

  /**
   * Express/Connect error middleware — catches all errors in your app.
   *
   * app.use(autoflow.middleware());
   */
  middleware() {
    return (err, req, res, next) => {
      this.reportError(err, {
        source:   `${this.project}-api`,
        endpoint: req.path,
        method:   req.method,
        userId:   req.user?.id,
        ip:       req.ip,
        headers:  { 'user-agent': req.headers?.['user-agent'] }
      });
      next(err);
    };
  }

  /**
   * Alias for middleware() — backwards compatible with old expressMiddleware()
   */
  expressMiddleware() { return this.middleware(); }

  /**
   * Install global handlers for uncaught exceptions and unhandled rejections.
   * Call once at app startup.
   */
  captureUncaughtExceptions() {
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught Exception:', error.message);
      await this.reportError(error, { source: `${this.project}-uncaught`, severity: 'critical' });
      await this._flush(); // ensure it's sent before exit
      setTimeout(() => process.exit(1), 1500);
    });

    process.on('unhandledRejection', (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.reportError(error, { source: `${this.project}-unhandled-rejection`, severity: 'high' });
    });

    // Flush queue on graceful shutdown
    process.on('SIGTERM', async () => { await this._flush(); });
    process.on('SIGINT',  async () => { await this._flush(); });

    this._log('Global error handlers installed (uncaughtException, unhandledRejection, SIGTERM, SIGINT)');
    return this;
  }

  /**
   * Wrap console.error to automatically report errors.
   * Call once at app startup.
   */
  captureConsoleErrors() {
    const original = console.error.bind(console);
    console.error = (...args) => {
      original(...args);
      const message = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
      const error   = args.find(a => a instanceof Error) || new Error(message);
      this.reportError(error, { source: `${this.project}-console`, severity: 'medium' });
    };
    this._log('console.error capture installed');
    return this;
  }

  /**
   * Flush any pending batched events immediately.
   */
  async flush() { return this._flush(); }

  /**
   * Disable the SDK (e.g. in tests).
   */
  disable() { this.enabled = false; return this; }

  /**
   * Re-enable after disable().
   */
  enable() { this.enabled = true; return this; }

  // ─── Internals ───────────────────────────────────────────────────────────

  _enqueue(event) {
    if (this.batchInterval > 0) {
      this._queue.push(event);
      this._log(`Queued event (${this._queue.length} in batch): ${event.message}`);
      return Promise.resolve({ queued: true });
    }
    return this._sendWithRetry(event);
  }

  _startBatchTimer() {
    this._timer = setInterval(() => this._flush(), this.batchInterval);
    if (this._timer.unref) this._timer.unref(); // don't block process exit
  }

  async _flush() {
    if (this._queue.length === 0) return;
    const batch = this._queue.splice(0);
    this._log(`Flushing ${batch.length} batched event(s)`);
    await Promise.allSettled(batch.map(e => this._sendWithRetry(e)));
  }

  async _sendWithRetry(event, attempt = 0) {
    try {
      const result = await this._fetch(this.endpoint, 'POST', event);
      this._log(`Sent: ${event.message} → ${result.eventId || 'ok'}`);
      return result;
    } catch (err) {
      if (attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
        this._log(`Retry ${attempt + 1}/${this.maxRetries} in ${delay}ms: ${err.message}`);
        await this._sleep(delay);
        return this._sendWithRetry(event, attempt + 1);
      }
      // Final failure — log but never throw (SDK must never crash the host app)
      if (this.debug) {
        console.error(`[AutoFlow] Failed to send event after ${this.maxRetries} retries:`, err.message);
      }
      return null;
    }
  }

  _fetch(url, method, body) {
    return new Promise((resolve, reject) => {
      const parsed  = new URL(url);
      const client  = parsed.protocol === 'https:' ? https : http;
      const payload = body ? JSON.stringify(body) : null;

      const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + (parsed.search || ''),
        method,
        headers: {
          'Content-Type':   'application/json',
          'X-AutoFlow-SDK': '1.0.0',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        },
        timeout: this.timeout
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch { resolve({ success: true }); }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error(`Request timed out after ${this.timeout}ms`)); });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  _detectSeverity(error, context) {
    const msg  = (error.message || '').toLowerCase();
    const type = (error.name    || '').toLowerCase();
    const code = error.code     || '';

    if (type.includes('payment') || msg.includes('payment'))    return 'critical';
    if (type.includes('auth')    && msg.includes('fail'))       return 'critical';
    if (msg.includes('out of memory') || msg.includes('segfault')) return 'critical';
    if (code === 'ECONNREFUSED'  || msg.includes('econnrefused')) return 'high';
    if (type.includes('timeout') || msg.includes('timeout'))    return 'high';
    if (type.includes('database')|| msg.includes('database'))   return 'high';
    if (msg.includes('failed to connect'))                       return 'high';
    if (type.includes('validation')|| msg.includes('invalid'))  return 'medium';
    if (msg.includes('not found'))                               return 'medium';
    return 'medium';
  }

  _sanitize(obj) {
    // Remove undefined values and truncate long strings
    const clean = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === undefined) continue;
      if (typeof v === 'string' && v.length > 500) { clean[k] = v.slice(0, 500) + '…'; continue; }
      clean[k] = v;
    }
    return clean;
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _log(msg) {
    if (this.debug) console.log(`[AutoFlow] ${msg}`);
  }
}

export default AutoFlowClient;
export { AutoFlowClient };