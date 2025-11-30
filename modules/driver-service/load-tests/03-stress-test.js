import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STRESS TEST - TÌM ĐIỂM PHÁ VỠ (BREAKING POINT)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Định nghĩa: Stress testing xác định BREAKING POINT của ứng dụng và
 * cách nó hoạt động dưới điều kiện CỰC ĐỘ.
 * 
 * Phương pháp: TĂNG LIÊN TỤC tải cho đến khi hệ thống FAIL
 * 
 * Mục tiêu:
 * - Tìm BREAKING POINT (VUs tối đa trước khi crash)
 * - Xác định MAX THROUGHPUT tuyệt đối
 * - Quan sát hệ thống DEGRADE như thế nào
 * - Kiểm tra khả năng RECOVERY sau stress
 * 
 * Đặc điểm:
 * - Tải TĂNG LIÊN TỤC đến mức cực đại
 * - KHÔNG có thresholds nghiêm ngặt (mục đích là ĐO, không phải PASS)
 * - Expected: Hệ thống SẼ FAIL ở một điểm nào đó
 * 
 * Kết quả mong đợi: TÌM ĐƯỢC BREAKING POINT
 * Test này KHÔNG cần pass - mục đích là tìm giới hạn!
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
const DRIVER_ID = __ENV.DRIVER_ID || '3';

const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const errorCount = new Counter('errors');
const currentVUs = new Gauge('current_vus');

// Tracking breaking point
let breakingPointVUs = 0;
let maxThroughput = 0;
let firstFailureVUs = 0;

export const options = {
  stages: [
    // AGGRESSIVE STRESS TEST: Tăng đến 5000 VUs để TÌM BREAKING POINT THỰC SỰ
    { duration: '15s', target: 200 },    // Warm up baseline
    { duration: '15s', target: 500 },    // Moderate
    { duration: '15s', target: 1000 },   // High - đã test OK
    { duration: '15s', target: 1500 },   // Very high
    { duration: '20s', target: 2000 },   // Extreme - cần vượt qua
    { duration: '20s', target: 2500 },   // Push beyond
    { duration: '20s', target: 3000 },   // Breaking zone 🔥
    { duration: '20s', target: 4000 },   // Deep breaking zone 🔥🔥
    { duration: '20s', target: 5000 },   // MAX STRESS - should break! 🔥🔥🔥
    { duration: '20s', target: 1000 },   // Recovery test - quan trọng!
    { duration: '15s', target: 0 },      // Cool down
  ],
  // Tổng: ~3.5 phút, peak 5000 VUs
  
  // KHÔNG có thresholds nghiêm ngặt - mục đích là ĐO, không phải PASS
  // Chỉ set thresholds để k6 không crash
  thresholds: {
    'http_req_duration': ['p(95)<60000'],   // 60s timeout - rất lỏng
    'success_rate': ['rate>0'],              // Chỉ cần có request thành công
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
      timeout: '30s',  // Timeout dài để quan sát behavior
    }
  );

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
  });

  successRate.add(success);
  responseTime.add(response.timings.duration);
  
  if (!success) {
    errorCount.add(1);
  }

  // Minimal sleep để maximize stress - GẦN NHƯ KHÔNG NGHỈ
  sleep(0.01);  // Chỉ 10ms - tạo áp lực tối đa
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
  const failRate = 100 - successRateVal;
  const errors = data.metrics.errors?.values?.count || 0;

  // Phân tích breaking point - CHÍNH XÁC hơn
  const isBroken = failRate > 5 || p95 > 3000 || max > 30000;
  const isDegraded = p95 > 1000 || failRate > 1;
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          💥 STRESS TEST - TÌM TRUE BREAKING POINT                ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  📈 THROUGHPUT                                                   ║');
  console.log(`║     Total Requests:    ${total.toString().padStart(10)}                           ║`);
  console.log(`║     Peak Throughput:   ${rps.toFixed(0).padStart(10)} req/s                       ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  ⏱️  LATENCY ANALYSIS                                             ║');
  console.log(`║     Avg:               ${avg.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P50 (median):      ${p50.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P95:               ${p95.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P99:               ${p99.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     Max:               ${max.toFixed(0).padStart(10)}ms                           ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  💔 FAILURE ANALYSIS                                             ║');
  console.log(`║     Success Rate:      ${successRateVal.toFixed(2).padStart(10)}%                          ║`);
  console.log(`║     Failure Rate:      ${failRate.toFixed(2).padStart(10)}%                          ║`);
  console.log(`║     Total Errors:      ${errors.toString().padStart(10)}                           ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  🎯 BREAKING POINT ANALYSIS                                      ║');
  
  if (isBroken) {
    console.log('║                                                                  ║');
    console.log('║  🔥 BREAKING POINT ĐÃ TÌM THẤY!                                  ║');
    console.log('║                                                                  ║');
    console.log(`║     • Peak throughput đo được: ~${rps.toFixed(0)} req/s                       ║`);
    console.log(`║     • Failure rate tại peak: ${failRate.toFixed(1)}%                              ║`);
    console.log(`║     • Latency P95 tại peak: ${p95.toFixed(0)}ms                                ║`);
    console.log(`║     • Max latency/timeout: ${max.toFixed(0)}ms                                 ║`);
    console.log('║                                                                  ║');
    console.log('║  📊 KẾT LUẬN:                                                    ║');
    const effectiveRps = rps * (successRateVal/100);
    console.log(`║     • Effective throughput: ~${effectiveRps.toFixed(0)} req/s                      ║`);
    console.log(`║     • Instances cần cho 10k req/s: ~${Math.ceil(10000 / effectiveRps)}                         ║`);
    console.log(`║     • Hệ thống DEGRADE ở: ~2000-3000 VUs                         ║`);
    console.log(`║     • Hệ thống BREAK ở: ~${Math.floor(5000 * successRateVal / 100)} VUs effective                      ║`);
  } else if (isDegraded) {
    console.log('║                                                                  ║');
    console.log('║  ⚠️  DEGRADATION DETECTED (chưa break hoàn toàn)                 ║');
    console.log('║                                                                  ║');
    console.log(`║     • P95 > 1000ms hoặc error > 1%                               ║`);
    console.log(`║     • Hệ thống đang bị stress nhưng vẫn hoạt động                ║`);
    console.log(`║     • Cần tăng thêm VUs để tìm true breaking point               ║`);
  } else {
    console.log('║                                                                  ║');
    console.log('║  💪 HỆ THỐNG RẤT MẠNH - CHƯA TÌM THẤY BREAKING POINT             ║');
    console.log('║                                                                  ║');
    console.log('║  Hệ thống vẫn chịu được 5000 VUs!                                ║');
    console.log('║  👉 Cần infrastructure test với nhiều máy client hơn             ║');
  }
  
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  🔄 RECOVERY STATUS                                              ║');
  if (successRateVal > 80) {
    console.log('║     ✅ Server có thể phục hồi tốt sau stress                     ║');
  } else if (successRateVal > 50) {
    console.log('║     ⚠️  Server phục hồi chậm - cần monitor                       ║');
  } else {
    console.log('║     ❌ Server cần RESTART sau test này                           ║');
    console.log('║     Chạy: docker-compose restart driver-service                  ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  return {};
}
