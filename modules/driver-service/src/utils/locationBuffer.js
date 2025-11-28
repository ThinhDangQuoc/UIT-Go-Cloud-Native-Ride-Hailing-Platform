import redis, { KEYS } from './redis.js';

/**
 * Location Write Coalescing Buffer
 * 
 * Mục đích: Giảm số lượng Redis writes bằng cách gộp nhiều updates
 * cho cùng một driver trong một khoảng thời gian ngắn.
 * 
 * Khi driver gửi nhiều updates liên tiếp (ví dụ: reconnect, batch from mobile),
 * chỉ giữ lại location mới nhất và flush theo batch.
 * 
 * Performance improvement: ~2-5x throughput increase
 */

class LocationBuffer {
  constructor(options = {}) {
    this.buffer = new Map(); // driverId -> { location, timestamp, metadata }
    this.flushIntervalMs = options.flushIntervalMs || 100; // Flush every 100ms
    this.maxBufferSize = options.maxBufferSize || 10000; // Max drivers in buffer
    this.flushThreshold = options.flushThreshold || 500; // Force flush at this size
    
    this.stats = {
      totalReceived: 0,
      totalFlushed: 0,
      totalCoalesced: 0, // Updates skipped due to coalescing
      lastFlushTime: Date.now(),
      flushCount: 0,
    };

    // Start periodic flush
    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Add location update to buffer
   * @param {string} driverId 
   * @param {Object} location - { lat, lng, heading, speed, accuracy, tripId }
   * @returns {Object} - { buffered: boolean, coalesced: boolean }
   */
  add(driverId, location) {
    this.stats.totalReceived++;
    
    const existing = this.buffer.get(driverId);
    const now = Date.now();
    
    // Store only the latest location for each driver
    this.buffer.set(driverId, {
      ...location,
      driverId,
      timestamp: now,
    });

    // Track if this was a coalescing (overwrote previous unflushed update)
    if (existing) {
      this.stats.totalCoalesced++;
    }

    // Force flush if buffer is too large
    if (this.buffer.size >= this.flushThreshold) {
      this.flush();
    }

    return {
      buffered: true,
      coalesced: existing !== undefined,
      bufferSize: this.buffer.size,
    };
  }

  /**
   * Flush all buffered locations to Redis
   * Uses pipeline for optimal performance
   */
  async flush() {
    if (this.buffer.size === 0) {
      return { flushed: 0 };
    }

    const startTime = Date.now();
    const locations = Array.from(this.buffer.values());
    this.buffer.clear();

    try {
      const pipeline = redis.pipeline();

      for (const loc of locations) {
        // Update GeoSet
        pipeline.geoadd(KEYS.DRIVERS_LOCATIONS, loc.lng, loc.lat, loc.driverId);
        
        // Update location metadata hash
        pipeline.hset(`driver:location:${loc.driverId}`, {
          lat: loc.lat.toString(),
          lng: loc.lng.toString(),
          heading: (loc.heading || 0).toString(),
          speed: (loc.speed || 0).toString(),
          accuracy: (loc.accuracy || 0).toString(),
          tripId: loc.tripId || '',
          updatedAt: loc.timestamp.toString(),
        });
        
        // Set TTL for metadata
        pipeline.expire(`driver:location:${loc.driverId}`, 3600);
      }

      await pipeline.exec();

      // Update stats
      this.stats.totalFlushed += locations.length;
      this.stats.flushCount++;
      this.stats.lastFlushTime = Date.now();
      this.stats.lastFlushDuration = Date.now() - startTime;

      return {
        flushed: locations.length,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Buffer flush error:', error);
      // Re-add failed locations to buffer for retry
      for (const loc of locations) {
        this.buffer.set(loc.driverId, loc);
      }
      throw error;
    }
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentBufferSize: this.buffer.size,
      coalescingRate: this.stats.totalReceived > 0 
        ? (this.stats.totalCoalesced / this.stats.totalReceived * 100).toFixed(2) + '%'
        : '0%',
      avgFlushSize: this.stats.flushCount > 0
        ? Math.round(this.stats.totalFlushed / this.stats.flushCount)
        : 0,
    };
  }

  /**
   * Graceful shutdown - flush remaining buffer
   */
  async shutdown() {
    console.log('Shutting down location buffer...');
    clearInterval(this.flushTimer);
    
    if (this.buffer.size > 0) {
      console.log(`Flushing ${this.buffer.size} remaining locations...`);
      await this.flush();
    }
    
    console.log('Location buffer shutdown complete');
    console.log('Final stats:', this.getStats());
  }
}

// Singleton instance
let bufferInstance = null;

export function getLocationBuffer(options = {}) {
  if (!bufferInstance) {
    bufferInstance = new LocationBuffer(options);
  }
  return bufferInstance;
}

export default LocationBuffer;
