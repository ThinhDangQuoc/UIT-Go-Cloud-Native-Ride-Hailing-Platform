import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPIKE TEST - KIỂM TRA ĐỘT BIẾN TẢI
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Định nghĩa: Spike test đánh giá khả năng xử lý đột biến tải bất ngờ
 * (flash crowd, viral event, DDoS-like traffic).
 * 
 * Kịch bản thực tế:
 * - Giờ cao điểm đặt xe (7-9h sáng, 5-7h chiều)
 * - Sự kiện đặc biệt (concert, match bóng đá)
 * - Mưa đột ngột → tất cả mọi người đặt xe cùng lúc
 * 
 * Mục tiêu đo:
 * - Thời gian phản hồi khi spike
 * - Error rate trong spike
 * - Recovery time sau khi spike giảm
 * - Hệ thống có crash không?
 * 
 * Pattern:
 *   VUs: 100 ─────╱╲──────── 100
 *               /    \
 *            2000    2000
 *              │      │
 *           Spike   Recovery
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';
const DRIVER_ID = __ENV.DRIVER_ID || '3';

// Custom metrics
const successRate = new Rate('success_rate');
const spikeResponseTime = new Trend('spike_response_time', true);
const recoveryResponseTime = new Trend('recovery_response_time', true);
const errorCount = new Counter('errors');

// Track phases
let currentPhase = 'baseline';

export const options = {
  stages: [
    // Phase 1: Baseline - đo performance bình thường
    { duration: '30s', target: 100 },   // Warm up to baseline
    { duration: '30s', target: 100 },   // Hold baseline - measure normal
    
    // Phase 2: SPIKE - đột biến cực nhanh!
    { duration: '10s', target: 2000 },  // 🚀 Spike UP - 10s để lên 2000 VUs
    { duration: '30s', target: 2000 },  // Hold spike - measure under extreme load
    
    // Phase 3: Crash down - giảm đột ngột
    { duration: '10s', target: 100 },   // 📉 Spike DOWN - về baseline
    
    // Phase 4: Recovery - đo khả năng phục hồi
    { duration: '60s', target: 100 },   // Recovery observation
  ],
  // Total: ~3 phút
  
  thresholds: {
    // Spike test thường có thresholds lỏng hơn
    'http_req_duration': ['p(95)<60000'],  // Allow high latency during spike
    'success_rate': ['rate>0.5'],           // At least 50% during spike
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
  // Determine current phase based on VUs
  const vus = __VU;
  if (vus <= 100) {
    currentPhase = 'baseline_or_recovery';
  } else if (vus > 100) {
    currentPhase = 'spike';
  }

  const location = generateLocation();

  const response = http.put(
    `${BASE_URL}/api/drivers/${DRIVER_ID}/location`,
    JSON.stringify(location),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`,
      },
      timeout: '30s',
    }
  );

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
  });

  successRate.add(success);
  
  // Track response time by phase
  if (currentPhase === 'spike') {
    spikeResponseTime.add(response.timings.duration);
  } else {
    recoveryResponseTime.add(response.timings.duration);
  }
  
  if (!success) {
    errorCount.add(1);
  }

  // Minimal sleep
  sleep(0.05);
}

export function handleSummary(data) {
  const total = data.metrics.http_reqs?.values?.count || 0;
  const rps = data.metrics.http_reqs?.values?.rate || 0;
  const avg = data.metrics.http_req_duration?.values?.avg || 0;
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const max = data.metrics.http_req_duration?.values?.max || 0;
  const successRateVal = (data.metrics.success_rate?.values?.rate || 0) * 100;
  const errors = data.metrics.errors?.values?.count || 0;
  
  // Phase-specific metrics
  const spikeAvg = data.metrics.spike_response_time?.values?.avg || 0;
  const spikeP95 = data.metrics.spike_response_time?.values?.['p(95)'] || 0;
  const recoveryAvg = data.metrics.recovery_response_time?.values?.avg || 0;
  const recoveryP95 = data.metrics.recovery_response_time?.values?.['p(95)'] || 0;

  // Calculate recovery ratio
  const spikeImpact = spikeAvg > 0 ? (spikeAvg / (recoveryAvg || 1)).toFixed(1) : 'N/A';
  const recoveryStatus = recoveryP95 < 500 ? '✅ GOOD' : (recoveryP95 < 2000 ? '⚠️ SLOW' : '❌ POOR');

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          ⚡ SPIKE TEST - KIỂM TRA ĐỘT BIẾN TẢI                   ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  📈 OVERALL METRICS                                              ║');
  console.log(`║     Total Requests:    ${total.toString().padStart(10)}                           ║`);
  console.log(`║     Peak Throughput:   ${rps.toFixed(0).padStart(10)} req/s                       ║`);
  console.log(`║     Success Rate:      ${successRateVal.toFixed(2).padStart(10)}%                          ║`);
  console.log(`║     Total Errors:      ${errors.toString().padStart(10)}                           ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  🚀 SPIKE PHASE (2000 VUs)                                       ║');
  console.log(`║     Avg Response:      ${spikeAvg.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P95 Response:      ${spikeP95.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     Impact Ratio:      ${spikeImpact.toString().padStart(10)}x slower                    ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  🔄 RECOVERY PHASE (back to 100 VUs)                             ║');
  console.log(`║     Avg Response:      ${recoveryAvg.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     P95 Response:      ${recoveryP95.toFixed(0).padStart(10)}ms                           ║`);
  console.log(`║     Recovery Status:   ${recoveryStatus.padStart(10)}                           ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  🎯 SPIKE TEST ANALYSIS                                          ║');
  
  if (successRateVal > 80 && recoveryP95 < 1000) {
    console.log('║                                                                  ║');
    console.log('║  ✅ SPIKE HANDLING: EXCELLENT                                    ║');
    console.log('║     Hệ thống xử lý spike tốt và phục hồi nhanh                   ║');
  } else if (successRateVal > 50 && recoveryP95 < 2000) {
    console.log('║                                                                  ║');
    console.log('║  ⚠️  SPIKE HANDLING: ACCEPTABLE                                  ║');
    console.log('║     Hệ thống chịu được spike nhưng cần cải thiện                 ║');
  } else {
    console.log('║                                                                  ║');
    console.log('║  ❌ SPIKE HANDLING: POOR                                         ║');
    console.log('║     Hệ thống cần auto-scaling hoặc rate limiting                 ║');
  }
  
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  return {};
}
