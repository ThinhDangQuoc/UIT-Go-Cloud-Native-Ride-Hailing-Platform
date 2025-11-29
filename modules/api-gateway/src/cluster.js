/**
 * ============================================================
 * API GATEWAY - CLUSTER MODE
 * ============================================================
 * 
 * Sử dụng Node.js cluster để tận dụng multi-core.
 * Mỗi worker process xử lý requests độc lập.
 * 
 * ============================================================
 */

import cluster from 'cluster';
import os from 'os';

const numCPUs = parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length;

if (cluster.isPrimary) {
  console.log(`\n🌐 [API-GATEWAY] Master process ${process.pid} is running`);
  console.log(`📊 [API-GATEWAY] Starting ${numCPUs} workers...\n`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`💀 [API-GATEWAY] Worker ${worker.process.pid} died`);
    console.log(`🔄 [API-GATEWAY] Starting a new worker...`);
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`✅ [API-GATEWAY] Worker ${worker.process.pid} is online`);
  });

} else {
  import('./app.js');
}
