import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOAD TEST - ĐO HIỆU NĂNG Ở TẢI BÌNH THƯỜNG VÀ CAO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Định nghĩa: Load testing đo lường phản ứng của hệ thống dưới điều kiện
 * tải BÌNH THƯỜNG và CAO HƠN dự kiến. Giúp xác định:
 * - Công suất vận hành tối đa
 * - Các điểm BOTTLENECK (thắt cổ chai)
 * - Phần tử nào gây ra bottleneck
 * 
 * Kịch bản: Mô phỏng giờ cao điểm
 * - 100-300 tài xế online đồng thời
 * - Cập nhật vị trí liên tục
 * 
 * Mục tiêu:
 * - Xác định MAX THROUGHPUT (req/s)
 * - Tìm BOTTLENECK khi tải tăng
 * - Đo latency ở các mức tải khác nhau
 * - Success rate > 90%
 * 
 * Kết quả mong đợi: NÊN PASS (hoặc cho thấy điểm bottleneck)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
const DRIVER_ID = __ENV.DRIVER_ID || '3';

const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const errorCount = new Counter('errors');
const currentVUs = new Gauge('current_vus');

export const options = {
  stages: [
    // LOAD TEST: Tăng dần và giữ ổn định để đo throughput
    { duration: '30s', target: 50 },     // Warm up
    { duration: '1m', target: 100 },     // Tải nhẹ - baseline
    { duration: '2m', target: 200 },     // Tải bình thường - sustained
    { duration: '1m', target: 300 },     // Tải cao - peak hour
    { duration: '30s', target: 100 },    // Giảm dần
    { duration: '30s', target: 0 },      // Cool down
  ],
  // Tổng: ~6 phút
  
  // Thresholds cho load test - nên pass ở tải bình thường
  thresholds: {
    'http_req_duration': ['p(95)<800', 'p(99)<1500'],
    'success_rate': ['rate>0.90'],
    'http_req_failed': ['rate<0.10'],
  },
  
  noConnectionReuse: false,
};

function generateLocation() {
  return {
    lat: 10.7769 + (Math.random() - 0.5) * 0.09,
    lng: 106.7009 + (Math.random() - 0.5) * 0.09,
    heading: randomIntBetween(0, 360),
    speed: randomIntBetween(0, 60),
  };
}

export default function () {
  currentVUs.add(__VU);
  const location = generateLocation();

  const response = http.put(
    `${BASE_URL}/api/drivers/${DRIVER_ID}/location`,
    JSON.stringify(location),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`,
      },
      timeout: '10s',
    }
  );

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 1000,
  });

  successRate.add(success);
  responseTime.add(response.timings.duration);
  
  if (!success) {
    errorCount.add(1);
  }

  sleep(randomIntBetween(1, 3) / 10);
}

export function handleSummary(data) {
  const total = data.metrics.http_reqs?.values?.count || 0;
  const rps = data.metrics.http_reqs?.values?.rate || 0;
  const avg = data.metrics.http_req_duration?.values?.avg || 0;
  const p50 = data.metrics.http_req_duration?.values['p(50)'] || 0;
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const p99 = data.metrics.http_req_duration?.values['p(99)'] || 0;
  const max = data.metrics.http_req_duration?.values?.max || 0;
  const successRateVal = (data.metrics.success_rate?.values?.rate || 0) * 100;
  const errors = data.metrics.errors?.values?.count || 0;

  const passed = successRateVal >= 90 && p95 < 800;

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           📊 LOAD TEST - ĐO HIỆU NĂNG HỆ THỐNG               ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  📈 THROUGHPUT                                               ║');
  console.log(`║     Total Requests:    ${total.toString().padStart(10)}                       ║`);
  console.log(`║     Throughput:        ${rps.toFixed(0).padStart(10)} req/s                   ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  ⏱️  LATENCY                                                  ║');
  console.log(`║     Avg:               ${avg.toFixed(0).padStart(10)}ms                       ║`);
  console.log(`║     P50 (median):      ${p50.toFixed(0).padStart(10)}ms                       ║`);
  console.log(`║     P95:               ${p95.toFixed(0).padStart(10)}ms                       ║`);
  console.log(`║     P99:               ${p99.toFixed(0).padStart(10)}ms                       ║`);
  console.log(`║     Max:               ${max.toFixed(0).padStart(10)}ms                       ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  ✅ SUCCESS / ❌ ERRORS                                       ║');
  console.log(`║     Success Rate:      ${successRateVal.toFixed(2).padStart(10)}%                      ║`);
  console.log(`║     Error Count:       ${errors.toString().padStart(10)}                       ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  if (passed) {
    console.log('║  ✅ PASSED - Hệ thống đáp ứng tốt ở tải cao                  ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  📊 Max Throughput đạt được: ${rps.toFixed(0)} req/s                       ║`);
    console.log('║                                                              ║');
    console.log('║  👉 Tiếp tục: k6 run 03-stress-test.js để tìm breaking point ║');
  } else {
    console.log('║  ⚠️  BOTTLENECK DETECTED - Hệ thống gặp giới hạn             ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  📊 Max Throughput trước bottleneck: ~${rps.toFixed(0)} req/s              ║`);
    console.log('║                                                              ║');
    console.log('║  🔍 Kiểm tra: CPU, Memory, Redis connections, DB connections ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  return {};
}
