import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

/**
 * K6 Load Test Script - Driver Location Updates
 * Target: 10,000 updates/second
 * 
 * Test Scenarios:
 * 1. Smoke Test: Quick validation (10 VUs, 1 min)
 * 2. Load Test: Normal load (1000 VUs, 10 min)
 * 3. Stress Test: Find breaking point (ramp up to 15000 VUs)
 * 4. Soak Test: Endurance test (5000 VUs, 2 hours)
 */

// =====================================================
// CONFIGURATION
// =====================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';

// Custom metrics
const locationUpdateSuccess = new Rate('location_update_success');
const locationUpdateDuration = new Trend('location_update_duration', true);
const locationUpdateErrors = new Counter('location_update_errors');
const batchUpdateSuccess = new Rate('batch_update_success');
const dbWriteLatency = new Trend('db_write_latency', true);

// =====================================================
// TEST SCENARIOS
// =====================================================

export const options = {
  scenarios: {
    // Scenario 1: Smoke Test - Quick validation
    smoke_test: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
      tags: { test_type: 'smoke' },
      exec: 'singleLocationUpdate',
      startTime: '0s',
    },

    // Scenario 2: Load Test - Target 10k updates/sec
    // Each VU sends ~10 requests/sec, need 1000 VUs
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 500 },   // Ramp up to 500
        { duration: '2m', target: 1000 },  // Ramp up to 1000
        { duration: '5m', target: 1000 },  // Stay at 1000 (10k req/s)
        { duration: '1m', target: 0 },     // Ramp down
      ],
      tags: { test_type: 'load' },
      exec: 'singleLocationUpdate',
      startTime: '1m30s',
    },

    // Scenario 3: Stress Test - Find breaking point
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 2000 },
        { duration: '3m', target: 5000 },
        { duration: '3m', target: 10000 },
        { duration: '3m', target: 15000 },  // Beyond normal capacity
        { duration: '2m', target: 0 },
      ],
      tags: { test_type: 'stress' },
      exec: 'singleLocationUpdate',
      startTime: '12m',
    },

    // Scenario 4: Soak Test - Long running (2 hours)
    soak_test: {
      executor: 'constant-vus',
      vus: 5000,
      duration: '2h',
      tags: { test_type: 'soak' },
      exec: 'mixedLocationUpdates',
      startTime: '25m',
    },

    // Scenario 5: Batch Update Test
    batch_test: {
      executor: 'constant-vus',
      vus: 200,
      duration: '5m',
      tags: { test_type: 'batch' },
      exec: 'batchLocationUpdate',
      startTime: '12m',
    },
  },

  thresholds: {
    // Response time thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    location_update_duration: ['p(95)<300', 'p(99)<500'],
    
    // Success rate thresholds
    location_update_success: ['rate>0.99'],
    batch_update_success: ['rate>0.99'],
    
    // Error thresholds
    http_req_failed: ['rate<0.01'],
    location_update_errors: ['count<100'],
  },
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

