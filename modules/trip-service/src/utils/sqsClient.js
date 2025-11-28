// trip-service/src/utils/sqsclient.js
import { SQSClient, CreateQueueCommand, GetQueueUrlCommand} from "@aws-sdk/client-sqs";

const REGION = process.env.AWS_REGION || "us-east-1";
const SQS_ENDPOINT = process.env.SQS_ENDPOINT || "http://localstack:4566"; // localstack endpoint in docker-compose
const QUEUE_NAME = process.env.SQS_TRIP_QUEUE_NAME || "trip-events";

let sqsClient;
let queueUrl;

/**
 * Initialize SQS client and ensure queue exists.
 * Call this early on TripService startup.
 */
export async function initSqs() {
  if (sqsClient) return;

  sqsClient = new SQSClient({
    region: REGION,
    endpoint: SQS_ENDPOINT,
    disableHostPrefix: true,
    forcePathStyle: true,
    apiVersion: "2012-11-05",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    },
  });

  // Try to get queue URL, or create the queue
  try {
    const getRes = await sqsClient.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }));
    queueUrl = getRes.QueueUrl;
    console.log(`[SQS] Found queue ${QUEUE_NAME} -> ${queueUrl}`);
  } catch (err) {
    if (err.name && (err.name === "QueueDoesNotExist" || err.$metadata?.httpStatusCode === 404)) {
      console.log(`[SQS] Queue ${QUEUE_NAME} not found. Creating...`);
      const createRes = await sqsClient.send(
        new CreateQueueCommand({
          QueueName: QUEUE_NAME,
          Attributes: {
            VisibilityTimeout: "30",
            ReceiveMessageWaitTimeSeconds: "0"
          }
        })
      );
      queueUrl = createRes.QueueUrl;
      console.log(`[SQS] Created queue ${QUEUE_NAME} -> ${queueUrl}`);
    } else {
      console.error("[SQS] init error:", err);
      throw err;
    }
  }
}