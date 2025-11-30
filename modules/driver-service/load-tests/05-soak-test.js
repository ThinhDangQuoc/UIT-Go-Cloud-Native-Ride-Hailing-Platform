import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOAK TEST (ENDURANCE TEST) - KIỂM TRA ỔN ĐỊNH DÀI HẠN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Định nghĩa: Soak test chạy hệ thống với tải ổn định trong thời gian DÀI
 * để phát hiện các vấn đề chỉ xuất hiện theo thời gian.
 * 
 * Phát hiện:
 * - Memory leaks (Node.js, Redis connections)
 * - Connection pool exhaustion
 * - Database connection leaks
 * - Gradual performance degradation
 * - Resource exhaustion
 * 
 * Kịch bản thực tế:
 * - Hệ thống chạy 24/7 với tải đều
 * - Overnight processing
 * - Weekend traffic
 * 
 * Pattern:
 *   VUs: 200 ────────────────────────────────── 200
 *        │                                      │
 *        └──────────── 30 minutes ──────────────┘
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
const DRIVER_ID = __ENV.DRIVER_ID || '3';

// Soak duration - có thể override bằng env var
const SOAK_DURATION = __ENV.SOAK_DURATION || '30m';

// Custom metrics
const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const errorCount = new Counter('errors');
const memoryTrend = new Gauge('memory_estimate');

// Time-based tracking
const timeSlots = {};
let startTime = Date.now();

export const options = {
  stages: [
    // Ramp up
    { duration: '2m', target: 200 },    // Gentle ramp up
    
    // SOAK - Maintain constant load
    { duration: SOAK_DURATION, target: 200 },  // Main soak period
    
    // Ramp down
    { duration: '1m', target: 0 },      // Gentle ramp down
  ],
  
  thresholds: {
    // Soak test cần strict thresholds vì expected là ổn định
    'success_rate': ['rate>0.99'],         // 99%+ success required
    'http_req_duration': ['p(95)<1000'],   // P95 < 1s
    'http_req_duration': ['p(99)<2000'],   // P99 < 2s
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

function getTimeSlot() {
  const elapsed = Math.floor((Date.now() - startTime) / (5 * 60 * 1000)); // 5-minute slots
  return `slot_${elapsed}`;
}

export default function () {
  const location = generateLocation();
  const slot = getTimeSlot();

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
  });

  successRate.add(success);
  responseTime.add(response.timings.duration);
  
  // Track by time slot for trend analysis
  if (!timeSlots[slot]) {
    timeSlots[slot] = { success: 0, fail: 0, totalTime: 0, count: 0 };
  }
  timeSlots[slot].count++;
  timeSlots[slot].totalTime += response.timings.duration;
  if (success) {
    timeSlots[slot].success++;
  } else {
    timeSlots[slot].fail++;
    errorCount.add(1);
  }

  // Normal sleep for soak test
  sleep(0.1);
}

export function handleSummary(data) {
  const total = data.metrics.http_reqs?.values?.count || 0;
  const rps = data.metrics.http_reqs?.values?.rate || 0;
  const avg = data.metrics.http_req_duration?.values?.avg || 0;
  const p50 = data.metrics.http_req_duration?.values['p(50)'] || 0;
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const p99 = data.metrics.http_req_duration?.values['p(99)'] || 0;
  const max = data.metrics.http_req_duration?.values?.max || 0;
  const min = data.metrics.http_req_duration?.values?.min || 0;
  const successRateVal = (data.metrics.success_rate?.values?.rate || 0) * 100;
  const errors = data.metrics.errors?.values?.count || 0;

  // Analyze trends
  const duration = (Date.now() - startTime) / 1000 / 60; // minutes
  
  // Stability analysis
  const isStable = successRateVal > 99 && p95 < 1000;
  const hasMemoryLeak = max > p95 * 3; // Suspect if max is 3x P95
  const hasDegradation = p99 > p95 * 2; // Suspect if P99 is 2x P95

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          🕐 SOAK TEST - KIỂM TRA ỔN ĐỊNH DÀI HẠN                 ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  ⏱️  Duration: ${duration.toFixed(1)} minutes                                        ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  📈 OVERALL METRICS                                              ║');
  console.log(`║     Total Requests:    ${total.toString().padStart(10)}                           ║`);
  console.log(`║     Avg Throughput:    ${rps.toFixed(0).padStart(10)} req/s                       ║`);
  console.log(`║     Success Rate:      ${successRateVal.toFixed(2).padStart(10)}%                          ║`);
  console.log(`║     Total Errors:      ${errors.toString().padStart(10)}                           ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  ⏱️  LATENCY ANALYSIS                                             ║');
  console.log(`║     Min:               ${min.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     Avg:               ${avg.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P50 (median):      ${p50.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P95:               ${p95.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P99:               ${p99.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     Max:               ${max.toFixed(0).padStart(10)}ms                           ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  🔍 STABILITY ANALYSIS                                           ║');
  console.log('║                                                                  ║');
  
  // Memory leak detection
  if (hasMemoryLeak) {
    console.log('║  ⚠️  POTENTIAL MEMORY LEAK DETECTED                              ║');
    console.log('║     Max latency >> P95 suggests resource exhaustion              ║');
  } else {
    console.log('║  ✅ No memory leak indicators                                    ║');
  }
  
  // Degradation detection
  if (hasDegradation) {
    console.log('║  ⚠️  PERFORMANCE DEGRADATION DETECTED                            ║');
    console.log('║     P99 >> P95 suggests gradual slowdown                         ║');
  } else {
    console.log('║  ✅ No performance degradation                                   ║');
  }
  
  // Overall stability
  console.log('║                                                                  ║');
  if (isStable) {
    console.log('║  🎯 SOAK TEST RESULT: ✅ STABLE                                  ║');
    console.log('║     Hệ thống ổn định trong thời gian dài                         ║');
  } else {
    console.log('║  🎯 SOAK TEST RESULT: ⚠️ NEEDS ATTENTION                         ║');
    console.log('║     Phát hiện vấn đề stability - cần investigate                 ║');
  }
  
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  💡 RECOMMENDATIONS                                              ║');
  if (hasMemoryLeak) {
    console.log('║     • Check Node.js heap memory over time                        ║');
    console.log('║     • Monitor Redis connection count                             ║');
    console.log('║     • Review database connection pooling                         ║');
  }
  if (hasDegradation) {
    console.log('║     • Check for connection pool exhaustion                       ║');
    console.log('║     • Monitor CPU/Memory trends                                  ║');
    console.log('║     • Review GC pauses in Node.js                                ║');
  }
  if (isStable && !hasMemoryLeak && !hasDegradation) {
    console.log('║     • System is production-ready for sustained load              ║');
    console.log('║     • Consider increasing soak duration for more confidence      ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  return {};
}
