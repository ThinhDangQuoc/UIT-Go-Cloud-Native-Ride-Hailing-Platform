import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * STRESS TEST - Tìm điểm giới hạn (Breaking Point)
 * Tăng dần VUs để tìm điểm hệ thống bắt đầu fail
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
const DRIVER_ID = __ENV.DRIVER_ID || '2';

const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const errorCount = new Counter('errors');

export const options = {
  stages: [
    { duration: '30s', target: 100 },    // Warm up
    { duration: '1m', target: 500 },     // Normal
    { duration: '1m', target: 1000 },    // High
    { duration: '1m', target: 2000 },    // Stress
    { duration: '1m', target: 3000 },    // Breaking point?
    { duration: '30s', target: 0 },      // Recovery
  ],
  thresholds: {
    // Relaxed thresholds to observe degradation
    'http_req_duration': ['p(95)<2000'],
    'success_rate': ['rate>0.80'],
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
      timeout: '10s',
    }
  );

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
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
  const p50 = data.metrics.http_req_duration?.values['p(50)'] || 0;
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const p99 = data.metrics.http_req_duration?.values['p(99)'] || 0;
  const max = data.metrics.http_req_duration?.values?.max || 0;
  const success = (data.metrics.success_rate?.values?.rate || 0) * 100;
  const errors = data.metrics.errors?.values?.count || 0;
  const errorRate = (errors / total * 100) || 0;

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                      STRESS TEST RESULTS                          ║');
  console.log('║              Tìm điểm giới hạn (Breaking Point)                   ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Requests:    ${total.toString().padStart(10)}                              ║`);
  console.log(`║  Peak Throughput:   ${rps.toFixed(0).padStart(10)} req/s                          ║`);
  console.log(`║  Success Rate:      ${success.toFixed(2).padStart(10)}%                             ║`);
  console.log(`║  Error Rate:        ${errorRate.toFixed(2).padStart(10)}%                             ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  LATENCY ANALYSIS:                                                ║');
  console.log(`║    P50 (Median):    ${p50.toFixed(2).padStart(10)}ms                             ║`);
  console.log(`║    P95:             ${p95.toFixed(2).padStart(10)}ms                             ║`);
  console.log(`║    P99:             ${p99.toFixed(2).padStart(10)}ms                             ║`);
  console.log(`║    Max:             ${max.toFixed(2).padStart(10)}ms                             ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  
  // Determine breaking point
  let breakingPoint = 'Unknown';
  if (errorRate > 10) {
    breakingPoint = `~${(rps * 0.5).toFixed(0)} req/s (high errors)`;
  } else if (p95 > 1000) {
    breakingPoint = `~${(rps * 0.7).toFixed(0)} req/s (high latency)`;
  } else {
    breakingPoint = `>${rps.toFixed(0)} req/s (not reached)`;
  }
  
  console.log(`║  🎯 BREAKING POINT: ${breakingPoint.padEnd(20)}                   ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  
  // Bottleneck analysis
  console.log('║  📊 BOTTLENECK ANALYSIS:                                          ║');
  if (p99 > 2000) {
    console.log('║    ⚠️  High P99 latency → Database/Redis bottleneck               ║');
  }
  if (errorRate > 5) {
    console.log('║    ⚠️  High error rate → Resource exhaustion                      ║');
  }
  if (max > 5000) {
    console.log('║    ⚠️  Very high max latency → Connection pool exhausted          ║');
  }
  if (p99 < 500 && errorRate < 1) {
    console.log('║    ✅ System healthy at this load level                           ║');
  }
  
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  return {};
}
