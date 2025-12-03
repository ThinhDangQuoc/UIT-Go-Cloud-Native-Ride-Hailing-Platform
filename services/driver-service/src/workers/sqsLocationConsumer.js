import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, DeleteMessageBatchCommand } from "@aws-sdk/client-sqs";
import redis, { KEYS } from '../utils/redis.js';

/**
 * SQS Location Consumer Worker
 * Processes location updates from SQS queue and writes to Redis
 * Designed for batch processing and high throughput
 */

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || "ap-southeast-1",
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const QUEUE_URL = process.env.SQS_LOCATION_QUEUE_URL;
const BATCH_SIZE = 10;
const VISIBILITY_TIMEOUT = 30;
const WAIT_TIME = 20; // Long polling

let isRunning = false;
let processedCount = 0;
let errorCount = 0;

/**
 * Start the SQS consumer worker
 */
export async function startWorker() {
  if (!QUEUE_URL) {
    console.log("SQS_LOCATION_QUEUE_URL not configured, worker not started");
    return;
  }

  console.log("🚀 Starting SQS Location Consumer Worker...");
  isRunning = true;

  while (isRunning) {
    try {
      await pollAndProcess();
    } catch (error) {
      console.error("Worker error:", error);
      errorCount++;
      // Wait before retrying on error
      await sleep(5000);
    }
  }
}

/**
 * Stop the worker gracefully
 */
export function stopWorker() {
  console.log("Stopping SQS Location Consumer Worker...");
  isRunning = false;
}

/**
 * Poll SQS and process messages
 */
async function pollAndProcess() {
  const command = new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: BATCH_SIZE,
    VisibilityTimeout: VISIBILITY_TIMEOUT,
    WaitTimeSeconds: WAIT_TIME,
    MessageAttributeNames: ["All"],
  });

  const response = await sqsClient.send(command);

  if (!response.Messages || response.Messages.length === 0) {
    return; // No messages, continue polling
  }

  console.log(`📥 Received ${response.Messages.length} messages`);

  // Process messages in batch
  const successfulMessages = [];
  const pipeline = redis.pipeline();

  for (const message of response.Messages) {
    try {
      const body = JSON.parse(message.Body);
      
      if (body.type === "driver.location_update") {
        const { driverId, lat, lng, heading, speed, accuracy, tripId } = body;

        // Add to Redis pipeline
        pipeline.geoadd(KEYS.DRIVERS_LOCATIONS, lng, lat, driverId);
        
        // Update location metadata
        pipeline.hset(`driver:location:${driverId}`, {
          lat: lat.toString(),
          lng: lng.toString(),
          heading: heading?.toString() || '0',
          speed: speed?.toString() || '0',
          accuracy: accuracy?.toString() || '0',
          tripId: tripId || '',
          updatedAt: Date.now().toString()
        });
        pipeline.expire(`driver:location:${driverId}`, 3600);

        successfulMessages.push(message);
      }
    } catch (error) {
      console.error("Failed to parse message:", error);
      errorCount++;
    }
  }

  // Execute Redis pipeline
  if (successfulMessages.length > 0) {
    try {
      await pipeline.exec();
      processedCount += successfulMessages.length;
      console.log(`✅ Processed ${successfulMessages.length} location updates`);

      // Delete processed messages from SQS
      await deleteMessages(successfulMessages);
    } catch (error) {
      console.error("Redis pipeline error:", error);
      errorCount++;
    }
  }
}

/**
 * Delete processed messages from SQS
 */
async function deleteMessages(messages) {
  if (messages.length === 0) return;

  const entries = messages.map((msg, index) => ({
    Id: `msg-${index}`,
    ReceiptHandle: msg.ReceiptHandle,
  }));

  const command = new DeleteMessageBatchCommand({
    QueueUrl: QUEUE_URL,
    Entries: entries,
  });

  try {
    await sqsClient.send(command);
  } catch (error) {
    console.error("Failed to delete messages:", error);
  }
}

/**
 * Get worker statistics
 */
export function getWorkerStats() {
  return {
    isRunning,
    processedCount,
    errorCount,
    uptime: process.uptime(),
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  stopWorker();
});

process.on("SIGINT", () => {
  stopWorker();
});

export default {
  startWorker,
  stopWorker,
  getWorkerStats,
};
