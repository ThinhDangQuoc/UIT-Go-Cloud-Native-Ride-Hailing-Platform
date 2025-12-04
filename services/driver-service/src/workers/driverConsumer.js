import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import redis, { KEYS } from "../utils/redis.js";

const REGION = process.env.AWS_REGION || "us-east-1";
const SQS_ENDPOINT = process.env.SQS_ENDPOINT || "http://localstack:4566";
const QUEUE_NAME = process.env.SQS_TRIP_QUEUE_NAME || "trip-events";
const OFFER_TIMEOUT_MS = 15000; // ⏳ 15 Giây hết hạn

const sqsClient = new SQSClient({
  region: REGION,
  endpoint: SQS_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  },
});

let queueUrl = null;

async function getQueueUrl() {
  if (queueUrl) return queueUrl;
  try {
    const command = new GetQueueUrlCommand({ QueueName: QUEUE_NAME });
    const res = await sqsClient.send(command);
    queueUrl = res.QueueUrl;
    return queueUrl;
  } catch (err) {
    console.error("❌ [DriverConsumer] Cannot get Queue URL:", err.message);
    throw err;
  }
}

export async function startDriverConsumer(io) {
  console.log("🚀 [DriverConsumer] Starting Polling with 15s Timeout Logic...");
  try { await getQueueUrl(); } catch(e) { return; }

  while (true) {
    try {
      const { Messages } = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 10,
        VisibilityTimeout: 30,
      }));

      if (Messages && Messages.length > 0) {
        for (const msg of Messages) {
          try {
            const body = JSON.parse(msg.Body);
            const tripData = body.data;
            // Lấy timestamp lúc tạo job
            const jobCreatedTime = new Date(body.timestamp).getTime();
            const now = Date.now();
            const elapsedTime = now - jobCreatedTime;

            // --- LOGIC KIỂM TRA HẾT HẠN (15s) ---
            if (elapsedTime > OFFER_TIMEOUT_MS) {
              console.warn(`⚠️ [DriverConsumer] Job ${body.data.tripId} EXPIRED (${elapsedTime/1000}s > 15s). Dropping...`);
              
              // Xóa tin nhắn khỏi hàng đợi để không xử lý lại
              await sqsClient.send(new DeleteMessageCommand({
                QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle
              }));
              continue; // Bỏ qua, không gửi Socket
            }

            // Nếu còn hạn, tính thời gian còn lại để gửi xuống Client đếm ngược
            const remainingTime = OFFER_TIMEOUT_MS - elapsedTime;
            const { tripId, pickupLat, pickupLng } = body.data;

            console.log(`🔍 [DriverConsumer] Processing Job ${tripId}. Remaining time: ${remainingTime}ms`);
            
            console.log(`   📍 Searching near: Lat=${pickupLat}, Lng=${pickupLng}`);
            // Tìm tài xế gần đó
            if (pickupLat && pickupLng) {
               const nearbyDriverIds = await redis.georadius(
                  KEYS.DRIVERS_LOCATIONS, parseFloat(pickupLng), parseFloat(pickupLat), 5, 'km'
               );

               if (nearbyDriverIds.length > 0) {
                  nearbyDriverIds.forEach(driverId => {
                    io.to(`driver:${driverId}`).emit("tripOffer", { 
                       ...body.data,
                       timeoutMs: remainingTime, // Gửi thời gian còn lại cho App hiển thị thanh đếm ngược
                       msg: "New trip nearby!"
                    });
                  });
                  console.log(`📡 Sent to ${nearbyDriverIds.length} drivers.`);
               }
            }
            
            io.emit("tripOffer", { 
               message: "New trip available!",
               trip: tripData 
            });

            console.log(`📡 [DriverConsumer] Broadcasted trip ${tripData.tripId} to drivers`);

            await sqsClient.send(new DeleteMessageCommand({
              QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle
            }));

          } catch (processErr) {
            console.error("❌ Processing Error:", processErr);
          }
        }
      }
    } catch (err) {
      console.error("❌ Polling Error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}