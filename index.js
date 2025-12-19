// IMPORTANT: Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';

// Import workflow
import handleOperationalEvent from './workflows/handleEvent.js';

// Import new modules
import { getAllProjects, getProjectHealth } from './registry/projects.js';
import { getCorrelationStats } from './correlation/eventCorrelator.js';
import { getAllPolicies } from './policies/policyEngine.js';
import { 
  getPendingApprovals, 
  getApproval, 
  approveAction, 
  rejectAction,
  getApprovalStats,
  getApprovalHistory 
} from './approvals/approvalManager.js';

const events = [];
const workflowLogs = {}; // Store logs per workflow
const sseClients = []; // Connected SSE clients

// Helper to broadcast logs to all connected clients
function broadcastLog(log) {
  const data = `data: ${JSON.stringify(log)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(data);
    } catch (error) {
      // Client disconnected, will be removed later
    }
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // SSE endpoint for real-time logs
  if (req.url === '/api/logs/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    
    sseClients.push(res);
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to workflow logs' })}\n\n`);
    
    req.on('close', () => {
      const index = sseClients.indexOf(res);
      if (index !== -1) {
        sseClients.splice(index, 1);
      }
    });
    
    return;
  }
  
  // Health check
  if (req.url === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      message: 'AutoFlow is running!',
      timestamp: new Date().toISOString(),
      activeClients: sseClients.length,
      features: {
        projectAwareness: true,
        eventCorrelation: true,
        policyEngine: true,
        humanApprovals: true
      }
    }));
    return;
  }
  
  // NEW: Get all projects
  if (req.url === '/api/projects' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      projects: getAllProjects()
    }));
    return;
  }
  
  // NEW: Get project health
  if (req.url.startsWith('/api/projects/') && req.url.includes('/health') && req.method === 'GET') {
    const projectId = req.url.split('/')[3];
    const health = getProjectHealth(projectId, events);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      health
    }));
    return;
  }
  
  // NEW: Get correlation stats
  if (req.url === '/api/correlation/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      stats: getCorrelationStats()
    }));
    return;
  }
  
  // NEW: Get policies
  if (req.url === '/api/policies' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      policies: getAllPolicies()
    }));
    return;
  }
  
  // NEW: Get pending approvals
  if (req.url === '/api/approvals/pending' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      approvals: getPendingApprovals()
    }));
    return;
  }
  
  // NEW: Get approval stats
  if (req.url === '/api/approvals/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      stats: getApprovalStats()
    }));
    return;
  }
  
  // NEW: Get approval history
  if (req.url === '/api/approvals/history' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      history: getApprovalHistory()
    }));
    return;
  }
  
  // NEW: Approve action
  if (req.url.startsWith('/api/approvals/') && req.url.includes('/approve') && req.method === 'POST') {
    const approvalId = req.url.split('/')[3];
    
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { approver, comments } = JSON.parse(body);
        const result = approveAction(approvalId, approver || 'operator', comments || '');
        
        broadcastLog({
          type: 'approval_granted',
          approvalId,
          approver,
          timestamp: new Date().toISOString()
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, approval: result }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }
  
  // NEW: Reject action
  if (req.url.startsWith('/api/approvals/') && req.url.includes('/reject') && req.method === 'POST') {
    const approvalId = req.url.split('/')[3];
    
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { approver, reason } = JSON.parse(body);
        const result = rejectAction(approvalId, approver || 'operator', reason || 'No reason provided');
        
        broadcastLog({
          type: 'approval_rejected',
          approvalId,
          approver,
          reason,
          timestamp: new Date().toISOString()
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, approval: result }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }
  
  // POST /api/event (ENHANCED)
  if (req.url === '/api/event' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const eventData = JSON.parse(body);
        
        // Create event with enhanced metadata
        const event = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          ...eventData,
          status: 'processing',
          // Ensure metadata exists
          metadata: {
            ...eventData.metadata,
            project: eventData.metadata?.project || 'unknown',
            environment: eventData.metadata?.environment || 'production'
          }
        };
        
        events.push(event);
        workflowLogs[event.id] = [];
        
        console.log(`\n✅ Event received: ${event.id}`);
        console.log(`   Type: ${event.type}`);
        console.log(`   Source: ${event.source}`);
        console.log(`   Project: ${event.metadata.project}`);
        console.log(`   Environment: ${event.metadata.environment}\n`);
        
        broadcastLog({
          type: 'event_received',
          eventId: event.id,
          event,
          timestamp: new Date().toISOString()
        });
        
        // Run enhanced workflow
        const context = {
          step: async (name, fn) => {
            const stepLog = {
              type: 'step_start',
              eventId: event.id,
              step: name,
              timestamp: new Date().toISOString()
            };
            
            console.log(`▶️ Step: ${name}`);
            workflowLogs[event.id].push(stepLog);
            broadcastLog(stepLog);
            
            try {
              const result = await fn();
              
              const completedLog = {
                type: 'step_complete',
                eventId: event.id,
                step: name,
                result: result,
                timestamp: new Date().toISOString()
              };
              
              console.log(`✓ Completed: ${name}\n`);
              workflowLogs[event.id].push(completedLog);
              broadcastLog(completedLog);
              
              return result;
            } catch (error) {
              const errorLog = {
                type: 'step_error',
                eventId: event.id,
                step: name,
                error: error.message,
                timestamp: new Date().toISOString()
              };
              
              console.error(`❌ Error in ${name}:`, error.message);
              workflowLogs[event.id].push(errorLog);
              broadcastLog(errorLog);
              
              throw error;
            }
          }
        };
        
        handleOperationalEvent({ eventId: event.id, data: event }, context)
          .then(() => {
            event.status = 'completed';
            console.log(`🎉 Workflow completed: ${event.id}\n`);
            
            broadcastLog({
              type: 'workflow_complete',
              eventId: event.id,
              timestamp: new Date().toISOString()
            });
          })
          .catch(error => {
            event.status = 'failed';
            console.error(`❌ Workflow failed: ${error.message}\n`);
            
            broadcastLog({
              type: 'workflow_failed',
              eventId: event.id,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          });
        
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Event received and enhanced workflow triggered',
          event
        }));
        
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }
  
  // GET /api/event
  if (req.url.startsWith('/api/event') && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const project = url.searchParams.get('project');
    
    let filteredEvents = events;
    if (project) {
      filteredEvents = events.filter(e => e.metadata?.project === project);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      events: filteredEvents.slice(-50).reverse(),
      total: filteredEvents.length
    }));
    return;
  }
  
  // GET workflow logs
  if (req.url.startsWith('/api/logs/') && req.method === 'GET') {
    const eventId = req.url.split('/api/logs/')[1];
    const logs = workflowLogs[eventId] || [];
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      eventId,
      logs
    }));
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 AutoFlow ENHANCED Backend Running!`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\n✨ New Features Enabled:`);
  console.log(`   📊 Project/Service Awareness`);
  console.log(`   🔗 Event Correlation & Deduplication`);
  console.log(`   📋 Policy Engine (AI + Rules)`);
  console.log(`   👤 Human-in-the-Loop Approvals`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   GET  /api/health`);
  console.log(`   POST /api/event`);
  console.log(`   GET  /api/event?project=X`);
  console.log(`   GET  /api/projects`);
  console.log(`   GET  /api/projects/:id/health`);
  console.log(`   GET  /api/policies`);
  console.log(`   GET  /api/approvals/pending`);
  console.log(`   GET  /api/approvals/stats`);
  console.log(`   POST /api/approvals/:id/approve`);
  console.log(`   POST /api/approvals/:id/reject`);
  console.log(`   GET  /api/logs/stream (SSE)\n`);
});