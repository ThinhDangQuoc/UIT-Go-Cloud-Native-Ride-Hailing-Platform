# =====================================================
# SQS Queues for Driver Location Streaming
# =====================================================

# Primary queue for real-time location updates
resource "aws_sqs_queue" "location_realtime" {
  name                       = "${var.project_name}-location-realtime"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 3600  # 1 hour
  receive_wait_time_seconds  = 20    # Long polling
  delay_seconds              = 0
  max_message_size           = 4096  # 4KB per message

  # FIFO queue for ordered processing per driver
  fifo_queue                  = true
  content_based_deduplication = true
  deduplication_scope         = "messageGroup"
  fifo_throughput_limit       = "perMessageGroupId"

  tags = {
    Name        = "${var.project_name}-location-realtime"
    Environment = var.environment
    Purpose     = "realtime-driver-location-updates"
  }
}

# Dead Letter Queue for failed realtime messages
resource "aws_sqs_queue" "location_realtime_dlq" {
  name                      = "${var.project_name}-location-realtime-dlq"
  message_retention_seconds = 1209600  # 14 days

  fifo_queue = true

  tags = {
    Name        = "${var.project_name}-location-realtime-dlq"
    Environment = var.environment
  }
}

# Redrive policy for realtime queue
resource "aws_sqs_queue_redrive_policy" "location_realtime" {
  queue_url = aws_sqs_queue.location_realtime.id
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.location_realtime_dlq.arn
    maxReceiveCount     = 3
  })
}

# Secondary queue for batch history storage (PostgreSQL)
resource "aws_sqs_queue" "location_history" {
  name                       = "${var.project_name}-location-history"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 345600  # 4 days
  receive_wait_time_seconds  = 20
  delay_seconds              = 5  # Small delay for batch aggregation
  max_message_size           = 262144  # 256KB for batch messages

  tags = {
    Name        = "${var.project_name}-location-history"
    Environment = var.environment
    Purpose     = "location-history-batch-storage"
  }
}

# Dead Letter Queue for history messages
resource "aws_sqs_queue" "location_history_dlq" {
  name                      = "${var.project_name}-location-history-dlq"
  message_retention_seconds = 1209600  # 14 days

  tags = {
    Name        = "${var.project_name}-location-history-dlq"
    Environment = var.environment
  }
}

# Redrive policy for history queue
resource "aws_sqs_queue_redrive_policy" "location_history" {
  queue_url = aws_sqs_queue.location_history.id
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.location_history_dlq.arn
    maxReceiveCount     = 5
  })
}

# =====================================================
# IAM Policy for SQS Access
# =====================================================

data "aws_iam_policy_document" "location_sqs_policy" {
  statement {
    sid    = "AllowDriverServiceSend"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = [var.driver_service_role_arn]
    }
    actions = [
      "sqs:SendMessage",
      "sqs:SendMessageBatch"
    ]
    resources = [
      aws_sqs_queue.location_realtime.arn,
      aws_sqs_queue.location_history.arn
    ]
  }

  statement {
    sid    = "AllowLambdaConsume"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = [var.lambda_role_arn]
    }
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:DeleteMessageBatch",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility"
    ]
    resources = [
      aws_sqs_queue.location_realtime.arn,
      aws_sqs_queue.location_history.arn
    ]
  }
}

resource "aws_sqs_queue_policy" "location_realtime" {
  queue_url = aws_sqs_queue.location_realtime.id
  policy    = data.aws_iam_policy_document.location_sqs_policy.json
}

resource "aws_sqs_queue_policy" "location_history" {
  queue_url = aws_sqs_queue.location_history.id
  policy    = data.aws_iam_policy_document.location_sqs_policy.json
}

# =====================================================
# CloudWatch Alarms for Monitoring
# =====================================================

resource "aws_cloudwatch_metric_alarm" "location_queue_depth" {
  alarm_name          = "${var.project_name}-location-queue-depth-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Average"
  threshold           = 10000
  alarm_description   = "Location queue depth is too high - may need more consumers"

  dimensions = {
    QueueName = aws_sqs_queue.location_realtime.name
  }

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  tags = {
    Name        = "${var.project_name}-location-queue-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "location_dlq_messages" {
  alarm_name          = "${var.project_name}-location-dlq-has-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Messages in DLQ - check for processing failures"

  dimensions = {
    QueueName = aws_sqs_queue.location_realtime_dlq.name
  }

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  tags = {
    Name        = "${var.project_name}-location-dlq-alarm"
    Environment = var.environment
  }
}
