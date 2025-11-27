# API Gateway + SQS + Lambda Implementation Guide

## Tổng quan kiến trúc

```
Client Request
    ↓
API Gateway (REST API)
    ↓
SQS Queue (Message Buffer)
    ↓
Lambda Function (Consumer)
    ↓
Your Services (User/Driver/Trip)
```

## Các Module được tạo

### 1. **module/sqs** - SQS Queue
- `aws_sqs_queue`: Hàng đợi tin nhắn
- `aws_sqs_queue_policy`: Quyền cho API Gateway gửi message

**Variables:**
- `queue_name`: Tên queue (mặc định: `uit-go-message-queue`)
- `visibility_timeout`: Thời gian ẩn message sau khi lấy (mặc định: 300 giây)
- `message_retention`: Thời gian lưu message (mặc định: 4 ngày)

### 2. **module/api_gateway** - REST API Endpoint
- `aws_api_gateway_rest_api`: API chính
- `aws_api_gateway_resource`: Resource path `/messages`
- `aws_api_gateway_method`: POST method
- `aws_api_gateway_integration`: Tích hợp SQS trực tiếp
- `aws_api_gateway_stage`: Deployment stage (prod/dev)
- `aws_iam_role`: Quyền cho API Gateway

**Variables:**
- `api_name`: Tên API (mặc định: `uit-go-api`)
- `stage_name`: Stage deployment (mặc định: `prod`)
- `queue_resource_path`: Đường dẫn endpoint (mặc định: `messages`)

### 3. **module/lambda_sqs_consumer** - Lambda Function
- `aws_lambda_function`: Consumer function
- `aws_lambda_event_source_mapping`: Trigger từ SQS
- `aws_iam_role`: Quyền cho Lambda
- `aws_iam_policy`: Quyền đọc/xóa từ SQS

**Variables:**
- `lambda_function_name`: Tên function (mặc định: `uit-go-sqs-consumer`)
- `lambda_zip_file`: File zip chứa code
- `lambda_batch_size`: Số message xử lý mỗi batch (mặc định: 10)
- `lambda_timeout`: Timeout (mặc định: 60 giây)

## Cách sử dụng

### 1. Chuẩn bị Lambda function

Tạo một function Node.js/Python xử lý SQS messages:

**Node.js (index.js):**
```javascript
exports.handler = async (event) => {
    console.log('Received SQS messages:', JSON.stringify(event, null, 2));
    
    for (const record of event.Records) {
        const body = JSON.parse(record.body);
        
        // Gọi user-service, driver-service, hoặc trip-service
        console.log('Processing:', body);
        
        // Implement business logic here
    }
    
    return { statusCode: 200, body: 'Messages processed' };
};
```

**Python (index.py):**
```python
import json

def handler(event, context):
    print(f'Received SQS messages: {json.dumps(event, indent=2)}')
    
    for record in event['Records']:
        body = json.loads(record['body'])
        print(f'Processing: {body}')
        
        # Implement business logic here
    
    return {'statusCode': 200, 'body': 'Messages processed'}
```

### 2. Package Lambda function

```bash
cd terraform
# Node.js
zip -r lambda_function.zip index.js node_modules/

# Python
pip install -r requirements.txt -t package/
cd package
zip -r ../lambda_function.zip .
cd ..
zip lambda_function.zip index.py
```

### 3. Deploy Terraform

```bash
cd terraform

# Khởi tạo
terraform init

# Xem plan
terraform plan -out=tfplan

# Apply
terraform apply tfplan

# Lấy endpoint
terraform output api_gateway_endpoint
```

### 4. Test API

```bash
# Gửi message qua API Gateway
curl -X POST \
  https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/messages \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123",
    "action": "create_trip",
    "data": {"origin": "A", "destination": "B"}
  }'

# Kiểm tra SQS console hoặc CloudWatch logs
# Lambda sẽ tự động consume message sau vài giây
```

## Luồng xử lý

1. **Client gửi request** → API Gateway POST `/messages`
2. **API Gateway** → Tích hợp SQS `SendMessage`
3. **Message vào queue** → Lưu trữ tạm thời
4. **Lambda polling** → Lấy 10 message mỗi lần (batch_size=10)
5. **Lambda xử lý** → Gọi downstream services
6. **Message deleted** → Sau khi xử lý thành công

## Lợi ích kiến trúc async

✅ **Decoupling**: Services không phụ thuộc nhau trực tiếp
✅ **Resilience**: Message không bị mất nếu service down
✅ **Scalability**: Lambda tự động scale với số message
✅ **Fault tolerance**: DLQ (Dead Letter Queue) cho message lỗi
✅ **Better UX**: Client nhận response ngay mà không chờ xử lý

## Mở rộng (Optional)

### Thêm Dead Letter Queue (DLQ)

```terraform
resource "aws_sqs_queue" "dlq" {
  name = "uit-go-dlq"
}

# Cập nhật SQS module: thêm redrive_policy
redrive_policy = jsonencode({
  deadLetterTargetArn = aws_sqs_queue.dlq.arn
  maxReceiveCount     = 3
})
```

### Thêm SNS Notification

```terraform
resource "aws_sns_topic" "sqs_notifications" {
  name = "uit-go-sqs-notifications"
}

# Subscribe để nhận alert khi có lỗi
```

### CloudWatch Alarms

```terraform
resource "aws_cloudwatch_metric_alarm" "sqs_depth" {
  alarm_name = "sqs-queue-depth"
  # Monitor số message trong queue
}
```

## Chỉ số quan trọng

- **ApproximateNumberOfMessages**: Số message trong queue
- **ApproximateNumberOfMessagesNotVisible**: Message đang xử lý
- **Duration**: Thời gian Lambda xử lý
- **Errors**: Số lỗi xảy ra

## Tài liệu tham khảo

- [AWS API Gateway Integration with SQS](https://docs.aws.amazon.com/apigateway/latest/developerguide/sqs-message-queue.html)
- [AWS Lambda Event Source Mapping](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html)
- [AWS SQS Best Practices](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/best-practices.html)
