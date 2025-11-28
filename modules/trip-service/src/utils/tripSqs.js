import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import dotenv from "dotenv";

dotenv.config();

const SQS_ENDPOINT = process.env.SQS_ENDPOINT || "http://localstack:4566";
const REGION = process.env.AWS_REGION || "us-east-1";
const QUEUE_NAME = process.env.SQS_TRIP_QUEUE_NAME || "trip-events";

// 1. Cấu hình Client
const sqsClient = new SQSClient({
  region: REGION,
  endpoint: SQS_ENDPOINT,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
  // Timeout 2s để Gateway không bị 504 Gateway Timeout
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 2000, 
    socketTimeout: 2000,
  }),
  maxAttempts: 1, 
});

// 2. Hàm tạo URL tĩnh (Nhanh hơn, không cần gọi mạng)
const getQueueUrl = () => {
  // Cấu trúc URL chuẩn của LocalStack: http://host:port/queue/queueName
  // Hoặc: http://host:port/000000000000/queueName
  
  // Xử lý trường hợp chạy trên máy local vs docker
  let baseUrl = SQS_ENDPOINT;
  if (baseUrl.includes("localhost")) {
    baseUrl = baseUrl.replace("localstack", "localhost");
  }

  // Loại bỏ dấu / ở cuối nếu có
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

  // Return URL chuẩn: endpoint + /000000000000/ + queueName
  return `${baseUrl}/000000000000/${QUEUE_NAME}`;
};

// 3. Hàm gửi Job
export const pushTripOfferJob = async (tripData) => {
  // Lấy URL ngay lập tức, không cần await network
  const queueUrl = getQueueUrl();
  console.log(`⏳ [TripSqs] Pushing to: ${queueUrl}`);

  const payload = {
    type: "TRIP_OFFER",
    data: tripData,
    timestamp: new Date().toISOString(),
  };

  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    });

    const result = await sqsClient.send(command);
    console.log(`✅ [TripSqs] Success! MsgID: ${result.MessageId}`);
    return result;

  } catch (err) {
    console.error("❌ [TripSqs] FAILED to push job.");
    console.error(`   Endpoint: ${SQS_ENDPOINT}`);
    console.error(`   Error: ${err.message}`);
    
    // Fail-safe: Không throw lỗi để Trip vẫn tạo thành công
    return null;
  }
};