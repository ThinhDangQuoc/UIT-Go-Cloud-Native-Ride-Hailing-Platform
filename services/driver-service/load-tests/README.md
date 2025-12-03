# Load Testing Guide - Driver Location Updates

## Mục lục
1. [Cài đặt K6](#1-cài-đặt-k6)
2. [Chạy Test](#2-chạy-test)
3. [Phân tích Bottleneck](#3-phân-tích-bottleneck)
4. [Tối ưu hóa](#4-tối-ưu-hóa)

---

## 1. Cài đặt K6

### Windows
```powershell
# Sử dụng Chocolatey
choco install k6

# Hoặc download từ GitHub
# https://github.com/grafana/k6/releases
```

### Docker
```bash
docker pull grafana/k6
```

### Verify Installation
```bash
k6 version
```

---

## 2. Chạy Test

### 2.1 Smoke Test (Quick Validation)
```bash
# Kiểm tra nhanh với 10 VUs trong 1 phút
k6 run --env BASE_URL=http://localhost:8080 \
       --env JWT_TOKEN=your-jwt-token \
       location-update-load-test.js \
       --tag testid=smoke-$(date +%s)
```

### 2.2 Load Test (Target 10k req/s)
```bash
# Full load test với metrics export
k6 run --env BASE_URL=http://localhost:8080 \
       --env JWT_TOKEN=your-jwt-token \
       --out json=results/load-test-$(date +%s).json \
       location-update-load-test.js
```

### 2.3 Stress Test (Find Breaking Point)
```bash
k6 run --env BASE_URL=http://localhost:8080 \
       stress-test.js
```

### 2.4 Soak Test (2 Hour Endurance)
```bash
# Chạy trong tmux/screen để tránh disconnect
k6 run --env BASE_URL=http://localhost:8080 \
       soak-test.js
```

### 2.5 Chạy với Docker
```bash
docker run -i grafana/k6 run - <location-update-load-test.js \
  -e BASE_URL=http://host.docker.internal:8080
```

### 2.6 Chạy với Grafana Cloud (Distributed)
```bash
k6 cloud location-update-load-test.js
```

---

## 3. Phân tích Bottleneck

### 3.1 Bottleneck Indicators

| Symptom | Likely Bottleneck | Verification |
|---------|-------------------|--------------|
| P95 latency > 500ms | DB Write Latency | Check Redis/PG slow queries |
| Error rate spikes | Queue Consumer | Check SQS queue depth |
| Connection timeouts | Network/Ports | Check `netstat`, `ss` |
| 503 errors | Memory/CPU | Check container metrics |
| 429 errors | Rate Limiter | Check API Gateway config |
| Increasing latency over time | Memory Leak | Check heap usage |

### 3.2 Monitoring Commands

#### Redis
```bash
# Monitor Redis performance
redis-cli INFO stats
redis-cli INFO memory
redis-cli SLOWLOG GET 10

# Check GeoSet size
redis-cli ZCARD drivers:locations

# Check Stream length
redis-cli XLEN stream:driver:locations
```

#### PostgreSQL
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Slow queries
SELECT query, calls, mean_time, total_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Lock contention
SELECT * FROM pg_locks WHERE NOT granted;
```

#### AWS SQS
```bash
# Queue depth
aws sqs get-queue-attributes \
  --queue-url $QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages

# Messages in flight
aws sqs get-queue-attributes \
  --queue-url $QUEUE_URL \
  --attribute-names ApproximateNumberOfMessagesNotVisible
```

#### Docker/Container
```bash
# Resource usage
docker stats driver-service

# Check connection count
docker exec driver-service ss -s
```

### 3.3 Bottleneck Decision Tree

```
[High Latency?]
    │
    ├── Yes ──> [Check DB latency]
    │              │
    │              ├── High ──> DB bottleneck (see 4.1)
    │              │
    │              └── Normal ──> [Check Queue Depth]
    │                               │
    │                               ├── Growing ──> Consumer bottleneck (see 4.3)
    │                               │
    │                               └── Stable ──> Network/Code issue
    │
    └── No ──> [Check Error Rate]
                 │
                 ├── High ──> [Check Error Type]
                 │              │
                 │              ├── 429 ──> Rate limit (increase capacity)
                 │              ├── 503 ──> Resource exhaustion
                 │              └── 504 ──> Upstream timeout
                 │
                 └── Low ──> ✅ System healthy
```

---

## 4. Tối ưu hóa

### 4.1 Database Write Latency

#### Problem
Redis/PostgreSQL cannot handle write throughput.

#### Solutions

**A. Redis Pipeline (Already Implemented)**
```javascript
// ✅ Current implementation uses pipeline
const pipeline = redis.pipeline();
updates.forEach(({ driverId, lat, lng }) => {
  pipeline.geoadd('drivers:locations', lng, lat, driverId);
});
await pipeline.exec();
```

**B. Write Coalescing**
```javascript
// Coalesce multiple updates for same driver
class LocationBuffer {
  constructor(flushIntervalMs = 100) {
    this.buffer = new Map(); // driverId -> latest location
    this.flushInterval = setInterval(() => this.flush(), flushIntervalMs);
  }

  add(driverId, location) {
    // Only keep latest location per driver
    this.buffer.set(driverId, location);
  }

  async flush() {
    if (this.buffer.size === 0) return;
    
    const pipeline = redis.pipeline();
    for (const [driverId, loc] of this.buffer) {
      pipeline.geoadd('drivers:locations', loc.lng, loc.lat, driverId);
    }
    await pipeline.exec();
    this.buffer.clear();
  }
}
```

**C. Redis Cluster Configuration**
```bash
# Enable Redis Cluster for horizontal scaling
# redis.conf
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
```

### 4.2 Redis Stream / ElastiCache Optimization

#### Current Architecture
```
Driver App → API → Redis GEOADD → SQS → Lambda → PostgreSQL
                       ↓
                  Redis Stream (backup)
```

#### Optimized Architecture
```
Driver App → API → Redis Stream (write buffer)
                       ↓
              Stream Consumer (batch)
                       ↓
               Redis GEOADD + SQS
```

**Redis Stream Consumer (Go/Rust for performance)**
```javascript
// High-performance stream consumer
async function consumeLocationStream() {
  let lastId = '0';
  
  while (true) {
    // Read batch from stream
    const results = await redis.xread(
      'BLOCK', 1000,        // Block for 1s if no data
      'COUNT', 1000,        // Read up to 1000 at once
      'STREAMS', 'stream:driver:locations', lastId
    );
    
    if (!results) continue;
    
    const [streamName, messages] = results[0];
    
    // Batch process
    const pipeline = redis.pipeline();
    const sqsBatch = [];
    
    for (const [id, fields] of messages) {
      const loc = parseFields(fields);
      pipeline.geoadd('drivers:locations', loc.lng, loc.lat, loc.driverId);
      sqsBatch.push(loc);
      lastId = id;
    }
    
    await Promise.all([
      pipeline.exec(),
      publishBatchToSQS(sqsBatch)
    ]);
  }
}
```

#### ElastiCache Configuration
```terraform
resource "aws_elasticache_cluster" "driver_location" {
  cluster_id           = "driver-location-cache"
  engine               = "redis"
  node_type            = "cache.r6g.large"  # Memory optimized
  num_cache_nodes      = 3                   # Multi-AZ
  parameter_group_name = "default.redis7"
  port                 = 6379
  
  # Enable cluster mode for sharding
  engine_version = "7.0"
}
```

### 4.3 Consumer Worker Horizontal Scaling

#### Problem
Single consumer cannot process queue fast enough.

#### Solution: Auto-scaling Lambda

```terraform
# Lambda with SQS event source - auto-scales based on queue depth
resource "aws_lambda_event_source_mapping" "location_consumer" {
  event_source_arn = aws_sqs_queue.location_history.arn
  function_name    = aws_lambda_function.location_writer.arn
  batch_size       = 100
  
  # Scaling configuration
  scaling_config {
    maximum_concurrency = 100  # Up to 100 concurrent Lambda invocations
  }
  
  # Batch window for efficiency
  maximum_batching_window_in_seconds = 5
}
```

#### Solution: ECS Worker Auto-scaling

```yaml
# docker-compose.production.yml
services:
  location-consumer:
    image: uitgo/location-consumer:latest
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

```terraform
# ECS Auto-scaling based on SQS queue depth
resource "aws_appautoscaling_policy" "location_consumer" {
  name               = "location-consumer-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.location_consumer.resource_id
  scalable_dimension = aws_appautoscaling_target.location_consumer.scalable_dimension
  service_namespace  = aws_appautoscaling_target.location_consumer.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "SQSQueueMessagesVisible"
      resource_label         = "${aws_sqs_queue.location_history.name}"
    }
    target_value       = 100  # Scale when > 100 messages per instance
    scale_in_cooldown  = 60
    scale_out_cooldown = 30
  }
}
```

### 4.4 Network Throughput Optimization

#### Connection Pooling
```javascript
// HTTP client with connection pooling
import { Agent } from 'http';

const httpAgent = new Agent({
  keepAlive: true,
  maxSockets: 100,         // Max concurrent connections
  maxFreeSockets: 10,      // Keep idle connections
  timeout: 60000,          // Connection timeout
});
```

#### TCP Tuning (Linux)
```bash
# /etc/sysctl.conf
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 10
net.ipv4.tcp_tw_reuse = 1
net.core.netdev_max_backlog = 65535
```

### 4.5 Summary: Optimization Checklist

| Layer | Optimization | Impact | Effort |
|-------|-------------|--------|--------|
| **Client** | Batch updates (3-5 locations) | 70% fewer requests | Low |
| **Client** | Delta compression | 50% fewer updates | Low |
| **API** | Connection pooling | 20% latency reduction | Low |
| **Redis** | Pipeline writes | 5x throughput | ✅ Done |
| **Redis** | Write coalescing | 2x throughput | Medium |
| **Redis** | Cluster mode | Unlimited scale | High |
| **SQS** | Batch send (10 msgs) | 10x fewer API calls | Medium |
| **Lambda** | Batch size 100 | 100x fewer invocations | ✅ Done |
| **Lambda** | Concurrency 100 | 100 parallel workers | Low |
| **PostgreSQL** | Batch insert | 100x faster | ✅ Done |
| **PostgreSQL** | Partitioning | 10x query speed | ✅ Done |

---

## 5. Test Results Template

```markdown
## Load Test Report - [Date]

### Environment
- **Target URL:** http://api.uitgo.vn
- **Test Duration:** 10 minutes
- **Peak Load:** 10,000 req/s

### Results
| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Total Requests | 6,000,000 | - | - |
| Success Rate | 99.85% | > 99% | ✅ PASS |
| Avg Response | 45ms | < 100ms | ✅ PASS |
| P95 Response | 120ms | < 500ms | ✅ PASS |
| P99 Response | 250ms | < 1000ms | ✅ PASS |
| Errors | 9,000 | < 60,000 | ✅ PASS |

### Bottlenecks Identified
1. None

### Recommendations
1. Current architecture can handle 10k req/s
2. Consider Redis Cluster for future scaling to 50k req/s
```

---

*Last updated: 2025-11-28*
