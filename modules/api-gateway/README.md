API Gateway service for UIT-Go

- Exposes unified endpoints for user/driver/trip
- Publishes async events to SQS

Run locally (dev):

1. Build container
   docker build -t api-gateway:dev .

2. Run with env
   docker run --env-file .env -p 8080:8080 api-gateway:dev

Configuration via `.env`:
- `USER_SERVICE_URL`, `DRIVER_SERVICE_URL`, `TRIP_SERVICE_URL`
- `SQS_QUEUE_URL` (if you want to publish messages to SQS)
- AWS credentials via env or IAM role when running in AWS
