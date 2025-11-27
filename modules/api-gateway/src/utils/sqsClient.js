import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

export const publishToSQS = async (message) => {
  try {
    const params = {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        MessageType: {
          StringValue: message.type || "async_request",
          DataType: "String",
        },
        Timestamp: {
          StringValue: new Date().toISOString(),
          DataType: "String",
        },
      },
    };

    const command = new SendMessageCommand(params);
    const response = await sqs.send(command);

    console.log(`✅ Message sent to SQS:`, response.MessageId);
    return response.MessageId;
  } catch (error) {
    console.error("❌ Failed to publish to SQS:", error);
    throw error;
  }
};
