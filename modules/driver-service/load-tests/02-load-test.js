import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * LOAD TEST - Kiểm tra với tải bình thường
 * Target: 1000 VUs (~5000 req/s)
 * Duration: 5 phút
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
const DRIVER_ID = __ENV.DRIVER_ID || '2';

const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const errorCount = new Counter('errors');

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Ramp up
    { duration: '1m', target: 500 },    // Increase
    { duration: '2m', target: 1000 },   // Target load
    { duration: '1m', target: 500 },    // Scale down
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'success_rate': ['rate>0.95'],
    'http_req_failed': ['rate<0.05'],
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
  const driverId = DRIVER_ID;
  const location = generateLocation();

  const response = http.put(
    `${BASE_URL}/api/drivers/${driverId}/location`,
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
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  successRate.add(success);
  responseTime.add(response.timings.duration);
  
  if (!success) errorCount.add(1);

  sleep(randomIntBetween(1, 2) / 10);
}

export function handleSummary(data) {
  const total = data.metrics.http_reqs?.values?.count || 0;
  const rps = data.metrics.http_reqs?.values?.rate || 0;
  const avg = data.metrics.http_req_duration?.values?.avg || 0;
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const p99 = data.metrics.http_req_duration?.values['p(99)'] || 0;
  const success = (data.metrics.success_rate?.values?.rate || 0) * 100;
  const errors = data.metrics.errors?.values?.count || 0;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     LOAD TEST RESULTS                        ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Requests:  ${total.toString().padStart(10)}                            ║`);
  console.log(`║  Throughput:      ${rps.toFixed(0).padStart(10)} req/s                        ║`);
  console.log(`║  Success Rate:    ${success.toFixed(2).padStart(10)}%                           ║`);
  console.log(`║  Avg Response:    ${avg.toFixed(2).padStart(10)}ms                           ║`);
  console.log(`║  P95 Response:    ${p95.toFixed(2).padStart(10)}ms                           ║`);
  console.log(`║  P99 Response:    ${p99.toFixed(2).padStart(10)}ms                           ║`);
  console.log(`║  Errors:          ${errors.toString().padStart(10)}                            ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  const passed = success > 95 && p95 < 500;
  console.log(`║  Status: ${passed ? '✅ PASSED - Hệ thống đạt yêu cầu' : '❌ FAILED - Cần tối ưu'}                    ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  return {};
}
