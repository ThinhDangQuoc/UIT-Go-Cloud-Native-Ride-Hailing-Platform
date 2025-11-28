import { SQSClient, ReceiveMessageCommand, DeleteMessageBatchCommand } from "@aws-sdk/client-sqs";
import pg from 'pg';
import { EventEmitter } from 'events';

const { Pool } = pg;

/**
 * Scalable SQS Location Consumer
 * 
 * Features:
 * - Horizontal scaling support
 * - Batch processing (up to 100 records per insert)
 * - Connection pooling
 * - Graceful shutdown
 * - Health monitoring
 * - Auto-recovery on errors
 * 
 * Deployment: Run multiple instances for horizontal scaling
 */

class ScalableLocationConsumer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.sqsClient = new SQSClient({
      region: options.awsRegion || process.env.AWS_REGION || 'ap-southeast-1',
    });
    
    this.queueUrl = options.queueUrl || process.env.SQS_LOCATION_HISTORY_QUEUE_URL;
    this.batchSize = options.batchSize || 10; // SQS max is 10
    this.visibilityTimeout = options.visibilityTimeout || 60;
    this.waitTimeSeconds = options.waitTimeSeconds || 20; // Long polling
    this.maxBatchInsert = options.maxBatchInsert || 100; // PG batch insert size
    
    // PostgreSQL connection pool
    this.pgPool = new Pool({
      host: options.dbHost || process.env.DB_HOST,
      port: options.dbPort || process.env.DB_PORT || 5432,
      database: options.dbName || process.env.DB_NAME,
      user: options.dbUser || process.env.DB_USER,
      password: options.dbPassword || process.env.DB_PASSWORD,
      max: options.dbPoolSize || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    
    this.isRunning = false;
    this.isPaused = false;
    this.stats = {
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesFailed: 0,
      batchesInserted: 0,
      totalRecordsInserted: 0,
      errors: 0,
      lastProcessedAt: null,
      startedAt: null,
      instanceId: `consumer-${process.pid}-${Date.now()}`,
    };
    
    // Buffer for batch inserts
    this.insertBuffer = [];
    this.flushTimer = null;
  }

  /**
   * Start the consumer
   */
  async start() {
    if (this.isRunning) {
      console.log('Consumer already running');
      return;
    }

    console.log(`🚀 Starting Location Consumer: ${this.stats.instanceId}`);
    this.isRunning = true;
    this.stats.startedAt = new Date().toISOString();

    // Start flush timer for batch inserts
    this.flushTimer = setInterval(() => this.flushBuffer(), 5000);

    // Main processing loop
    while (this.isRunning) {
      if (this.isPaused) {
        await this.sleep(1000);
        continue;
      }

      try {
        await this.pollAndProcess();
      } catch (error) {
        console.error('Poll error:', error);
        this.stats.errors++;
        this.emit('error', error);
        await this.sleep(5000); // Back off on error
      }
    }

    console.log('Consumer stopped');
  }

  /**
   * Poll SQS and process messages
   */
  async pollAndProcess() {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: this.batchSize,
      VisibilityTimeout: this.visibilityTimeout,
      WaitTimeSeconds: this.waitTimeSeconds,
      MessageAttributeNames: ['All'],
    });

    const response = await this.sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      return;
    }

    this.stats.messagesReceived += response.Messages.length;
    console.log(`📥 Received ${response.Messages.length} messages`);

    const successfulMessages = [];

    for (const message of response.Messages) {
      try {
        const body = JSON.parse(message.Body);
        
        // Add to insert buffer
        this.insertBuffer.push({
          driverId: parseInt(body.driverId),
          lat: parseFloat(body.lat),
          lng: parseFloat(body.lng),
          heading: body.heading ? parseInt(body.heading) : null,
          speed: body.speed ? parseInt(body.speed) : null,
          accuracy: body.accuracy ? parseInt(body.accuracy) : null,
          tripId: body.tripId ? parseInt(body.tripId) : null,
          recordedAt: body.recordedAt || new Date().toISOString(),
        });

        successfulMessages.push(message);
        this.stats.messagesProcessed++;
      } catch (error) {
        console.error('Message parse error:', error, message.Body);
        this.stats.messagesFailed++;
        // Still mark for deletion to avoid reprocessing bad messages
        successfulMessages.push(message);
      }
    }

    // Flush if buffer exceeds threshold
    if (this.insertBuffer.length >= this.maxBatchInsert) {
      await this.flushBuffer();
    }

    // Delete processed messages
    if (successfulMessages.length > 0) {
      await this.deleteMessages(successfulMessages);
    }

    this.stats.lastProcessedAt = new Date().toISOString();
  }

  /**
   * Flush insert buffer to PostgreSQL
   */
  async flushBuffer() {
    if (this.insertBuffer.length === 0) return;

    const records = this.insertBuffer.splice(0, this.maxBatchInsert);
    
    const client = await this.pgPool.connect();
    
    try {
      // Build batch insert query
      const values = [];
      const placeholders = [];
      let paramIndex = 1;

      for (const record of records) {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );
        values.push(
          record.driverId,
          record.lat,
          record.lng,
          record.heading,
          record.speed,
          record.accuracy,
          record.tripId,
          record.recordedAt
        );
      }

      const query = `
        INSERT INTO driver_location_history 
        (driver_id, lat, lng, heading, speed, accuracy, trip_id, recorded_at)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT DO NOTHING
      `;

      await client.query(query, values);
      
      this.stats.batchesInserted++;
      this.stats.totalRecordsInserted += records.length;
      
      console.log(`✅ Inserted ${records.length} location records`);
      this.emit('batchInserted', { count: records.length });
      
    } catch (error) {
      console.error('Batch insert error:', error);
      this.stats.errors++;
      // Put records back in buffer for retry
      this.insertBuffer.unshift(...records);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete processed messages from SQS
   */
  async deleteMessages(messages) {
    if (messages.length === 0) return;

    const entries = messages.map((msg, index) => ({
      Id: `msg-${index}`,
      ReceiptHandle: msg.ReceiptHandle,
    }));

    try {
      await this.sqsClient.send(new DeleteMessageBatchCommand({
        QueueUrl: this.queueUrl,
        Entries: entries,
      }));
    } catch (error) {
      console.error('Delete messages error:', error);
      // Non-critical, messages will become visible again after timeout
    }
  }

  /**
   * Stop the consumer gracefully
   */
  async stop() {
    console.log('Stopping consumer...');
    this.isRunning = false;
    
    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    // Flush remaining buffer
    if (this.insertBuffer.length > 0) {
      console.log(`Flushing ${this.insertBuffer.length} remaining records...`);
      await this.flushBuffer();
    }
    
    // Close DB pool
    await this.pgPool.end();
    
    console.log('Consumer stopped. Stats:', this.getStats());
  }

  /**
   * Pause processing
   */
  pause() {
    this.isPaused = true;
    console.log('Consumer paused');
  }

  /**
   * Resume processing
   */
  resume() {
    this.isPaused = false;
    console.log('Consumer resumed');
  }

  /**
   * Get consumer statistics
   */
  getStats() {
    const uptime = this.stats.startedAt 
      ? (Date.now() - new Date(this.stats.startedAt).getTime()) / 1000 
      : 0;
    
    return {
      ...this.stats,
      uptimeSeconds: uptime,
      messagesPerSecond: uptime > 0 
        ? (this.stats.messagesProcessed / uptime).toFixed(2) 
        : 0,
      bufferSize: this.insertBuffer.length,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
    };
  }

  /**
   * Health check for container orchestration
   */
  isHealthy() {
    // Unhealthy if:
    // - Too many errors
    // - No messages processed in 5 minutes while running
    const errorRate = this.stats.messagesReceived > 0 
      ? this.stats.messagesFailed / this.stats.messagesReceived 
      : 0;
    
    const lastProcessed = this.stats.lastProcessedAt 
      ? Date.now() - new Date(this.stats.lastProcessedAt).getTime() 
      : 0;
    
    const isStale = this.isRunning && lastProcessed > 300000; // 5 minutes
    const hasHighErrorRate = errorRate > 0.1; // 10% error rate
    
    return !isStale && !hasHighErrorRate;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use as module or standalone
export default ScalableLocationConsumer;

// Standalone execution
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const consumer = new ScalableLocationConsumer();
  
  consumer.on('error', (error) => {
    console.error('Consumer error:', error);
  });
  
  consumer.on('batchInserted', ({ count }) => {
    console.log(`Batch inserted: ${count} records`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await consumer.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await consumer.stop();
    process.exit(0);
  });
  
  // Health check endpoint (for Kubernetes)
  import('http').then(http => {
    http.createServer((req, res) => {
      if (req.url === '/health') {
        const healthy = consumer.isHealthy();
        res.writeHead(healthy ? 200 : 503);
        res.end(JSON.stringify(consumer.getStats()));
      } else if (req.url === '/stats') {
        res.writeHead(200);
        res.end(JSON.stringify(consumer.getStats(), null, 2));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    }).listen(process.env.HEALTH_PORT || 8090);
  });
  
  consumer.start();
}
