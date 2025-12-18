// Store events in memory (for demo purposes)
const events = [];

/**
 * POST /api/event
 * Receive external events and trigger workflows
 */
export async function POST(request, { workflow }) {
  try {
    const eventData = await request.json();
    
    // Validate event data
    if (!eventData.type || !eventData.source) {
      return Response.json(
        { 
          error: 'Event must have type and source fields',
          example: {
            type: 'error',
            source: 'production-api',
            severity: 'high',
            message: 'Database connection timeout',
            metadata: {}
          }
        },
        { status: 400 }
      );
    }
    
    // Create event record
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...eventData,
      status: 'received'
    };
    
    // Store event
    events.push(event);
    
    // Trigger workflow using Motia's workflow API
    const workflowRun = await workflow.run('handleOperationalEvent', {
      eventId: event.id,
      data: event
    });
    
    console.log(`✅ Event received: ${event.id}`);
    console.log(`🔄 Workflow triggered: ${workflowRun.id}`);
    
    return Response.json({
      success: true,
      message: 'Event received and workflow triggered',
      event: event,
      workflowId: workflowRun.id
    }, { status: 202 });
    
  } catch (error) {
    console.error('❌ Error receiving event:', error);
    return Response.json(
      { 
        error: 'Failed to process event',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/events
 * List all received events
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    // Return recent events
    const recentEvents = events.slice(-limit).reverse();
    
    return Response.json({
      events: recentEvents,
      total: events.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching events:', error);
    return Response.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}