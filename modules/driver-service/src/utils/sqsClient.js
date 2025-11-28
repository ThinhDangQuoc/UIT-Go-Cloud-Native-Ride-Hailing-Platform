import AWS from "aws-sdk";
import dotenv from "dotenv";
dotenv.config();

const endpoint = process.env.SQS_ENDPOINT || 'http://localstack:4566';

export const sqs = new AWS.SQS({
  endpoint,
  region: 'us-east-1',
  accessKeyId: 'test',
  secretAccessKey: 'test',
});

export default sqs;
