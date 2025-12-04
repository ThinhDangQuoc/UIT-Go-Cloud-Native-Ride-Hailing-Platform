resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project_name}-waf"
  description = "Protect API Gateway"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-waf"
    sampled_requests_enabled   = true
  }

  # Rule 1: Chặn SQL Injection
  rule {
    name     = "AWS-AWSManagedRulesSQLiRuleSet"
    priority = 10
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWS-AWSManagedRulesSQLiRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: Giới hạn Rate Limit (Chống DDoS đơn giản)
  # Chặn IP nào gọi quá 500 request/5 phút
  rule {
    name     = "RateLimit"
    priority = 20
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 500
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }
}

# Gắn WAF vào Public ALB
resource "aws_wafv2_web_acl_association" "main" {
  resource_arn = aws_lb.public.arn # ALB Public từ file alb.tf
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}