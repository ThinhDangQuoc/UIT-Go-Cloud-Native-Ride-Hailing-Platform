import redis, { KEYS } from '../utils/redis.js';

/**
 * Location Service - Handles all driver location operations
 * Optimized for high-throughput location updates (2-3 second intervals)
 * 
 * Architecture: Redis GEOADD (realtime) + SQS (async history)
 * Note: Redis Stream removed to reduce complexity and cost
 */

// Constants
const LOCATION_TTL = 3600; // 1 hour TTL for location metadata
const DELTA_DISTANCE_THRESHOLD = 10; // meters - minimum movement to trigger update
const DELTA_HEADING_THRESHOLD = 15; // degrees - minimum heading change

/**
 * Update driver location with full metadata
 * Uses Redis Pipeline for atomic operations
 * 
 * @param {string} driverId - Driver ID
 * @param {Object} locationData - Location data
 * @param {number} locationData.lat - Latitude
 * @param {number} locationData.lng - Longitude
 * @param {number} [locationData.heading] - Heading (0-360)
 * @param {number} [locationData.speed] - Speed in km/h
 * @param {number} [locationData.accuracy] - GPS accuracy in meters
 * @param {string} [locationData.tripId] - Associated trip ID
 */
export async function updateDriverLocation(driverId, locationData) {
  const { lat, lng, heading, speed, accuracy, tripId } = locationData;
  const timestamp = Date.now();

  const pipeline = redis.pipeline();

  // 1. Update GeoSet for spatial queries (GEORADIUS)
  pipeline.geoadd(KEYS.DRIVERS_LOCATIONS, lng, lat, driverId);

  // 2. Store full location metadata in Hash
  const locationKey = `driver:location:${driverId}`;
  pipeline.hset(locationKey, {
    lat: lat.toString(),
    lng: lng.toString(),
    heading: heading?.toString() || '0',
    speed: speed?.toString() || '0',
    accuracy: accuracy?.toString() || '0',
    tripId: tripId || '',
    updatedAt: timestamp.toString()
  });
  pipeline.expire(locationKey, LOCATION_TTL);

  // 3. Update last known position for delta calculation
  pipeline.set(`driver:lastpos:${driverId}`, JSON.stringify({ lat, lng, heading }));

  try {
    await pipeline.exec();

    // Note: Location history is handled via SQS in controller layer
    // Redis Stream removed to reduce cost (SQS is sufficient)

    return {
      success: true,
      timestamp,
      driverId
    };
  } catch (error) {
    console.error('Location update error:', error);
    throw error;
  }
}

/**
 * Batch update multiple driver locations
 * Optimized for high-throughput scenarios
 * 
 * @param {Array<Object>} locations - Array of location objects
 */
export async function batchUpdateLocations(locations) {
  if (!locations || locations.length === 0) {
    return { success: true, count: 0 };
  }

  const pipeline = redis.pipeline();
  const timestamp = Date.now();

  locations.forEach((loc, index) => {
    const { driverId, lat, lng, heading, speed, accuracy, tripId } = loc;

    // GeoSet update
    pipeline.geoadd(KEYS.DRIVERS_LOCATIONS, lng, lat, driverId);

    // Location metadata
    const locationKey = `driver:location:${driverId}`;
    pipeline.hset(locationKey, {
      lat: lat.toString(),
      lng: lng.toString(),
      heading: heading?.toString() || '0',
      speed: speed?.toString() || '0',
      accuracy: accuracy?.toString() || '0',
      tripId: tripId || '',
      updatedAt: (timestamp + index).toString()
    });
    pipeline.expire(locationKey, LOCATION_TTL);
  });

  try {
    const results = await pipeline.exec();
    return {
      success: true,
      count: locations.length,
      timestamp
    };
  } catch (error) {
    console.error('Batch location update error:', error);
    throw error;
  }
}

/**
 * Get driver location with full metadata
 * 
 * @param {string} driverId - Driver ID
 */
export async function getDriverLocation(driverId) {
  const pipeline = redis.pipeline();
  
  // Get from GeoSet
  pipeline.geopos(KEYS.DRIVERS_LOCATIONS, driverId);
  
  // Get metadata
  pipeline.hgetall(`driver:location:${driverId}`);

  try {
    const results = await pipeline.exec();
    const [geoResult, metaResult] = results;

    const [geoErr, geoPos] = geoResult;
    const [metaErr, metadata] = metaResult;

    if (geoErr || !geoPos || !geoPos[0]) {
      return null;
    }

    return {
      driverId,
      lat: parseFloat(geoPos[0][1]),
      lng: parseFloat(geoPos[0][0]),
      heading: metadata?.heading ? parseInt(metadata.heading) : null,
      speed: metadata?.speed ? parseInt(metadata.speed) : null,
      accuracy: metadata?.accuracy ? parseInt(metadata.accuracy) : null,
      tripId: metadata?.tripId || null,
      updatedAt: metadata?.updatedAt ? parseInt(metadata.updatedAt) : null
    };
  } catch (error) {
    console.error('Get location error:', error);
    throw error;
  }
}

