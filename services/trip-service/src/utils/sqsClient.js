// trip-service/src/utils/sqsclient.js
import { SQSClient} from "@aws-sdk/client-sqs";

const REGION = process.env.AWS_REGION || "us-east-1";
const SQS_ENDPOINT = process.env.SQS_ENDPOINT || "http://localstack:4566"; // localstack endpoint in docker-compose
const QUEUE_NAME = process.env.SQS_TRIP_QUEUE_NAME || "trip-events";

const isLocal = SQS_ENDPOINT && SQS_ENDPOINT.includes("localstack");

console.log(`🔌 [SQS Client] Init. Endpoint: ${SQS_ENDPOINT} | Local: ${isLocal}`);

const clientConfig = {
  region: REGION,
  endpoint: SQS_ENDPOINT,
};

// 👇 QUAN TRỌNG: Chỉ dùng Credentials giả khi chạy LocalStack
if (isLocal) {
  clientConfig.credentials = {
    accessKeyId: "test",
    secretAccessKey: "test",
  };
}

export const sqsClient = new SQSClient(clientConfig);

function getQueueUrl() {
  // Nếu là LocalStack: http://localstack:4566/000000000000/queue-name
  if (isLocal) {
    let baseUrl = SQS_ENDPOINT.replace("localhost", "localstack"); // Fix docker networking nếu cần
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    return `${baseUrl}/000000000000/${QUEUE_NAME}`;
  }

  // Nếu là AWS thật: Ưu tiên dùng biến môi trường chứa FULL URL
  if (process.env.SQS_QUEUE_URL) {
      return process.env.SQS_QUEUE_URL;
  }
  
  // Fallback cho AWS (Chỉ hoạt động nếu SQS_ENDPOINT là endpoint chung của vùng)
  // Ví dụ: https://sqs.us-east-1.amazonaws.com/123456789012/trip-events
  const accountId = process.env.AWS_ACCOUNT_ID;
  if (accountId) {
      return `${SQS_ENDPOINT}/${accountId}/${QUEUE_NAME}`;
  }

  // Nếu không có thông tin gì, trả về endpoint gốc (có thể lỗi)
  console.warn("⚠️ [SQS] Warning: Cannot construct full Queue URL. Please set SQS_QUEUE_URL env var.");
  return SQS_ENDPOINT; 
}

export async function initSqs() {
  const url = getQueueUrl();
  console.log(`✅ [SQS] Initialized. Queue URL: ${url}`);
}

