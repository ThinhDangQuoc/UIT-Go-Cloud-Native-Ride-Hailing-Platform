# ADR 0004 – Kiến trúc Event Streaming cho Driver Location Updates

## 1. Bối cảnh & Yêu cầu

Hệ thống UIT-Go cần cập nhật vị trí tài xế **liên tục mỗi 2–3 giây** từ ứng dụng mobile của tài xế. Với quy mô 10,000+ tài xế online cùng lúc, hệ thống phải xử lý:
- **~3,000–5,000 writes/giây** (location updates)
- **Độ trễ thấp** cho real-time tracking
- **Chi phí tối ưu** cho infrastructure

---

## 2. Phân tích Trade-offs

### 2.1. Realtime Tracking vs Cost

| Yếu tố | Realtime (2-3s) | Near-realtime (10-15s) | Batch (30-60s) |
|--------|-----------------|------------------------|----------------|
| **Độ chính xác vị trí** | Rất cao | Trung bình | Thấp |
| **Chi phí SQS/Kafka** | Cao (~$150-300/tháng) | Trung bình (~$50-100) | Thấp (~$20-50) |
| **UX hành khách** | Tốt nhất | Chấp nhận được | Kém |
| **Battery drain (driver app)** | Cao | Trung bình | Thấp |

**→ Quyết định:** Chọn **2-3 giây** cho giai đoạn active trip (đang có khách), **10-15 giây** cho idle state.

### 2.2. High Write Throughput vs Consistency

| Giải pháp | Throughput | Consistency | Complexity |
|-----------|------------|-------------|------------|
| Direct Redis Write | ~100k ops/s | Eventual | Thấp |
| SQS + Batch Write | ~10k msg/s | Eventual | Trung bình |
| Kafka + Redis | ~100k msg/s | Eventual | Cao |
| PostgreSQL Direct | ~1k writes/s | Strong | Thấp |

**→ Quyết định:** Dùng **SQS + Batch Write to Redis** cho balance giữa throughput, cost và complexity.

### 2.3. Redis Stream vs PostgreSQL

| Tiêu chí | Redis Stream | PostgreSQL |
|----------|--------------|------------|
| Write speed | ~100k ops/s | ~1k writes/s |
| Geospatial query | GEORADIUS < 1ms | PostGIS ~10-50ms |
| Durability | Optional (RDB/AOF) | ACID |
| Cost (AWS) | ElastiCache $50-200/m | RDS $50-150/m |
| Historical data | Không phù hợp | Phù hợp |

**→ Quyết định:** 
- **Redis**: Lưu vị trí **real-time** (GEOADD) + **Redis Stream** cho event sourcing
- **PostgreSQL**: Lưu **location history** (batch insert mỗi 30 giây từ Lambda)

---

## 3. Kiến trúc Đề xuất

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DRIVER LOCATION UPDATE FLOW                         │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐     HTTPS/WSS      ┌──────────────────┐
    │  Driver App  │ ──────────────────▶│   API Gateway    │
    │  (Mobile)    │   PUT /location    │   (Express.js)   │
    └──────────────┘   every 2-3s       └────────┬─────────┘
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          │                      │                      │
                          ▼                      ▼                      ▼
              ┌───────────────────┐   ┌──────────────────┐   ┌──────────────────┐
              │   SQS Queue       │   │  Driver Service  │   │   SQS Queue      │
              │ (location-stream) │   │  (Direct Write)  │   │ (location-batch) │
              │   High Priority   │   │     to Redis     │   │   Low Priority   │
              └─────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
                        │                      │                      │
                        ▼                      ▼                      ▼
              ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
              │  Lambda Consumer │   │     Redis        │   │  Lambda Consumer │
              │  (Realtime)      │   │   GEOADD + Stream│   │  (Batch Writer)  │
              └─────────┬────────┘   └──────────────────┘   └────────┬─────────┘
                        │                                            │
                        └─────────────────┬──────────────────────────┘
                                          ▼
                              ┌───────────────────────┐
                              │     PostgreSQL        │
                              │   (Location History)  │
                              │   Partitioned Table   │
                              └───────────────────────┘
```

---

## 4. Components Chi tiết

### 4.1. API Gateway Layer

**Dual-path routing:**
- **Path 1 (Sync):** Forward trực tiếp đến Driver Service → Redis GEOADD (cho real-time tracking)
- **Path 2 (Async):** Publish to SQS Queue (cho analytics, history, audit)

```javascript
// Pseudo-code
async function updateDriverLocation(req, res) {
  const { driverId, lat, lng, timestamp } = req.body;
  
  // Path 1: Sync write to Redis (real-time)
  await driverService.updateLocation(driverId, lat, lng);
  
  // Path 2: Async publish to SQS (history + analytics)
  await sqsClient.publish({
    type: 'driver.location_update',
    driverId,
    location: { lat, lng },
    timestamp,
    tripId: req.body.tripId || null
  });
  
  res.status(200).json({ success: true });
}
```

### 4.2. SQS Queue Configuration

| Queue | Purpose | Visibility Timeout | Retention | Batch Size |
|-------|---------|-------------------|-----------|------------|
| `location-realtime` | Critical updates | 30s | 1 hour | 10 |
| `location-history` | Batch write to PG | 60s | 4 days | 100 |

### 4.3. Redis Data Structures

```
# Real-time location (GEOADD)
drivers:locations → GeoSet { driverId: (lng, lat) }