/**
 * Find nearby drivers with distance and metadata
 * 
 * @param {number} lat - Center latitude
 * @param {number} lng - Center longitude
 * @param {number} [radiusKm=5] - Search radius in kilometers
 * @param {number} [limit=20] - Maximum results
 */
export async function findNearbyDrivers(lat, lng, radiusKm = 5, limit = 20) {
  try {
    // Get nearby drivers with distance
    const nearby = await redis.georadius(
      KEYS.DRIVERS_LOCATIONS,
      lng,
      lat,
      radiusKm,
      'km',
      'WITHDIST',
      'WITHCOORD',
      'ASC',
      'COUNT',
      limit
    );

    if (!nearby || nearby.length === 0) {
      return [];
    }

    // Get status for each driver
    const pipeline = redis.pipeline();
    nearby.forEach(([driverId]) => {
      pipeline.get(`${KEYS.DRIVER_STATUS}${driverId}`);
      pipeline.hgetall(`driver:location:${driverId}`);
    });

    const statusResults = await pipeline.exec();

    // Combine data
    const drivers = nearby.map(([driverId, distance, [driverLng, driverLat]], index) => {
      const [statusErr, status] = statusResults[index * 2];
      const [metaErr, metadata] = statusResults[index * 2 + 1];

      return {
        id: driverId,
        lat: parseFloat(driverLat),
        lng: parseFloat(driverLng),
        distance: parseFloat(distance),
        status: status || 'unknown',
        heading: metadata?.heading ? parseInt(metadata.heading) : null,
        speed: metadata?.speed ? parseInt(metadata.speed) : null,
        tripId: metadata?.tripId || null
      };
    });

    // Filter only online drivers (not on trip)
    return drivers.filter(d => d.status === 'online');
  } catch (error) {
    console.error('Find nearby drivers error:', error);
    throw error;
  }
}

/**
 * Remove driver location (when going offline)
 * 
 * @param {string} driverId - Driver ID
 */
export async function removeDriverLocation(driverId) {
  const pipeline = redis.pipeline();
  
  pipeline.zrem(KEYS.DRIVERS_LOCATIONS, driverId);
  pipeline.del(`driver:location:${driverId}`);
  pipeline.del(`driver:lastpos:${driverId}`);

  try {
    await pipeline.exec();
    return { success: true };
  } catch (error) {
    console.error('Remove location error:', error);
    throw error;
  }
}

/**
 * Check if update should be processed based on delta thresholds
 * Implements delta compression to reduce unnecessary writes
 * 
 * @param {string} driverId - Driver ID
 * @param {number} newLat - New latitude
 * @param {number} newLng - New longitude
 * @param {number} newHeading - New heading
 */
async function shouldProcessUpdate(driverId, newLat, newLng, newHeading) {
  try {
    const lastPosStr = await redis.get(`driver:lastpos:${driverId}`);
    
    if (!lastPosStr) {
      return true; // First update, always process
    }

    const lastPos = JSON.parse(lastPosStr);
    
    // Calculate distance using Haversine formula
    const distance = calculateDistance(
      lastPos.lat, lastPos.lng,
      newLat, newLng
    );

    // Check heading change
    const headingDelta = Math.abs((newHeading || 0) - (lastPos.heading || 0));
    const normalizedHeadingDelta = headingDelta > 180 ? 360 - headingDelta : headingDelta;

    // Update if either threshold is exceeded
    return distance >= DELTA_DISTANCE_THRESHOLD || 
           normalizedHeadingDelta >= DELTA_HEADING_THRESHOLD;
  } catch (error) {
    // On error, allow the update
    return true;
  }
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Get location statistics (for monitoring)
 */
export async function getLocationStats() {
  try {
    const pipeline = redis.pipeline();
    
    // Count total drivers with locations
    pipeline.zcard(KEYS.DRIVERS_LOCATIONS);
    
    // Get stream info
    pipeline.xinfo('STREAM', 'stream:driver:locations').catch(() => null);

    const results = await pipeline.exec();
    
    return {
      activeDrivers: results[0][1] || 0,
      streamLength: results[1]?.[1]?.length || 0
    };
  } catch (error) {
    console.error('Get stats error:', error);
    return { activeDrivers: 0, streamLength: 0 };
  }
}

export default {
  updateDriverLocation,
  batchUpdateLocations,
  getDriverLocation,
  findNearbyDrivers,
  removeDriverLocation,
  getLocationStats
};
