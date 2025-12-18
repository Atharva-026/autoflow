/**
 * STEP 1: Ingest and validate event
 * This is the entry point of our workflow
 */
export async function ingestEvent(input, context) {
  const { eventId, data } = input;
  
  console.log(`📥 Ingesting event: ${eventId}`);
  
  // Validate event structure
  const validationErrors = [];
  
  if (!data.type) validationErrors.push('Missing event type');
  if (!data.source) validationErrors.push('Missing event source');
  
  if (validationErrors.length > 0) {
    throw new Error(`Invalid event: ${validationErrors.join(', ')}`);
  }
  
  console.log(`✅ Event validated: ${data.type} from ${data.source}`);
  
  // Return validated event data for next steps
  return {
    eventId,
    eventData: data,
    receivedAt: new Date().toISOString()
  };
}