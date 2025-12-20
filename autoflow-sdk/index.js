/**
 * AutoFlow SDK (ES Module Version)
 * Plug this into ANY Node.js project to get autonomous error handling
 */

import https from 'https';
import http from 'http';

class AutoFlowClient {
  constructor(config = {}) {
    this.endpoint = config.endpoint || 'http://localhost:3000/api/event';
    this.project = config.project || 'unknown-project';
    this.environment = config.environment || process.env.NODE_ENV || 'development';
    this.enabled = config.enabled !== false;
    
    console.log(`✅ AutoFlow SDK initialized for project: ${this.project}`);
  }

  /**
   * Report an error to AutoFlow
   */
  async reportError(error, context = {}) {
    if (!this.enabled) return;

    try {
      const event = {
        type: 'error',
        source: context.source || this.project,
        severity: this.detectSeverity(error, context),
        message: error.message || String(error),
        metadata: {
          project: this.project,
          environment: this.environment,
          stack: error.stack,
          errorType: error.name || error.constructor?.name,
          timestamp: new Date().toISOString(),
          ...context
        }
      };

      await this.send(event);
      console.log(`📤 Error reported to AutoFlow: ${event.message}`);
    } catch (err) {
      console.error('❌ Failed to report to AutoFlow:', err.message);
    }
  }

  /**
   * Report a custom event (not just errors)
   */
  async reportEvent(type, message, severity, metadata = {}) {
    if (!this.enabled) return;

    try {
      const event = {
        type: type || 'info',
        source: metadata.source || this.project,
        severity: severity || 'medium',
        message,
        metadata: {
          project: this.project,
          environment: this.environment,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      };

      await this.send(event);
      console.log(`📤 Event reported to AutoFlow: ${type} - ${message}`);
    } catch (err) {
      console.error('❌ Failed to report to AutoFlow:', err.message);
    }
  }

  /**
   * Auto-detect severity based on error type
   */
  detectSeverity(error, context) {
    // Custom severity provided
    if (context.severity) return context.severity;

    const message = (error.message || '').toLowerCase();
    const errorType = (error.name || '').toLowerCase();

    // Critical errors
    if (errorType.includes('payment')) return 'critical';
    if (errorType.includes('database') && message.includes('connection')) return 'critical';
    if (errorType.includes('auth') && message.includes('fail')) return 'critical';
    if (message.includes('out of memory')) return 'critical';
    if (message.includes('segmentation fault')) return 'critical';

    // High severity
    if (errorType.includes('timeout')) return 'high';
    if (errorType.includes('database')) return 'high';
    if (message.includes('failed to connect')) return 'high';
    if (message.includes('cannot access')) return 'high';
    if (error.code === 'ECONNREFUSED') return 'high';

    // Medium severity
    if (errorType.includes('validation')) return 'medium';
    if (message.includes('not found')) return 'medium';
    if (message.includes('invalid')) return 'medium';

    // Default
    return 'medium';
  }

  /**
   * Send event to AutoFlow backend
   */
  async send(event) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint);
      const client = url.protocol === 'https:' ? https : http;

      const data = JSON.stringify(event);

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = client.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve({ success: true });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Middleware for Express.js
   */
  expressMiddleware() {
    return (err, req, res, next) => {
      this.reportError(err, {
        source: `${this.project}-api`,
        endpoint: req.path,
        method: req.method,
        userId: req.user?.id,
        ip: req.ip
      });
      next(err);
    };
  }

  /**
   * Global uncaught exception handler
   */
  captureUncaughtExceptions() {
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      this.reportError(error, {
        source: `${this.project}-uncaught`,
        severity: 'critical'
      });
      // Give AutoFlow time to send the report
      setTimeout(() => process.exit(1), 1000);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection:', reason);
      this.reportError(new Error(String(reason)), {
        source: `${this.project}-unhandled-promise`,
        severity: 'high'
      });
    });

    console.log('✅ AutoFlow global error handlers installed');
  }
}

// ES Module export
export default AutoFlowClient;