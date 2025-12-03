import sqs from './utils/sqsClient.js';

const QUEUE_URL = process.env.TRIP_QUEUE_URL;

async function pollQueue() {
  try {
    const data = await sqs.receiveMessage({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
    }).promise();

    if (data.Messages?.length) {
      const message = data.Messages[0];
      const trip = JSON.parse(message.Body);
      console.log("[DriverService] Received trip:", trip);

      // Xử lý logic accept/notify tài xế...
      // Xóa message sau khi xử lý
      await sqs.deleteMessage({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle,
      }).promise();
      console.log("[DriverService] Message deleted");
    }
  } catch (err) {
    console.error("[DriverService] Worker error:", err);
  } finally {
    setTimeout(pollQueue, 1000); // Poll liên tục
  }
}

pollQueue();
