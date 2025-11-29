import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * SMOKE TEST - Kiểm tra nhanh hệ thống
 * Duration: 1 phút
 * VUs: 10
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
// DRIVER_ID phải khớp với user.id trong JWT token để pass auth
const DRIVER_ID = __ENV.DRIVER_ID || '2';

// Metrics
const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const errorCount = new Counter('errors');

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'success_rate': ['rate>0.95'],
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
  // Sử dụng DRIVER_ID cố định từ token
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
  });

  successRate.add(success);
  responseTime.add(response.timings.duration);
  
  if (!success) {
    errorCount.add(1);
  }

  sleep(randomIntBetween(2, 3) / 10);
}

export function handleSummary(data) {
  const total = data.metrics.http_reqs?.values?.count || 0;
  const avg = data.metrics.http_req_duration?.values?.avg || 0;
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const success = (data.metrics.success_rate?.values?.rate || 0) * 100;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    SMOKE TEST RESULTS                        ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Requests:  ${total.toString().padStart(8)}                              ║`);
  console.log(`║  Success Rate:    ${success.toFixed(2).padStart(8)}%                             ║`);
  console.log(`║  Avg Response:    ${avg.toFixed(2).padStart(8)}ms                             ║`);
  console.log(`║  P95 Response:    ${p95.toFixed(2).padStart(8)}ms                             ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Status: ${success > 95 && p95 < 500 ? '✅ PASSED' : '❌ FAILED'}                                          ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  return {};
}
