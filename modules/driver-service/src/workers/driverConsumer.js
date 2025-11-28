import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand
} from "@aws-sdk/client-sqs";
import redis, { KEYS } from "../utils/redis.js";

const REGION = process.env.AWS_REGION || "us-east-1";
const SQS_ENDPOINT = process.env.SQS_ENDPOINT || "http://localstack:4566";
const QUEUE_NAME = process.env.SQS_TRIP_QUEUE_NAME || "trip-events";

// Khởi tạo Client một lần duy nhất
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
    console.log("🔗 [DriverConsumer] Connected to Queue:", queueUrl);
    return queueUrl;
  } catch (err) {
    console.error("❌ [DriverConsumer] Cannot get Queue URL. Is LocalStack running?");
    throw err;
  }
}

export async function startDriverConsumer(io) {
  console.log("🚀 [DriverConsumer] Starting Polling...");

  // Đảm bảo lấy được Queue URL trước khi loop
  try {
    await getQueueUrl();
  } catch (e) {
    return; // Dừng nếu không kết nối được Queue
  }

  while (true) {
    try {
      const receiveParams = {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10, // Lấy nhiều tin nhắn hơn để xử lý
        WaitTimeSeconds: 10,     // Long polling (chờ tối đa 10s nếu không có tin nhắn)
        VisibilityTimeout: 30,
      };

      const { Messages } = await sqsClient.send(new ReceiveMessageCommand(receiveParams));

      if (Messages && Messages.length > 0) {
        for (const msg of Messages) {
          try {
            const body = JSON.parse(msg.Body);
            console.log("📩 [DriverConsumer] Received Job:", body);

            const { tripId, pickupLat, pickupLng } = body.data;

            console.log(`🔍 [DriverConsumer] Finding drivers near: ${pickupLat}, ${pickupLng}`);

            if (!pickupLat || !pickupLng) {
               console.warn("⚠️ Missing coordinates, skipping Geo search.");
               // Có thể fallback: Broadcast all hoặc bỏ qua
               // io.emit("tripOffer", body.data); 
            } else {
                // SỬA LỖI: Đảm bảo redis object đã được import
                const radius = 5; // km
                const nearbyDriverIds = await redis.georadius(
                  KEYS.DRIVERS_LOCATIONS,
                  parseFloat(pickupLng), // Redis GEO yêu cầu (Lng, Lat)
                  parseFloat(pickupLat),
                  radius,
                  'km'
                );

                console.log(`📍 Found ${nearbyDriverIds.length} drivers:`, nearbyDriverIds);

                if (nearbyDriverIds.length > 0) {
                  nearbyDriverIds.forEach(driverId => {
                    // Gửi vào room riêng của tài xế
                    io.to(`driver:${driverId}`).emit("tripOffer", { 
                       ...body.data,
                       msg: "New trip nearby!"
                    });
                  });
                }
            }

            // 3. Xóa tin nhắn khỏi Queue sau khi xử lý xong
            await sqsClient.send(new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: msg.ReceiptHandle
            }));
            
          } catch (processErr) {
            console.error("❌ [DriverConsumer] Process Error:", processErr);
            // Không xóa message để SQS gửi lại (retry) sau VisibilityTimeout
          }
        }
      }
    } catch (err) {
      console.error("❌ [DriverConsumer] Polling Error:", err.message);
      // Backoff nhẹ để không spam lỗi nếu mất kết nối
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}