// Simulate Ho Chi Minh City coordinates
function generateLocation(driverId) {
  // Base coordinates: District 1, HCMC
  const baseLat = 10.7769;
  const baseLng = 106.7009;
  
  // Add random offset (within ~5km)
  const lat = baseLat + (Math.random() - 0.5) * 0.09;
  const lng = baseLng + (Math.random() - 0.5) * 0.09;
  
  return {
    lat: parseFloat(lat.toFixed(8)),
    lng: parseFloat(lng.toFixed(8)),
    heading: randomIntBetween(0, 360),
    speed: randomIntBetween(0, 80),
    accuracy: randomIntBetween(5, 50),
    tripId: Math.random() > 0.7 ? `trip-${randomIntBetween(1, 10000)}` : null,
  };
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${JWT_TOKEN}`,
  };
}

// =====================================================
// TEST FUNCTIONS
// =====================================================

// Single location update (simulates real driver behavior)
export function singleLocationUpdate() {
  const driverId = randomIntBetween(1, 50000);
  const location = generateLocation(driverId);
  
  const payload = JSON.stringify({
    lat: location.lat,
    lng: location.lng,
    heading: location.heading,
    speed: location.speed,
    accuracy: location.accuracy,
    tripId: location.tripId,
  });

  const startTime = Date.now();
  
  const response = http.put(
    `${BASE_URL}/api/drivers/${driverId}/location`,
    payload,
    { headers: getHeaders(), tags: { name: 'single_update' } }
  );

  const duration = Date.now() - startTime;
  locationUpdateDuration.add(duration);

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has message': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.message !== undefined;
      } catch {
        return false;
      }
    },
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  locationUpdateSuccess.add(success);
  
  if (!success) {
    locationUpdateErrors.add(1);
    console.error(`Failed update for driver ${driverId}: ${response.status} - ${response.body}`);
  }

  // Simulate real driver behavior: update every 2-3 seconds
  sleep(randomIntBetween(2, 3) / 10); // Compressed for load test
}

// Batch location update (optimized path)
export function batchLocationUpdate() {
  const driverId = randomIntBetween(1, 50000);
  const batchSize = randomIntBetween(3, 5);
  
  const locations = [];
  let baseLat = 10.7769 + (Math.random() - 0.5) * 0.09;
  let baseLng = 106.7009 + (Math.random() - 0.5) * 0.09;
  
  for (let i = 0; i < batchSize; i++) {
    // Simulate movement
    baseLat += (Math.random() - 0.5) * 0.001;
    baseLng += (Math.random() - 0.5) * 0.001;
    
    locations.push({
      lat: parseFloat(baseLat.toFixed(8)),
      lng: parseFloat(baseLng.toFixed(8)),
      heading: randomIntBetween(0, 360),
      speed: randomIntBetween(20, 60),
      accuracy: randomIntBetween(5, 20),
      timestamp: Date.now() + i * 3000,
    });
  }

  const payload = JSON.stringify({ locations });

  const response = http.post(
    `${BASE_URL}/api/drivers/${driverId}/location/batch`,
    payload,
    { headers: getHeaders(), tags: { name: 'batch_update' } }
  );

  const success = check(response, {
    'batch status is 200': (r) => r.status === 200,
    'batch processed all': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.count === batchSize;
      } catch {
        return false;
      }
    },
  });

  batchUpdateSuccess.add(success);

  if (!success) {
    locationUpdateErrors.add(1);
  }

  sleep(randomIntBetween(5, 10) / 10);
}

// Mixed updates (realistic scenario for soak test)
export function mixedLocationUpdates() {
  group('Mixed Location Updates', function () {
    // 70% single updates, 30% batch updates
    if (Math.random() < 0.7) {
      singleLocationUpdate();
    } else {
      batchLocationUpdate();
    }
  });
}

// =====================================================
// LIFECYCLE HOOKS
// =====================================================

export function setup() {
  console.log('Starting Driver Location Load Test');
  console.log(`Target URL: ${BASE_URL}`);
  
  // Health check
  const healthResponse = http.get(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    console.warn('Health check failed, but continuing...');
  }
  
  return {
    startTime: new Date().toISOString(),
  };
}

export function teardown(data) {
  console.log('Load Test Completed');
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}

// =====================================================
// CUSTOM SUMMARY
// =====================================================

export function handleSummary(data) {
  const summary = {
    testInfo: {
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
    },
    metrics: {
      totalRequests: data.metrics.http_reqs?.values?.count || 0,
      successRate: data.metrics.location_update_success?.values?.rate || 0,
      avgResponseTime: data.metrics.http_req_duration?.values?.avg || 0,
      p95ResponseTime: data.metrics.http_req_duration?.values['p(95)'] || 0,
      p99ResponseTime: data.metrics.http_req_duration?.values['p(99)'] || 0,
      errors: data.metrics.location_update_errors?.values?.count || 0,
    },
    thresholdsPassed: Object.entries(data.thresholds || {}).every(
      ([, v]) => v.ok
    ),
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-results.json': JSON.stringify(summary, null, 2),
    'load-test-results.html': htmlReport(data),
  };
}

function textSummary(data, options) {
  return `
╔══════════════════════════════════════════════════════════════════╗
║           DRIVER LOCATION UPDATE - LOAD TEST RESULTS             ║
╠══════════════════════════════════════════════════════════════════╣
║  Total Requests:    ${(data.metrics.http_reqs?.values?.count || 0).toString().padStart(10)}                            ║
║  Success Rate:      ${((data.metrics.location_update_success?.values?.rate || 0) * 100).toFixed(2).padStart(10)}%                           ║
║  Avg Response:      ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2).padStart(10)}ms                          ║
║  P95 Response:      ${(data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2).padStart(10)}ms                          ║
║  P99 Response:      ${(data.metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2).padStart(10)}ms                          ║
║  Errors:            ${(data.metrics.location_update_errors?.values?.count || 0).toString().padStart(10)}                            ║
╚══════════════════════════════════════════════════════════════════╝
  `;
}

function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Load Test Results - Driver Location Updates</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .metric { padding: 20px; margin: 10px 0; background: #f5f5f5; border-radius: 8px; }
    .metric h3 { margin: 0 0 10px 0; color: #333; }
    .metric .value { font-size: 2em; font-weight: bold; color: #2196F3; }
    .success { color: #4CAF50; }
    .warning { color: #FF9800; }
    .error { color: #f44336; }
  </style>
</head>
<body>
  <h1>Driver Location Update - Load Test Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  
  <div class="metric">
    <h3>Total Requests</h3>
    <div class="value">${data.metrics.http_reqs?.values?.count || 0}</div>
  </div>
  
  <div class="metric">
    <h3>Success Rate</h3>
    <div class="value ${(data.metrics.location_update_success?.values?.rate || 0) > 0.99 ? 'success' : 'error'}">
      ${((data.metrics.location_update_success?.values?.rate || 0) * 100).toFixed(2)}%
    </div>
  </div>
  
  <div class="metric">
    <h3>Average Response Time</h3>
    <div class="value">${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms</div>
  </div>
  
  <div class="metric">
    <h3>P95 Response Time</h3>
    <div class="value ${(data.metrics.http_req_duration?.values['p(95)'] || 0) < 500 ? 'success' : 'warning'}">
      ${(data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms
    </div>
  </div>
</body>
</html>
  `;
}
