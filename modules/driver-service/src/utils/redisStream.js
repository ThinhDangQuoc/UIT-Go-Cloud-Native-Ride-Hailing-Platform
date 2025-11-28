import redis from './redis.js';

/**
 * Redis Stream utilities for Driver Location Events
 * Provides event sourcing capability for location updates
 */

const STREAM_KEY = 'stream:driver:locations';
const MAX_STREAM_LENGTH = 100000; // Giữ tối đa 100k events

/**
 * Publish location update event to Redis Stream
 * @param {Object} locationData - Location data object
 * @param {string} locationData.driverId - Driver ID
 * @param {number} locationData.lat - Latitude
 * @param {number} locationData.lng - Longitude
 * @param {number} [locationData.heading] - Heading in degrees (0-360)
 * @param {number} [locationData.speed] - Speed in km/h
 * @param {number} [locationData.accuracy] - GPS accuracy in meters
 * @param {string} [locationData.tripId] - Associated trip ID if on trip
 */
export async function publishLocationEvent(locationData) {
  const {
    driverId,
    lat,
    lng,
    heading = null,
    speed = null,
    accuracy = null,
    tripId = null
  } = locationData;

  const timestamp = Date.now();

  try {
    // XADD with MAXLEN to auto-trim old events
    await redis.xadd(
      STREAM_KEY,
      'MAXLEN', '~', MAX_STREAM_LENGTH,
      '*', // Auto-generate ID
      'driverId', driverId,
      'lat', lat.toString(),
      'lng', lng.toString(),
      'heading', heading?.toString() || '',
      'speed', speed?.toString() || '',
      'accuracy', accuracy?.toString() || '',
      'tripId', tripId || '',
      'timestamp', timestamp.toString()
    );

    return { success: true, timestamp };
  } catch (error) {
    console.error('Failed to publish location event:', error);
    throw error;
  }
}

/**
 * Publish batch location events using pipeline
 * @param {Array<Object>} locations - Array of location data objects
 */
export async function publishLocationEventsBatch(locations) {
  const pipeline = redis.pipeline();
  const timestamp = Date.now();

  locations.forEach((loc, index) => {
    pipeline.xadd(
      STREAM_KEY,
      'MAXLEN', '~', MAX_STREAM_LENGTH,
      '*',
      'driverId', loc.driverId,
      'lat', loc.lat.toString(),
      'lng', loc.lng.toString(),
      'heading', loc.heading?.toString() || '',
      'speed', loc.speed?.toString() || '',
      'accuracy', loc.accuracy?.toString() || '',
      'tripId', loc.tripId || '',
      'timestamp', (timestamp + index).toString() // Ensure unique timestamps
    );
  });

  try {
    const results = await pipeline.exec();
    return { success: true, count: results.length };
  } catch (error) {
    console.error('Failed to publish batch location events:', error);
    throw error;
  }
}

/**
 * Read location events from stream (for consumers/debugging)
 * @param {string} [lastId='0'] - Last read ID, use '0' to read from beginning
 * @param {number} [count=100] - Number of events to read
 */
export async function readLocationEvents(lastId = '0', count = 100) {
  try {
    const events = await redis.xrange(STREAM_KEY, lastId, '+', 'COUNT', count);
    return events.map(([id, fields]) => {
      const data = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }
      return { id, ...data };
    });
  } catch (error) {
    console.error('Failed to read location events:', error);
    throw error;
  }
}

/**
 * Read events for a specific driver
 * @param {string} driverId - Driver ID to filter
 * @param {number} [limit=50] - Maximum events to return
 */
export async function getDriverLocationHistory(driverId, limit = 50) {
  try {
    // Read recent events and filter by driverId
    const events = await redis.xrevrange(STREAM_KEY, '+', '-', 'COUNT', limit * 10);
    
    const filtered = events
      .map(([id, fields]) => {
        const data = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }
        return { id, ...data };
      })
      .filter(event => event.driverId === driverId)
      .slice(0, limit);

    return filtered;
  } catch (error) {
    console.error('Failed to get driver location history:', error);
    throw error;
  }
}

/**
 * Get stream info (for monitoring)
 */
export async function getStreamInfo() {
  try {
    const info = await redis.xinfo('STREAM', STREAM_KEY);
    const infoObj = {};
    for (let i = 0; i < info.length; i += 2) {
      infoObj[info[i]] = info[i + 1];
    }
    return infoObj;
  } catch (error) {
    // Stream doesn't exist yet
    if (error.message.includes('no such key')) {
      return { length: 0, exists: false };
    }
    throw error;
  }
}

export default {
  publishLocationEvent,
  publishLocationEventsBatch,
  readLocationEvents,
  getDriverLocationHistory,
  getStreamInfo
};
