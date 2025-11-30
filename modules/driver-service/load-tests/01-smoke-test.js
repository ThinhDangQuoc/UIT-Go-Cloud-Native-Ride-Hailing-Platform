import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SMOKE TEST - KIỂM TRA CHỨC NĂNG CƠ BẢN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Định nghĩa: Smoke testing là kiểm tra sơ bộ để xác nhận các chức năng
 * QUAN TRỌNG NHẤT của hệ thống hoạt động đúng.
 * 
 * Mục đích:
 * - Xác nhận hệ thống có HOẠT ĐỘNG được không
 * - Phát hiện lỗi nghiêm trọng sớm
 * - Quyết định có nên chạy test sâu hơn không
 * 
 * Đặc điểm:
 * - Chạy NHANH (1 phút)
 * - Tải RẤT NHẸ (5 VUs)
 * - Yêu cầu gần 100% SUCCESS
 * 
 * Kết quả mong đợi: PHẢI PASS
 * Nếu FAIL → Dừng lại, fix bug trước khi test tiếp
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
const DRIVER_ID = __ENV.DRIVER_ID || '3';

const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);

export const options = {
  // Smoke test: Tải rất nhẹ, thời gian ngắn
  vus: 5,
  duration: '1m',
  
  // Thresholds NGHIÊM NGẶT - phải gần như 100% pass
  thresholds: {
    'http_req_duration': ['p(95)<300'],    // Response phải nhanh
    'success_rate': ['rate>0.99'],          // 99%+ success
    'http_req_failed': ['rate<0.01'],       // <1% failure
  },
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
  const location = generateLocation();

  const response = http.put(
    `${BASE_URL}/api/drivers/${DRIVER_ID}/location`,
    JSON.stringify(location),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`,
      },
    }
  );

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has response body': (r) => r.body && r.body.length > 0,
  });

  successRate.add(success);
  responseTime.add(response.timings.duration);

  sleep(randomIntBetween(2, 4) / 10);
}

export function handleSummary(data) {
  const total = data.metrics.http_reqs?.values?.count || 0;
  const avg = data.metrics.http_req_duration?.values?.avg || 0;
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const successRateVal = (data.metrics.success_rate?.values?.rate || 0) * 100;
  const failRate = (data.metrics.http_req_failed?.values?.rate || 0) * 100;

  const passed = successRateVal >= 99 && failRate < 1;

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🔥 SMOKE TEST - KIỂM TRA CƠ BẢN                    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Requests:  ${total.toString().padStart(10)}                            ║`);
  console.log(`║  Success Rate:    ${successRateVal.toFixed(2).padStart(10)}%                           ║`);
  console.log(`║  Failure Rate:    ${failRate.toFixed(2).padStart(10)}%                           ║`);
  console.log(`║  Avg Response:    ${avg.toFixed(2).padStart(10)}ms                           ║`);
  console.log(`║  P95 Response:    ${p95.toFixed(2).padStart(10)}ms                           ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  if (passed) {
    console.log('║  ✅ PASSED - Hệ thống hoạt động bình thường                  ║');
    console.log('║                                                              ║');
    console.log('║  👉 Tiếp tục chạy: k6 run 02-load-test.js                    ║');
  } else {
    console.log('║  ❌ FAILED - Hệ thống có vấn đề nghiêm trọng!                ║');
    console.log('║                                                              ║');
    console.log('║  ⛔ DỪNG LẠI - Không chạy Load/Stress test                   ║');
    console.log('║  👉 Kiểm tra: docker logs driver-service                     ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  return {};
}
