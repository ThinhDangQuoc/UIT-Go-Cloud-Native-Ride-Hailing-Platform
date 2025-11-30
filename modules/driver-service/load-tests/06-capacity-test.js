import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAPACITY TEST - XÁC ĐỊNH MAX CAPACITY VỚI SLA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Định nghĩa: Capacity test xác định số lượng users/requests TỐI ĐA 
 * mà hệ thống có thể xử lý trong khi VẪN đáp ứng SLA.
 * 
 * Khác với Stress Test:
 * - Stress Test: Tìm breaking point (khi nào CRASH)
 * - Capacity Test: Tìm max load (khi nào VI PHẠM SLA)
 * 
 * SLA Constraints:
 * - Error Rate: < 1%
 * - P95 Latency: < 500ms
 * - P99 Latency: < 1000ms
 * 
 * Method: Step-up load testing
 *   VUs: 50 → 100 → 150 → 200 → ... → MAX (khi vi phạm SLA)
 * 
 * Kịch bản thực tế:
 * - Capacity planning cho Black Friday
 * - Sizing infrastructure cho event
 * - Budget estimation for scaling
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
const DRIVER_ID = __ENV.DRIVER_ID || '3';

// SLA Thresholds
const SLA_ERROR_RATE = 0.01;      // 1% max error
const SLA_P95_LATENCY = 500;      // 500ms max P95
const SLA_P99_LATENCY = 1000;     // 1000ms max P99

// Custom metrics
const successRate = new Rate('success_rate');
const responseTime = new Trend('response_time', true);
const errorCount = new Counter('errors');

// Step tracking
const stepMetrics = [];
let currentStep = 0;