# Location stream (Redis Stream)
stream:driver:locations → [
  { id: "1732800000000-0", driverId, lat, lng, timestamp, tripId }
]

# Driver status
driver:status:{driverId} → "online" | "offline" | "on_trip"

# Last known location with metadata
driver:location:{driverId} → Hash {
  lat, lng, heading, speed, accuracy, updatedAt
}
```

### 4.4. Lambda Batch Writer

```python
# Pseudo-code for PostgreSQL batch insert
def handler(event, context):
    locations = []
    for record in event['Records']:
        body = json.loads(record['body'])
        locations.append((
            body['driverId'],
            body['location']['lat'],
            body['location']['lng'],
            body['timestamp'],
            body.get('tripId')
        ))
    
    # Batch insert (1 query for N records)
    execute_batch("""
        INSERT INTO driver_location_history 
        (driver_id, lat, lng, recorded_at, trip_id)
        VALUES (%s, %s, %s, %s, %s)
    """, locations)
```

### 4.5. PostgreSQL Schema (Location History)

```sql
-- Partitioned by date for efficient querying and cleanup
CREATE TABLE driver_location_history (
    id BIGSERIAL,
    driver_id INTEGER NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    heading SMALLINT,          -- 0-360 degrees
    speed SMALLINT,            -- km/h
    accuracy SMALLINT,         -- meters
    trip_id INTEGER,
    recorded_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Create monthly partitions
CREATE TABLE driver_location_history_2025_11 
    PARTITION OF driver_location_history 
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Index for trip replay
CREATE INDEX idx_location_trip ON driver_location_history (trip_id, recorded_at);

-- Index for driver history
CREATE INDEX idx_location_driver ON driver_location_history (driver_id, recorded_at);
```

---

## 5. Optimizations

### 5.1. Client-side Batching
App tài xế batch **3-5 location updates** trước khi gửi → giảm số request ~70%.

### 5.2. Adaptive Update Interval
| Driver State | Update Interval | Reason |
|--------------|-----------------|--------|
| On active trip | 2-3 giây | Real-time tracking cho passenger |
| Online, idle | 10-15 giây | Giảm battery + cost |
| Offline | Không gửi | - |

### 5.3. Delta Compression
Chỉ gửi update khi driver di chuyển > 10 meters hoặc heading thay đổi > 15°.

### 5.4. Redis Pipeline
```javascript
// Batch multiple GEOADD in one pipeline
const pipeline = redis.pipeline();
updates.forEach(({ driverId, lat, lng }) => {
  pipeline.geoadd('drivers:locations', lng, lat, driverId);
  pipeline.xadd('stream:driver:locations', '*', 
    'driverId', driverId, 'lat', lat, 'lng', lng);
});
await pipeline.exec();
```

---

## 6. Monitoring & Alerting

| Metric | Threshold | Action |
|--------|-----------|--------|
| SQS ApproximateNumberOfMessagesVisible | > 10,000 | Scale Lambda concurrency |
| Redis memory usage | > 80% | Add node / cleanup old data |
| Location update latency (p99) | > 500ms | Investigate bottleneck |
| Failed writes to PostgreSQL | > 1% | Check connection pool |

---

## 7. Cost Estimation (AWS, 10k drivers)

| Component | Monthly Cost |
|-----------|-------------|
| SQS (5M messages/day) | ~$20 |
| Lambda (batch processing) | ~$15 |
| ElastiCache Redis (cache.t3.medium) | ~$65 |
| RDS PostgreSQL (db.t3.medium) | ~$60 |
| API Gateway | ~$35 |
| **Total** | **~$195/month** |

---

## 8. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Tạo SQS queues (location-realtime, location-history)
- [ ] Update API Gateway với dual-path routing
- [ ] Thêm Redis Stream cho location events

### Phase 2: Batch Processing (Week 2)
- [ ] Lambda consumer cho PostgreSQL batch insert
- [ ] Create partitioned table cho location history
- [ ] Implement client-side batching

### Phase 3: Optimization (Week 3)
- [ ] Adaptive update interval based on driver state
- [ ] Delta compression
- [ ] Monitoring dashboard

---

## 9. Hậu quả & Risks

| Risk | Mitigation |
|------|------------|
| SQS message loss | Enable DLQ, monitor failed messages |
| Redis memory overflow | TTL cho old locations, sharding |
| PostgreSQL partition management | Automated partition creation cron |
| High Lambda cold start | Provisioned concurrency cho critical path |

---

*Document maintained by SE360 Team - UIT-Go Project*
*Last updated: 2025-11-28*
