// IMPORTANT: Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';

// Import workflow
import handleOperationalEvent from './workflows/handleEvent.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    
    // Add client to SSE subscribers
    sseClients.push(res);
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to workflow logs' })}\n\n`);
    
    // Remove client on disconnect
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
      activeClients: sseClients.length
    }));
    return;
  }
  
  // POST /api/event
  if (req.url === '/api/event' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const eventData = JSON.parse(body);
        
        // Create event
        const event = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          ...eventData,
          status: 'processing'
        };
        
        events.push(event);
        workflowLogs[event.id] = [];
        
        console.log(`\n✅ Event received: ${event.id}`);
        console.log(`   Type: ${event.type}`);
        console.log(`   Source: ${event.source}\n`);
        
        // Broadcast event received
        broadcastLog({
          type: 'event_received',
          eventId: event.id,
          event,
          timestamp: new Date().toISOString()
        });
        
        // Run workflow with logging
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
          message: 'Event received and workflow triggered',
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      events: events.slice(-50).reverse(),
      total: events.length
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
  console.log(`\n🚀 AutoFlow Backend Running!`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   GET  /api/health`);
  console.log(`   POST /api/event`);
  console.log(`   GET  /api/event`);
  console.log(`   GET  /api/logs/stream (SSE)`);
  console.log(`   GET  /api/logs/:eventId\n`);
});