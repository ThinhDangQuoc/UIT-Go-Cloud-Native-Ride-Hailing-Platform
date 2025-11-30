resource "aws_sqs_queue" "trip_events" {
  name                      = "trip-events"
  message_retention_seconds = 86400 # 1 ngày
}