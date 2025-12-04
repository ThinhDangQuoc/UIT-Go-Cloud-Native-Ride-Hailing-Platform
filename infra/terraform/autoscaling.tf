# Ví dụ Auto Scaling cho Driver Service (Làm tương tự cho Trip/User/Gateway)

# 1. Định nghĩa Target (Mục tiêu scale)
resource "aws_appautoscaling_target" "driver_target" {
  max_capacity       = 5 # Tối đa 5 container
  min_capacity       = 1 # Tối thiểu 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.driver_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# 2. Policy: Scale theo CPU (Nếu CPU > 70% thì thêm container)
resource "aws_appautoscaling_policy" "driver_cpu" {
  name               = "driver-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.driver_target.resource_id
  scalable_dimension = aws_appautoscaling_target.driver_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.driver_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# 3. Policy: Scale theo Memory (Nếu RAM > 80% thì thêm container)
resource "aws_appautoscaling_policy" "driver_memory" {
  name               = "driver-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.driver_target.resource_id
  scalable_dimension = aws_appautoscaling_target.driver_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.driver_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = 80.0
  }
}