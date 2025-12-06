import redis, { KEYS } from './redis.js';

class LocationBuffer {
  constructor(options = {}) {
    this.buffer = new Map(); 
    this.flushIntervalMs = options.flushIntervalMs || 100;
    this.maxBufferSize = options.maxBufferSize || 10000;
    this.flushThreshold = options.flushThreshold || 500;

    this.stats = {
      totalReceived: 0,
      totalFlushed: 0,
      totalCoalesced: 0,
      lastFlushTime: Date.now(),
      flushCount: 0,
    };

    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Add location update
   * @param {Object} data - { driverId, lat, lng, heading, speed, accuracy, tripId }
   */
  add(data) {
    const { driverId } = data;

    if (!driverId) {
      console.error("❌ LocationBuffer.add() missing driverId");
      return;
    }

    this.stats.totalReceived++;

    const existing = this.buffer.get(driverId);
    const now = Date.now();

    // Save the newest update
    this.buffer.set(driverId, {
      ...data,
      timestamp: now
    });

    if (existing) {
      this.stats.totalCoalesced++;
    }

    if (this.buffer.size >= this.flushThreshold) {
      this.flush();
    }

    return {
      buffered: true,
      coalesced: !!existing,
      bufferSize: this.buffer.size,
    };
  }

  /**
   * Flush buffer into Redis
   */
  async flush() {
    const size = this.buffer.size;
    if (size === 0) return { flushed: 0 };

    const start = Date.now();
    const locations = Array.from(this.buffer.values());

    // Clear buffer early to avoid blocking
    this.buffer.clear();

    try {
      const pipeline = redis.pipeline();

      for (const loc of locations) {
        pipeline.geoadd(KEYS.DRIVERS_LOCATIONS, loc.lng, loc.lat, loc.driverId);

        pipeline.hset(`driver:location:${loc.driverId}`, {
          lat: String(loc.lat),
          lng: String(loc.lng),
          heading: String(loc.heading || 0),
          speed: String(loc.speed || 0),
          accuracy: String(loc.accuracy || 0),
          tripId: loc.tripId || "",
          updatedAt: String(loc.timestamp),
        });

        pipeline.expire(`driver:location:${loc.driverId}`, 3600);
      }

      await pipeline.exec();

      console.log(`💾 [Buffer] Flushed ${locations.length} driver locations to Redis.`);

      this.stats.totalFlushed += locations.length;
      this.stats.flushCount++;
      this.stats.lastFlushTime = Date.now();
      this.stats.lastFlushDuration = Date.now() - start;

      return {
        flushed: locations.length,
        duration: Date.now() - start,
      };

    } catch (error) {
      console.error('Buffer flush error:', error);

      // Requeue locations
      for (const loc of locations) {
        this.buffer.set(loc.driverId, loc);
      }

      throw error;
    }
  }

  getStats() {
    return {
      ...this.stats,
      currentBufferSize: this.buffer.size,
      coalescingRate:
        this.stats.totalReceived
          ? ((this.stats.totalCoalesced / this.stats.totalReceived) * 100).toFixed(2) + '%'
          : '0%',
      avgFlushSize:
        this.stats.flushCount
          ? Math.round(this.stats.totalFlushed / this.stats.flushCount)
          : 0,
    };
  }

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

let bufferInstance = null;

export function getLocationBuffer(options = {}) {
  if (!bufferInstance) bufferInstance = new LocationBuffer(options);
  return bufferInstance;
}

export const locationBuffer = new LocationBuffer();
