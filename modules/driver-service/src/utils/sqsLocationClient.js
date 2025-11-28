import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from "@aws-sdk/client-sqs";

/**
 * SQS Client for Driver Location Event Streaming
 * Supports both single and batch message publishing
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

// Queue URLs from environment
const LOCATION_QUEUE_URL = process.env.SQS_LOCATION_QUEUE_URL;
const LOCATION_HISTORY_QUEUE_URL = process.env.SQS_LOCATION_HISTORY_QUEUE_URL;

/**
 * Publish single location update to SQS
 * Used for real-time location updates
 * 
 * @param {Object} locationData - Location data
 * @param {string} locationData.driverId - Driver ID
 * @param {number} locationData.lat - Latitude
 * @param {number} locationData.lng - Longitude
 * @param {number} [locationData.heading] - Heading in degrees
 * @param {number} [locationData.speed] - Speed in km/h
 * @param {string} [locationData.tripId] - Associated trip ID
 */
export async function publishLocationUpdate(locationData) {
  if (!LOCATION_QUEUE_URL) {
    console.warn("SQS_LOCATION_QUEUE_URL not configured, skipping publish");
    return null;
  }

  const message = {
    type: "driver.location_update",
    version: "1.0",
    ...locationData,
    timestamp: new Date().toISOString(),
  };

  const command = new SendMessageCommand({
    QueueUrl: LOCATION_QUEUE_URL,
    MessageBody: JSON.stringify(message),
    MessageAttributes: {
      MessageType: {
        StringValue: "location_update",
        DataType: "String",
      },
      DriverId: {
        StringValue: locationData.driverId.toString(),
        DataType: "String",
      },
    },
    // Use driver ID as deduplication ID to prevent duplicate processing
    MessageDeduplicationId: `${locationData.driverId}-${Date.now()}`,
    MessageGroupId: locationData.driverId.toString(),
  });

  try {
    const response = await sqsClient.send(command);
    return response.MessageId;
  } catch (error) {
    console.error("Failed to publish location to SQS:", error);
    throw error;
  }
}

/**
 * Publish batch location updates to SQS
 * Used for efficient batch processing (up to 10 messages per batch)
 * 
 * @param {Array<Object>} locations - Array of location data objects
 */
export async function publishLocationBatch(locations) {
  if (!LOCATION_HISTORY_QUEUE_URL) {
    console.warn("SQS_LOCATION_HISTORY_QUEUE_URL not configured, skipping publish");
    return null;
  }

  if (!locations || locations.length === 0) {
    return { successful: 0, failed: 0 };
  }

  // SQS allows max 10 messages per batch
  const batches = [];
  for (let i = 0; i < locations.length; i += 10) {
    batches.push(locations.slice(i, i + 10));
  }

  let successful = 0;
  let failed = 0;

  for (const batch of batches) {
    const entries = batch.map((loc, index) => ({
      Id: `msg-${index}`,
      MessageBody: JSON.stringify({
        type: "driver.location_batch",
        version: "1.0",
        ...loc,
        timestamp: new Date().toISOString(),
      }),
      MessageAttributes: {
        MessageType: {
          StringValue: "location_batch",
          DataType: "String",
        },
        DriverId: {
          StringValue: loc.driverId.toString(),
          DataType: "String",
        },
      },
    }));

    const command = new SendMessageBatchCommand({
      QueueUrl: LOCATION_HISTORY_QUEUE_URL,
      Entries: entries,
    });

    try {
      const response = await sqsClient.send(command);
      successful += response.Successful?.length || 0;
      failed += response.Failed?.length || 0;

      if (response.Failed?.length > 0) {
        console.error("Some messages failed:", response.Failed);
      }
    } catch (error) {
      console.error("Failed to publish batch to SQS:", error);
      failed += batch.length;
    }
  }

  return { successful, failed };
}

/**
 * Publish location for history storage (async, for PostgreSQL batch insert)
 * Lower priority queue with larger batch size
 * 
 * @param {Object} locationData - Location data with full metadata
 */
export async function publishToHistoryQueue(locationData) {
  if (!LOCATION_HISTORY_QUEUE_URL) {
    return null;
  }

  const message = {
    type: "driver.location_history",
    version: "1.0",
    driverId: locationData.driverId,
    lat: locationData.lat,
    lng: locationData.lng,
    heading: locationData.heading || null,
    speed: locationData.speed || null,
    accuracy: locationData.accuracy || null,
    tripId: locationData.tripId || null,
    recordedAt: new Date().toISOString(),
  };

  const command = new SendMessageCommand({
    QueueUrl: LOCATION_HISTORY_QUEUE_URL,
    MessageBody: JSON.stringify(message),
    // Delay for batch aggregation (5 seconds)
    DelaySeconds: 5,
    MessageAttributes: {
      MessageType: {
        StringValue: "location_history",
        DataType: "String",
      },
    },
  });

  try {
    const response = await sqsClient.send(command);
    return response.MessageId;
  } catch (error) {
    console.error("Failed to publish to history queue:", error);
    // Non-critical, log but don't throw
    return null;
  }
}

export default {
  publishLocationUpdate,
  publishLocationBatch,
  publishToHistoryQueue,
};
