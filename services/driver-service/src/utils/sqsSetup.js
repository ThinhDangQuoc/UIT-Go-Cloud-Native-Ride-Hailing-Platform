import AWS from 'aws-sdk';

const sqs = new AWS.SQS({
  endpoint: 'http://localstack:4566',
  region: 'us-east-1',
});

async function createQueue() {
  const res = await sqs.createQueue({ QueueName: 'trip-offers' }).promise();
  console.log("Queue URL:", res.QueueUrl);
}
createQueue();
