// path: trip-service/utils/tripSqs.js
import { SQSClient, SendMessageCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import dotenv from "dotenv";

dotenv.config();

// Cấu hình Client SDK v3
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.SQS_ENDPOINT || "http://localstack:4566",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  },
});

const QUEUE_NAME = process.env.SQS_TRIP_QUEUE_NAME || "trip-events";
let queueUrlCache = null;

const QUEUE_URL = process.env.SQS_QUEUE_URL || "http://localstack:4566/000000000000/trip-events";

// Hàm gửi Job (Offer chuyến đi)
export const pushTripOfferJob = async (tripData) => {
  try {
    const queueUrl = QUEUE_URL;
    
    const payload = {
      type: "TRIP_OFFER", // Định danh loại sự kiện
      data: tripData,
      timestamp: new Date().toISOString(),
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    });

    const result = await sqsClient.send(command);
    console.log(`📤 [TripService] SQS Sent | MsgID: ${result.MessageId}`);
    return result;
  } catch (err) {
    console.error("❌ [TripService] SQS Send Error:", err);
    throw err;
  }
};