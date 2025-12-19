/**
 * Event Correlation & Deduplication Engine
 * Prevents alert storms and correlates related events
 */

const eventHistory = [];
const CORRELATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const SIMILARITY_THRESHOLD = 0.7;

/**
 * Check if two events are similar
 */
function eventsAreSimilar(event1, event2) {
  // Same project/service
  if (event1.metadata?.project !== event2.metadata?.project) {
    return false;
  }

  // Same type
  if (event1.type !== event2.type) {
    return false;
  }

  // Same source
  if (event1.source !== event2.source) {
    return false;
  }

  // Similar message (simple check - could use NLP)
  const message1 = (event1.message || '').toLowerCase();
  const message2 = (event2.message || '').toLowerCase();
  
  // Check for common keywords
  const keywords1 = message1.split(' ').filter(w => w.length > 4);
  const keywords2 = message2.split(' ').filter(w => w.length > 4);
  
  const commonKeywords = keywords1.filter(k => keywords2.includes(k));
  const similarity = commonKeywords.length / Math.max(keywords1.length, keywords2.length);
  
  return similarity >= SIMILARITY_THRESHOLD;
}

/**
 * Find correlated events
 */
export function findCorrelatedEvents(newEvent) {
  const now = Date.now();
  const recentEvents = eventHistory.filter(e => 
    (now - new Date(e.timestamp).getTime()) < CORRELATION_WINDOW_MS
  );

  const correlated = recentEvents.filter(e => 
    eventsAreSimilar(e, newEvent)
  );

  return {
    count: correlated.length,
    events: correlated,
    isStorm: correlated.length >= 3,
    isDuplicate: correlated.length > 0 && 
                 (now - new Date(correlated[correlated.length - 1].timestamp).getTime()) < 60000 // 1 min
  };
}

/**
 * Add event to history
 */
export function recordEvent(event) {
  eventHistory.push({
    ...event,
    recordedAt: new Date().toISOString()
  });

  // Keep only last hour of events
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  while (eventHistory.length > 0 && 
         new Date(eventHistory[0].timestamp).getTime() < oneHourAgo) {
    eventHistory.shift();
  }
}

/**
 * Get event patterns for a project
 */
export function getProjectPatterns(projectId) {
  const projectEvents = eventHistory.filter(e => 
    e.metadata?.project === projectId
  );

  // Group by type
  const byType = {};
  projectEvents.forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + 1;
  });

  // Group by severity
  const bySeverity = {};
  projectEvents.forEach(e => {
    bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
  });

  // Detect patterns
  const patterns = [];
  
  if (projectEvents.length >= 5) {
    patterns.push({
      type: 'frequent_events',
      message: `${projectId} has ${projectEvents.length} events in the last hour`,
      severity: 'warning'
    });
  }

  const criticalEvents = projectEvents.filter(e => e.severity === 'critical');
  if (criticalEvents.length >= 2) {
    patterns.push({
      type: 'multiple_critical',
      message: `${projectId} has ${criticalEvents.length} critical events`,
      severity: 'critical'
    });
  }

  return {
    projectId,
    totalEvents: projectEvents.length,
    byType,
    bySeverity,
    patterns,
    recentEvents: projectEvents.slice(-10)
  };
}

/**
 * Get correlation statistics
 */
export function getCorrelationStats() {
  return {
    totalEvents: eventHistory.length,
    timeWindow: `${CORRELATION_WINDOW_MS / 60000} minutes`,
    recentEventCount: eventHistory.filter(e => 
      (Date.now() - new Date(e.timestamp).getTime()) < CORRELATION_WINDOW_MS
    ).length
  };
}