/**
 * AutoFlow Demo App
 * Shows the SDK in action — ES module version
 */

import express from 'express';
import AutoFlow from '../autoflow-sdk/index.js';

// ─── Initialize SDK ────────────────────────────────────────────────────────

const af = new AutoFlow({
  endpoint:    'http://localhost:3000/api/event',
  project:     'demo-test-app',
  environment: 'production',
  debug:       true,          // log SDK activity
  maxRetries:  2              // retry twice on failure
});

// Install global handlers
af.captureUncaughtExceptions();

const app = express();
app.use(express.json());

// ─── Routes ────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    message: 'AutoFlow Demo App',
    sdk:     'autoflow-sdk v1.0.0',
    routes:  {
      '/health':        'Check AutoFlow backend connectivity',
      '/test/low':      'Low severity (→ ignored)',
      '/test/medium':   'Medium severity (→ monitored)',
      '/test/high':     'High severity (→ auto-fix)',
      '/test/critical': 'Critical severity (→ requires approval)',
      '/test/storm':    'Alert storm — 3 duplicates fast',
      '/test/batch':    'Batched events demo',
      '/test/success':  'Success event (info level)'
    }
  });
});

// Health check — shows SDK health() method
app.get('/health', async (req, res) => {
  const result = await af.health();
  res.json({ autoflow: result });
});

// Low severity
app.get('/test/low', async (req, res) => {
  const error = new Error('User uploaded unsupported file format');
  error.name  = 'ValidationError';
  await af.reportError(error, { source: 'file-upload', userId: 'user-123' });
  res.json({ status: 'reported', expectedAction: 'ignore' });
});

// Medium severity
app.get('/test/medium', async (req, res) => {
  const error = new Error('API rate limit exceeded');
  error.name  = 'RateLimitError';
  await af.reportError(error, { source: 'api-gateway', currentRate: 1050, limit: 1000 });
  res.json({ status: 'reported', expectedAction: 'monitor' });
});

// High severity
app.get('/test/high', async (req, res) => {
  const error = new Error('Database connection timeout after 3 retries');
  error.name  = 'DatabaseError';
  error.code  = 'ETIMEDOUT';
  await af.reportError(error, { source: 'database-pool', retries: 3 });
  res.json({ status: 'reported', expectedAction: 'auto-fix' });
});

// Critical severity — triggers approval banner
app.get('/test/critical', async (req, res) => {
  const error = new Error('Payment gateway completely unresponsive');
  error.name  = 'PaymentError';
  await af.reportError(error, {
    source:   'payment-gateway',
    severity: 'critical',
    affectedTransactions: 127
  });
  res.json({ status: 'reported', expectedAction: 'require_approval — check dashboard!' });
});

// Alert storm — 3 identical errors fast
app.get('/test/storm', async (req, res) => {
  const error = new Error('Redis connection lost');
  for (let i = 0; i < 3; i++) {
    await af.reportError(error, { source: 'cache-service', attempt: i + 1 });
    await new Promise(r => setTimeout(r, 100));
  }
  res.json({ status: '3 duplicate errors sent', expectedAction: 'storm detection' });
});

// Batching demo — queue 5 events, flush once
app.get('/test/batch', async (req, res) => {
  const batchClient = new AutoFlow({
    endpoint:      'http://localhost:3000/api/event',
    project:       'demo-test-app',
    environment:   'production',
    batchInterval: 60000  // long interval so we can flush manually
  });

  for (let i = 1; i <= 5; i++) {
    await batchClient.reportEvent('info', `Batch event ${i} of 5`, 'low', { batchDemo: true });
  }

  // Flush all 5 at once
  await batchClient.flush();
  res.json({ status: '5 events batched and flushed in 1 operation' });
});

// Success / info event
app.get('/test/success', async (req, res) => {
  await af.reportEvent('info', 'User checkout completed successfully', 'low', {
    userId: 'user-789', orderId: 'ORD-12345', amount: 99.99
  });
  res.json({ status: 'success event reported' });
});

// Global error handler using SDK middleware
app.use(af.middleware());

// ─── Start ─────────────────────────────────────────────────────────────────

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`\n✅ Demo app running on http://localhost:${PORT}`);
  console.log(`📊 AutoFlow dashboard: http://localhost:3001\n`);
});