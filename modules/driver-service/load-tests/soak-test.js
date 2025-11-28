import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * K6 Soak Test - Endurance Testing
 * 
 * Purpose:
 * - Detect memory leaks
 * - Identify resource exhaustion over time
 * - Verify system stability under sustained load
 * - Monitor for gradual performance degradation
 * 
 * Duration: 2+ hours at target load
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';

// Soak-specific metrics
const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const memoryIndicator = new Trend('memory_indicator', true);
const connectionPoolHealth = new Rate('connection_pool_health');
const degradationCounter = new Counter('degradation_events');

// Baseline metrics for comparison
let baselineP95 = null;
let baselineAvg = null;

export const options = {
  scenarios: {
    // Sustained load for 2 hours
    soak_test: {
      executor: 'constant-arrival-rate',
      rate: 5000, // 5000 requests per second
      timeUnit: '1s',
      duration: '2h',
      preAllocatedVUs: 2000,
      maxVUs: 5000,
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    success_rate: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
  },
};

// Track metrics over time for trend analysis
const metricsHistory = [];
let checkpointInterval = 0;

export function setup() {
  console.log('=== SOAK TEST STARTING ===');
  console.log('Duration: 2 hours');
  console.log('Target Load: 5000 req/s');
  console.log('Monitoring for: Memory leaks, Performance degradation, Connection exhaustion');
  
  return {
    startTime: Date.now(),
    checkpoints: [],
  };
}

export default function () {
  const driverId = randomIntBetween(1, 50000);
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
      timeout: '5s',
    }
  );

  const duration = Date.now() - startTime;
  responseTime.add(duration);

  const success = response.status === 200;
  successRate.add(success);

  // Check for degradation patterns
  if (success) {
    // Establish baseline in first 5 minutes
    if (__ITER < 10000 && baselineP95 === null) {
      // Collecting baseline data
    } else if (baselineP95 !== null) {
      // Compare against baseline
      if (duration > baselineP95 * 1.5) {
        degradationCounter.add(1, { type: 'latency_spike' });
      }
    }
    
    // Connection pool health indicator
    connectionPoolHealth.add(response.timings.connecting < 100);
  } else {
    // Track error patterns
    if (response.status === 0) {
      degradationCounter.add(1, { type: 'connection_timeout' });
    } else if (response.status === 503) {
      degradationCounter.add(1, { type: 'service_unavailable' });
    } else if (response.status === 500) {
      degradationCounter.add(1, { type: 'internal_error' });
    }
  }

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'no connection issues': (r) => r.timings.connecting < 100,
  });

  // Record periodic checkpoints
  checkpointInterval++;
  if (checkpointInterval >= 10000) {
    checkpointInterval = 0;
    recordCheckpoint(duration, success);
  }

  // Simulate realistic driver behavior with slight variation
  sleep(randomIntBetween(1, 3) / 100);
}

function generateLocation() {
  return {
    lat: 10.7769 + (Math.random() - 0.5) * 0.1,
    lng: 106.7009 + (Math.random() - 0.5) * 0.1,
    heading: randomIntBetween(0, 360),
    speed: randomIntBetween(0, 80),
    accuracy: randomIntBetween(5, 30),
    tripId: Math.random() > 0.7 ? `trip-${randomIntBetween(1, 10000)}` : null,
  };
}

function recordCheckpoint(lastDuration, lastSuccess) {
  const checkpoint = {
    timestamp: Date.now(),
    iterCount: __ITER,
    lastDuration,
    lastSuccess,
  };
  metricsHistory.push(checkpoint);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000 / 60;
  console.log(`\n=== SOAK TEST COMPLETED ===`);
  console.log(`Total Duration: ${duration.toFixed(1)} minutes`);
}

export function handleSummary(data) {
  const totalRequests = data.metrics.http_reqs?.values?.count || 0;
  const successRateValue = data.metrics.success_rate?.values?.rate || 0;
  const avgResponse = data.metrics.http_req_duration?.values?.avg || 0;
  const p95Response = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const p99Response = data.metrics.http_req_duration?.values['p(99)'] || 0;
  const degradations = data.metrics.degradation_events?.values?.count || 0;
  const connectionHealth = data.metrics.connection_pool_health?.values?.rate || 0;

  // Analyze for soak test specific issues
  let analysisReport = [];
  
  if (successRateValue < 0.99) {
    analysisReport.push('⚠️ Success rate below 99% - potential stability issue');
  }
  if (p99Response > 1000) {
    analysisReport.push('⚠️ P99 latency > 1s - possible memory leak or resource exhaustion');
  }
  if (connectionHealth < 0.95) {
    analysisReport.push('⚠️ Connection pool health issues - check DB connection limits');
  }
  if (degradations > 100) {
    analysisReport.push(`⚠️ ${degradations} degradation events detected`);
  }
  if (analysisReport.length === 0) {
    analysisReport.push('✅ System stable under sustained load');
  }

  const report = `
╔══════════════════════════════════════════════════════════════════╗
║                     SOAK TEST RESULTS                            ║
╠══════════════════════════════════════════════════════════════════╣
║  Duration:           2 hours                                     ║
║  Target Load:        5,000 req/s                                 ║
╠══════════════════════════════════════════════════════════════════╣
║  Total Requests:     ${totalRequests.toString().padStart(10)}                           ║
║  Success Rate:       ${(successRateValue * 100).toFixed(3).padStart(10)}%                          ║
║  Avg Response:       ${avgResponse.toFixed(2).padStart(10)}ms                         ║
║  P95 Response:       ${p95Response.toFixed(2).padStart(10)}ms                         ║
║  P99 Response:       ${p99Response.toFixed(2).padStart(10)}ms                         ║
║  Degradation Events: ${degradations.toString().padStart(10)}                           ║
║  Connection Health:  ${(connectionHealth * 100).toFixed(2).padStart(10)}%                          ║
╠══════════════════════════════════════════════════════════════════╣
║  ANALYSIS:                                                       ║
${analysisReport.map(a => `║  ${a.padEnd(62)}║`).join('\n')}
╠══════════════════════════════════════════════════════════════════╣
║  SOAK TEST CHECKLIST:                                            ║
║  □ Memory usage stable over time? (Check Grafana/CloudWatch)     ║
║  □ No connection pool exhaustion?                                ║
║  □ Response times consistent throughout test?                    ║
║  □ No gradual increase in error rate?                            ║
║  □ Redis memory stable? (Check INFO MEMORY)                      ║
║  □ PostgreSQL connection count stable?                           ║
║  □ SQS queue depth not growing unbounded?                        ║
╚══════════════════════════════════════════════════════════════════╝
`;

  return {
    'stdout': report,
    'soak-test-results.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      duration: '2h',
      targetLoad: 5000,
      totalRequests,
      successRate: successRateValue,
      avgResponseTime: avgResponse,
      p95ResponseTime: p95Response,
      p99ResponseTime: p99Response,
      degradationEvents: degradations,
      connectionPoolHealth: connectionHealth,
      analysis: analysisReport,
    }, null, 2),
  };
}
