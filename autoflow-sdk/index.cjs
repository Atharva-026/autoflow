'use strict';

const https = require('https');
const http  = require('http');

class AutoFlowClient {

  constructor(config = {}) {
    this.endpoint      = config.endpoint      || 'http://localhost:3000/api/event';
    this.project       = config.project       || process.env.AUTOFLOW_PROJECT || 'unknown-project';
    this.environment   = config.environment   || process.env.NODE_ENV          || 'development';
    this.enabled       = config.enabled !== false;
    this.debug         = config.debug         || false;
    this.batchInterval = config.batchInterval || 0;
    this.timeout       = config.timeout       || 5000;
    this.maxRetries    = config.maxRetries    || 2;

    this._queue = [];
    this._timer = null;

    if (this.batchInterval > 0) this._startBatchTimer();
    this._log(`AutoFlow SDK ready — project: ${this.project} (${this.environment})`);
  }

  async reportError(error, context = {}) {
    if (!this.enabled) return null;
    const event = {
      type:     'error',
      source:   context.source   || this.project,
      severity: context.severity || this._detectSeverity(error, context),
      message:  error.message    || String(error),
      metadata: {
        project:     this.project,
        environment: this.environment,
        stack:       error.stack,
        errorType:   error.name,
        errorCode:   error.code,
        timestamp:   new Date().toISOString(),
        ...this._sanitize(context)
      }
    };
    return this._enqueue(event);
  }

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

  async health() {
    const url   = this.endpoint.replace('/api/event', '/api/health');
    const start = Date.now();
    try {
      const res = await this._fetch(url, 'GET', null);
      return { ok: true, latencyMs: Date.now() - start, status: res.status };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }

  middleware() {
    return (err, req, res, next) => {
      this.reportError(err, {
        source:   `${this.project}-api`,
        endpoint: req.path,
        method:   req.method,
        userId:   req.user && req.user.id,
        ip:       req.ip
      });
      next(err);
    };
  }

  expressMiddleware() { return this.middleware(); }

  captureUncaughtExceptions() {
    const self = this;

    process.on('uncaughtException', async function(error) {
      console.error('💥 Uncaught Exception:', error.message);
      await self.reportError(error, { source: self.project + '-uncaught', severity: 'critical' });
      await self._flush();
      setTimeout(function() { process.exit(1); }, 1500);
    });

    process.on('unhandledRejection', function(reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      self.reportError(error, { source: self.project + '-unhandled-rejection', severity: 'high' });
    });

    process.on('SIGTERM', async function() { await self._flush(); });
    process.on('SIGINT',  async function() { await self._flush(); });

    this._log('Global error handlers installed');
    return this;
  }

  captureConsoleErrors() {
    const self     = this;
    const original = console.error.bind(console);

    console.error = function() {
      original.apply(console, arguments);
      const args    = Array.prototype.slice.call(arguments);
      const message = args.map(function(a) { return a instanceof Error ? a.message : String(a); }).join(' ');
      const error   = args.find(function(a) { return a instanceof Error; }) || new Error(message);
      self.reportError(error, { source: self.project + '-console', severity: 'medium' });
    };

    this._log('console.error capture installed');
    return this;
  }

  async flush()  { return this._flush(); }
  disable()      { this.enabled = false; return this; }
  enable()       { this.enabled = true;  return this; }

  _enqueue(event) {
    if (this.batchInterval > 0) {
      this._queue.push(event);
      return Promise.resolve({ queued: true });
    }
    return this._sendWithRetry(event);
  }

  _startBatchTimer() {
    this._timer = setInterval(() => this._flush(), this.batchInterval);
    if (this._timer.unref) this._timer.unref();
  }

  async _flush() {
    if (this._queue.length === 0) return;
    const batch = this._queue.splice(0);
    await Promise.all(batch.map(e => this._sendWithRetry(e)));
  }

  async _sendWithRetry(event, attempt) {
    attempt = attempt || 0;
    try {
      return await this._fetch(this.endpoint, 'POST', event);
    } catch (err) {
      if (attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt) * 500;
        await new Promise(function(r) { setTimeout(r, delay); });
        return this._sendWithRetry(event, attempt + 1);
      }
      if (this.debug) console.error('[AutoFlow] Failed after retries:', err.message);
      return null;
    }
  }

  _fetch(url, method, body) {
    const self = this;
    return new Promise(function(resolve, reject) {
      const parsed  = new URL(url);
      const client  = parsed.protocol === 'https:' ? https : http;
      const payload = body ? JSON.stringify(body) : null;
      const headers = { 'Content-Type': 'application/json', 'X-AutoFlow-SDK': '1.0.0' };
      if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

      const req = client.request({
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname,
        method:   method,
        timeout:  self.timeout,
        headers:  headers
      }, function(res) {
        let data = '';
        res.on('data', function(c) { data += c; });
        res.on('end', function() {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch(e) { resolve({ success: true }); }
          } else {
            reject(new Error('HTTP ' + res.statusCode));
          }
        });
      });

      req.on('timeout', function() { req.destroy(); reject(new Error('Timeout')); });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  _detectSeverity(error, context) {
    const msg  = (error.message || '').toLowerCase();
    const type = (error.name    || '').toLowerCase();
    const code =  error.code    || '';

    if (type.indexOf('payment') !== -1 || msg.indexOf('payment') !== -1)  return 'critical';
    if (type.indexOf('auth') !== -1     && msg.indexOf('fail') !== -1)     return 'critical';
    if (msg.indexOf('out of memory') !== -1)                               return 'critical';
    if (code === 'ECONNREFUSED' || msg.indexOf('econnrefused') !== -1)     return 'high';
    if (type.indexOf('timeout') !== -1  || msg.indexOf('timeout') !== -1)  return 'high';
    if (type.indexOf('database') !== -1 || msg.indexOf('database') !== -1) return 'high';
    if (type.indexOf('validation') !== -1 || msg.indexOf('invalid') !== -1)return 'medium';
    return 'medium';
  }

  _sanitize(obj) {
    const clean = {};
    Object.keys(obj || {}).forEach(function(k) {
      const v = obj[k];
      if (v === undefined) return;
      clean[k] = (typeof v === 'string' && v.length > 500) ? v.slice(0, 500) + '…' : v;
    });
    return clean;
  }

  _log(msg) { if (this.debug) console.log('[AutoFlow] ' + msg); }
}

module.exports = AutoFlowClient;
module.exports.AutoFlowClient = AutoFlowClient;
module.exports.default = AutoFlowClient;