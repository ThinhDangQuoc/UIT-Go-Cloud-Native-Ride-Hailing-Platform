import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * K6 Stress Test - Find System Breaking Point
 * 
 * Purpose:
 * - Identify maximum throughput before degradation
 * - Find bottlenecks (DB, Queue, Network, Memory)
 * - Measure system recovery after overload
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';

// Metrics for bottleneck analysis
const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const errorsByType = new Counter('errors_by_type');
const queueLag = new Trend('queue_lag', true);
const dbLatency = new Trend('db_latency', true);

export const options = {
  scenarios: {
    // Aggressive stress test
    stress_ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 20000,
      stages: [
        { duration: '1m', target: 1000 },   // Warm up
        { duration: '2m', target: 5000 },   // Normal load
        { duration: '2m', target: 10000 },  // Target load
        { duration: '2m', target: 15000 },  // Stress
        { duration: '2m', target: 20000 },  // Breaking point
        { duration: '2m', target: 25000 },  // Beyond limit
        { duration: '1m', target: 5000 },   // Recovery test
        { duration: '1m', target: 1000 },   // Cool down
      ],
    },
  },

  thresholds: {
    // Relaxed thresholds to observe degradation
    http_req_duration: ['p(95)<2000'],
    success_rate: ['rate>0.90'],
  },
};

// Track request counts per stage for analysis
let currentStage = 'warmup';
const stageMetrics = {};

export function setup() {
  console.log('=== STRESS TEST STARTING ===');
  console.log('Finding system breaking point...');
  
  return {
    startTime: Date.now(),
    stages: [],
  };
}

export default function () {
  const driverId = randomIntBetween(1, 100000);
  const location = generateStressLocation();

  const startTime = Date.now();

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

  const duration = Date.now() - startTime;
  responseTime.add(duration);

  // Classify response
  if (response.status === 200) {
    successRate.add(true);
    
    // Check for degradation indicators in response
    try {
      const body = JSON.parse(response.body);
      if (body.queueDepth) {
        queueLag.add(body.queueDepth);
      }
    } catch (e) {}
    
  } else if (response.status === 429) {
    successRate.add(false);
    errorsByType.add(1, { type: 'rate_limited' });
  } else if (response.status === 503) {
    successRate.add(false);
    errorsByType.add(1, { type: 'service_unavailable' });
  } else if (response.status === 504) {
    successRate.add(false);
    errorsByType.add(1, { type: 'gateway_timeout' });
  } else if (response.status === 0) {
    successRate.add(false);
    errorsByType.add(1, { type: 'connection_failed' });
  } else {
    successRate.add(false);
    errorsByType.add(1, { type: 'other_error' });
  }

  // Check for bottleneck indicators
  check(response, {
    'not rate limited': (r) => r.status !== 429,
    'not timeout': (r) => r.status !== 504,
    'service available': (r) => r.status !== 503,
    'response under 1s': (r) => r.timings.duration < 1000,
    'response under 2s': (r) => r.timings.duration < 2000,
  });

  // Minimal sleep to maximize load
  sleep(0.01);
}

function generateStressLocation() {
  return {
    lat: 10.7769 + (Math.random() - 0.5) * 0.1,
    lng: 106.7009 + (Math.random() - 0.5) * 0.1,
    heading: randomIntBetween(0, 360),
    speed: randomIntBetween(0, 100),
    accuracy: randomIntBetween(1, 100),
  };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n=== STRESS TEST COMPLETED ===`);
  console.log(`Total Duration: ${duration.toFixed(0)}s`);
  console.log('\nAnalyze results to identify:');
  console.log('1. Max sustainable throughput');
  console.log('2. Breaking point (when error rate > 5%)');
  console.log('3. Recovery behavior');
}

export function handleSummary(data) {
  // Calculate breaking point
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const errorRate = 1 - (data.metrics.success_rate?.values?.rate || 1);
  
  let breakingPointAnalysis = '';
  if (errorRate > 0.1) {
    breakingPointAnalysis = '⚠️ CRITICAL: Error rate exceeded 10%';
  } else if (errorRate > 0.05) {
    breakingPointAnalysis = '⚠️ WARNING: Error rate exceeded 5%';
  } else if (p95 > 1000) {
    breakingPointAnalysis = '⚠️ WARNING: P95 latency exceeded 1s';
  } else {
    breakingPointAnalysis = '✅ System handled stress within thresholds';
  }

  const report = `
╔══════════════════════════════════════════════════════════════════╗
║                    STRESS TEST ANALYSIS                          ║
╠══════════════════════════════════════════════════════════════════╣
║  Total Requests:     ${(data.metrics.http_reqs?.values?.count || 0).toString().padStart(10)}                           ║
║  Success Rate:       ${((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(2).padStart(10)}%                          ║
║  Error Rate:         ${(errorRate * 100).toFixed(2).padStart(10)}%                          ║
║  Avg Response:       ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2).padStart(10)}ms                         ║
║  P95 Response:       ${p95.toFixed(2).padStart(10)}ms                         ║
║  P99 Response:       ${(data.metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2).padStart(10)}ms                         ║
╠══════════════════════════════════════════════════════════════════╣
║  ${breakingPointAnalysis.padEnd(62)}║
╠══════════════════════════════════════════════════════════════════╣
║  BOTTLENECK INDICATORS:                                          ║
║  - Rate Limited (429):     Check API Gateway / Rate Limiter      ║
║  - Timeouts (504):         Check upstream service / DB           ║
║  - Service Down (503):     Check memory / CPU / connections      ║
║  - Connection Failed:      Check network / port limits           ║
╚══════════════════════════════════════════════════════════════════╝
`;

  return {
    'stdout': report,
    'stress-test-results.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      totalRequests: data.metrics.http_reqs?.values?.count || 0,
      successRate: data.metrics.success_rate?.values?.rate || 0,
      errorRate: errorRate,
      p95ResponseTime: p95,
      p99ResponseTime: data.metrics.http_req_duration?.values['p(99)'] || 0,
      breakingPointAnalysis,
    }, null, 2),
  };
}