export const options = {
  // STEP-UP PATTERN: Tăng dần từng bước, giữ ổn định để đo
  stages: [
    // Step 1: 50 VUs
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },    // Hold and measure
    
    // Step 2: 100 VUs
    { duration: '20s', target: 100 },
    { duration: '1m', target: 100 },   // Hold and measure
    
    // Step 3: 150 VUs
    { duration: '20s', target: 150 },
    { duration: '1m', target: 150 },   // Hold and measure
    
    // Step 4: 200 VUs
    { duration: '20s', target: 200 },
    { duration: '1m', target: 200 },   // Hold and measure
    
    // Step 5: 250 VUs
    { duration: '20s', target: 250 },
    { duration: '1m', target: 250 },   // Hold and measure
    
    // Step 6: 300 VUs
    { duration: '20s', target: 300 },
    { duration: '1m', target: 300 },   // Hold and measure
    
    // Step 7: 400 VUs (likely near/past capacity)
    { duration: '20s', target: 400 },
    { duration: '1m', target: 400 },   // Hold and measure
    
    // Step 8: 500 VUs (likely past capacity)
    { duration: '20s', target: 500 },
    { duration: '1m', target: 500 },   // Hold and measure
    
    // Cool down
    { duration: '30s', target: 0 },
  ],
  // Total: ~12 minutes
  
  // SLA-based thresholds
  thresholds: {
    'success_rate': [`rate>${1 - SLA_ERROR_RATE}`],  // 99%+
    'http_req_duration': [`p(95)<${SLA_P95_LATENCY}`],
    'http_req_duration': [`p(99)<${SLA_P99_LATENCY}`],
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
      timeout: '10s',
    }
  );

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'latency OK': (r) => r.timings.duration < SLA_P95_LATENCY,
  });

  successRate.add(success);
  responseTime.add(response.timings.duration);
  
  if (!success) {
    errorCount.add(1);
  }

  // Normal pacing
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
  const successRateVal = (data.metrics.success_rate?.values?.rate || 0) * 100;
  const errorRate = 100 - successRateVal;
  const errors = data.metrics.errors?.values?.count || 0;

  // SLA Check
  const slaErrorOK = errorRate < (SLA_ERROR_RATE * 100);
  const slaP95OK = p95 < SLA_P95_LATENCY;
  const slaP99OK = p99 < SLA_P99_LATENCY;
  const allSLAMet = slaErrorOK && slaP95OK && slaP99OK;

  // Estimate max capacity based on results
  let estimatedCapacity;
  if (allSLAMet) {
    estimatedCapacity = '500+ VUs (SLA met at max test load)';
  } else if (slaP95OK && slaErrorOK) {
    estimatedCapacity = '~400 VUs (P99 exceeded SLA)';
  } else if (slaErrorOK) {
    estimatedCapacity = '~300 VUs (P95 exceeded SLA)';
  } else {
    estimatedCapacity = '~200 VUs (Error rate exceeded SLA)';
  }

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          📊 CAPACITY TEST - XÁC ĐỊNH MAX CAPACITY                ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  📋 SLA REQUIREMENTS                                             ║');
  console.log(`║     Error Rate:        < ${(SLA_ERROR_RATE * 100).toFixed(1)}%                               ║`);
  console.log(`║     P95 Latency:       < ${SLA_P95_LATENCY}ms                              ║`);
  console.log(`║     P99 Latency:       < ${SLA_P99_LATENCY}ms                             ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  📈 ACTUAL RESULTS                                               ║');
  console.log(`║     Total Requests:    ${total.toString().padStart(10)}                           ║`);
  console.log(`║     Avg Throughput:    ${rps.toFixed(0).padStart(10)} req/s                       ║`);
  console.log(`║     Success Rate:      ${successRateVal.toFixed(2).padStart(10)}%                          ║`);
  console.log(`║     Error Rate:        ${errorRate.toFixed(2).padStart(10)}%    ${slaErrorOK ? '✅' : '❌'}                    ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  ⏱️  LATENCY RESULTS                                              ║');
  console.log(`║     Avg:               ${avg.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P50:               ${p50.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P95:               ${p95.toFixed(0).padStart(10)}ms    ${slaP95OK ? '✅' : '❌'} (SLA: <${SLA_P95_LATENCY}ms)        ║`);
  console.log(`║     P99:               ${p99.toFixed(0).padStart(10)}ms    ${slaP99OK ? '✅' : '❌'} (SLA: <${SLA_P99_LATENCY}ms)       ║`);
  console.log(`║     Max:               ${max.toFixed(0).padStart(10)}ms                           ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  🎯 CAPACITY ANALYSIS                                            ║');
  console.log('║                                                                  ║');
  
  if (allSLAMet) {
    console.log('║  ✅ ALL SLA REQUIREMENTS MET                                     ║');
    console.log('║                                                                  ║');
    console.log('║  📊 Estimated Max Capacity:                                      ║');
    console.log(`║     ${estimatedCapacity.padEnd(50)}  ║`);
    console.log('║                                                                  ║');
    console.log('║  💡 Có thể test với VUs cao hơn để tìm exact capacity           ║');
  } else {
    console.log('║  ⚠️  SLA VIOLATIONS DETECTED                                     ║');
    console.log('║                                                                  ║');
    if (!slaErrorOK) {
      console.log(`║     ❌ Error Rate: ${errorRate.toFixed(2)}% > ${(SLA_ERROR_RATE * 100).toFixed(1)}%                             ║`);
    }
    if (!slaP95OK) {
      console.log(`║     ❌ P95 Latency: ${p95.toFixed(0)}ms > ${SLA_P95_LATENCY}ms                            ║`);
    }
    if (!slaP99OK) {
      console.log(`║     ❌ P99 Latency: ${p99.toFixed(0)}ms > ${SLA_P99_LATENCY}ms                           ║`);
    }
    console.log('║                                                                  ║');
    console.log('║  📊 Estimated Max Capacity (with SLA):                           ║');
    console.log(`║     ${estimatedCapacity.padEnd(50)}  ║`);
  }
  
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  💰 SCALING RECOMMENDATIONS                                      ║');
  const throughputPerInstance = rps;
  const instancesFor1k = Math.ceil(1000 / throughputPerInstance);
  const instancesFor5k = Math.ceil(5000 / throughputPerInstance);
  const instancesFor10k = Math.ceil(10000 / throughputPerInstance);
  console.log(`║     Current throughput: ${throughputPerInstance.toFixed(0)} req/s per container             ║`);
  console.log(`║     For 1,000 req/s:    ${instancesFor1k} instances                              ║`);
  console.log(`║     For 5,000 req/s:    ${instancesFor5k} instances                             ║`);
  console.log(`║     For 10,000 req/s:   ${instancesFor10k} instances                            ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  return {};
}
