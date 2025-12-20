/**
 * DEMO TEST APP
 * Simple Express app that deliberately throws errors
 * Used to demonstrate AutoFlow integration
 */

import express from 'express';
import AutoFlowClient from '../autoflow-sdk/index.js';

// Initialize AutoFlow
const autoflow = new AutoFlowClient({
  endpoint: 'http://localhost:3000/api/event',
  project: 'demo-test-app',
  environment: 'production'
});

// Capture global errors
autoflow.captureUncaughtExceptions();

const app = express();
app.use(express.json());

console.log('\n🎯 Demo Test App Started!');
console.log('📊 AutoFlow Integration: ENABLED');
console.log('🔗 AutoFlow Backend: http://localhost:3000');
console.log('📈 AutoFlow Dashboard: http://localhost:3001\n');

// Home route
app.get('/', (req, res) => {
  res.json({
    message: 'Demo Test App - Integrated with AutoFlow',
    routes: {
      '/': 'This page',
      '/test/low': 'Trigger low severity error',
      '/test/medium': 'Trigger medium severity error',
      '/test/high': 'Trigger high severity error',
      '/test/critical': 'Trigger CRITICAL error (requires approval)',
      '/test/storm': 'Trigger alert storm (3 duplicate errors)',
      '/test/success': 'Successful operation (no error)'
    },
    instructions: [
      '1. Visit any /test/* route to trigger events',
      '2. Check AutoFlow dashboard at http://localhost:3001',
      '3. Watch real-time logs and AI decisions'
    ]
  });
});

// Test route: Low severity
app.get('/test/low', async (req, res) => {
  const error = new Error('User uploaded invalid file format');
  error.name = 'ValidationError';
  
  await autoflow.reportError(error, {
    source: 'file-upload',
    userId: 'demo-user-123',
    fileName: 'document.xyz'
  });
  
  res.json({
    status: 'Error reported to AutoFlow',
    severity: 'low',
    expectedAction: 'ignore (log only)',
    message: 'Check AutoFlow dashboard!'
  });
});

// Test route: Medium severity
app.get('/test/medium', async (req, res) => {
  const error = new Error('API rate limit exceeded for user');
  error.name = 'RateLimitError';
  
  await autoflow.reportError(error, {
    source: 'api-gateway',
    userId: 'demo-user-456',
    currentRate: 1050,
    limit: 1000
  });
  
  res.json({
    status: 'Error reported to AutoFlow',
    severity: 'medium',
    expectedAction: 'monitor',
    message: 'Check AutoFlow dashboard!'
  });
});

// Test route: High severity
app.get('/test/high', async (req, res) => {
  const error = new Error('Database connection timeout after 3 retries');
  error.name = 'DatabaseError';
  error.code = 'ETIMEDOUT';
  
  await autoflow.reportError(error, {
    source: 'database-pool',
    database: 'production-db',
    retries: 3,
    lastAttempt: new Date().toISOString()
  });
  
  res.json({
    status: 'Error reported to AutoFlow',
    severity: 'high',
    expectedAction: 'auto-fix (restart connection pool)',
    message: 'Check AutoFlow dashboard and terminal logs!'
  });
});

// Test route: CRITICAL severity (requires approval!)
app.get('/test/critical', async (req, res) => {
  const error = new Error('Payment gateway completely unresponsive - all transactions failing');
  error.name = 'PaymentError';
  
  await autoflow.reportError(error, {
    source: 'payment-gateway',
    severity: 'critical',
    affectedTransactions: 127,
    lastSuccessfulTransaction: '10 minutes ago',
    gatewayStatus: 'unreachable'
  });
  
  res.json({
    status: 'CRITICAL Error reported to AutoFlow',
    severity: 'critical',
    expectedAction: 'REQUEST APPROVAL (check dashboard!)',
    message: '⚠️ APPROVAL BANNER should appear in AutoFlow dashboard!',
    instructions: 'Click Approve or Reject button in the dashboard'
  });
});

// Test route: Alert storm (duplicate errors)
app.get('/test/storm', async (req, res) => {
  const error = new Error('Redis connection lost');
  
  // Send same error 3 times quickly
  for (let i = 0; i < 3; i++) {
    await autoflow.reportError(error, {
      source: 'cache-service',
      attemptNumber: i + 1
    });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  res.json({
    status: '3 duplicate errors sent',
    expectedBehavior: 'AutoFlow detects alert storm',
    expectedAction: 'Auto-escalate (prevent spam)',
    message: 'Check terminal - should show "ALERT STORM DETECTED"'
  });
});

// Test route: Successful operation
app.get('/test/success', async (req, res) => {
  await autoflow.reportEvent('info', 'User successfully completed checkout', 'low', {
    userId: 'demo-user-789',
    orderId: 'ORD-12345',
    amount: 99.99
  });
  
  res.json({
    status: 'Success event reported',
    message: 'This shows AutoFlow can track successes too!'
  });
});

// Test route: Unhandled error
app.get('/test/unhandled', (req, res) => {
  throw new Error('Unhandled exception in route handler');
});

// Simulate background job with errors
setInterval(async () => {
  try {
    if (Math.random() < 0.1) {
      throw new Error('Background cleanup job failed');
    }
  } catch (error) {
    await autoflow.reportError(error, {
      source: 'cleanup-job',
      jobType: 'background',
      severity: 'medium'
    });
  }
}, 30000);

// Global error middleware
app.use(autoflow.expressMiddleware());

// Start server
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`\n✅ Demo Test App running on http://localhost:${PORT}`);
  console.log(`\n📖 Quick Test:`);
  console.log(`   Visit http://localhost:${PORT}/test/critical`);
  console.log(`   Then check http://localhost:3001 for approval banner!\n`);
  console.log(`💡 TIP: Try each /test/* route to see different AutoFlow behaviors\n`);
});