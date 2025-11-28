output "location_realtime_queue_url" {
  description = "URL of the realtime location SQS queue"
  value       = aws_sqs_queue.location_realtime.url
}

output "location_realtime_queue_arn" {
  description = "ARN of the realtime location SQS queue"
  value       = aws_sqs_queue.location_realtime.arn
}

output "location_history_queue_url" {
  description = "URL of the location history SQS queue"
  value       = aws_sqs_queue.location_history.url
}

output "location_history_queue_arn" {
  description = "ARN of the location history SQS queue"
  value       = aws_sqs_queue.location_history.arn
}

output "location_realtime_dlq_url" {
  description = "URL of the realtime location DLQ"
  value       = aws_sqs_queue.location_realtime_dlq.url
}

output "location_history_dlq_url" {
  description = "URL of the location history DLQ"
  value       = aws_sqs_queue.location_history_dlq.url
}
