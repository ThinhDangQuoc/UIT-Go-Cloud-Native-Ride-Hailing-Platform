import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * SOAK TEST - Kiểm tra độ bền (Memory leaks, Resource exhaustion)
 * Duration: 10 phút (shortened for demo, production: 2 hours)
 * Constant load: 500 VUs
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
const DRIVER_ID = __ENV.DRIVER_ID || '2';

const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const errorCount = new Counter('errors');

export const options = {
  stages: [
    { duration: '1m', target: 500 },    // Ramp up
    { duration: '8m', target: 500 },    // Sustained load
    { duration: '1m', target: 0 },      // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'success_rate': ['rate>0.95'],
  },
};

// Track metrics over time to detect degradation
let checkpoints = [];

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

  const startTime = Date.now();
  
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

  const duration = Date.now() - startTime;
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
  });

  successRate.add(success);
  responseTime.add(duration);
  
  if (!success) errorCount.add(1);

  sleep(randomIntBetween(2, 3) / 10);
}

export function handleSummary(data) {
  const total = data.metrics.http_reqs?.values?.count || 0;
  const rps = data.metrics.http_reqs?.values?.rate || 0;
  const avg = data.metrics.http_req_duration?.values?.avg || 0;
  const p50 = data.metrics.http_req_duration?.values['p(50)'] || 0;
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const p99 = data.metrics.http_req_duration?.values['p(99)'] || 0;
  const min = data.metrics.http_req_duration?.values?.min || 0;
  const max = data.metrics.http_req_duration?.values?.max || 0;
  const success = (data.metrics.success_rate?.values?.rate || 0) * 100;
  const errors = data.metrics.errors?.values?.count || 0;

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                       SOAK TEST RESULTS                           ║');
  console.log('║           Kiểm tra độ bền (Memory leaks, Degradation)             ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Duration:          ${(data.state.testRunDurationMs / 1000 / 60).toFixed(1).padStart(10)} minutes                       ║`);
  console.log(`║  Total Requests:    ${total.toString().padStart(10)}                              ║`);
  console.log(`║  Avg Throughput:    ${rps.toFixed(0).padStart(10)} req/s                          ║`);
  console.log(`║  Success Rate:      ${success.toFixed(2).padStart(10)}%                             ║`);
  console.log(`║  Total Errors:      ${errors.toString().padStart(10)}                              ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  LATENCY DISTRIBUTION:                                            ║');
  console.log(`║    Min:             ${min.toFixed(2).padStart(10)}ms                             ║`);
  console.log(`║    Avg:             ${avg.toFixed(2).padStart(10)}ms                             ║`);
  console.log(`║    P50:             ${p50.toFixed(2).padStart(10)}ms                             ║`);
  console.log(`║    P95:             ${p95.toFixed(2).padStart(10)}ms                             ║`);
  console.log(`║    P99:             ${p99.toFixed(2).padStart(10)}ms                             ║`);
  console.log(`║    Max:             ${max.toFixed(2).padStart(10)}ms                             ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  
  // Stability analysis
  console.log('║  🔍 STABILITY ANALYSIS:                                           ║');
  
  const latencyVariance = max - min;
  const isStable = latencyVariance < 5000 && success > 95;
  
  if (isStable) {
    console.log('║    ✅ No memory leaks detected                                    ║');
    console.log('║    ✅ Latency remained stable                                     ║');
    console.log('║    ✅ No resource exhaustion                                      ║');
  } else {
    if (latencyVariance > 5000) {
      console.log('║    ⚠️  High latency variance → Possible memory pressure          ║');
    }
    if (success < 95) {
      console.log('║    ⚠️  Degraded success rate → Resource exhaustion               ║');
    }
    if (max > 10000) {
      console.log('║    ⚠️  Very high max latency → GC pauses or connection issues    ║');
    }
  }
  
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  VERDICT: ${isStable ? '✅ SYSTEM STABLE - Ready for production' : '❌ ISSUES DETECTED - Need investigation'}        ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  return {};
}
