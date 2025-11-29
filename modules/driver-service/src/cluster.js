/**
 * ============================================================
 * CLUSTER MODE - HORIZONTAL SCALING NODE.JS
 * ============================================================
 * 
 * Node.js là single-threaded, nhưng có thể scale horizontally
 * bằng cách chạy nhiều worker processes (1 per CPU core).
 * 
 * Lợi ích:
 * - Tận dụng tất cả CPU cores
 * - Tăng throughput 2-4x (tùy số cores)
 * - Auto-restart workers khi crash
 * 
 * Cách hoạt động:
 * - Master process: Quản lý workers, load balancing
 * - Worker processes: Xử lý requests thực tế
 * 
 * ============================================================
 */

import cluster from 'cluster';
import os from 'os';

// Số workers = số CPU cores (hoặc giới hạn trong container)
const numCPUs = parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length;

if (cluster.isPrimary) {
  console.log(`\n🚀 [CLUSTER] Master process ${process.pid} is running`);
  console.log(`📊 [CLUSTER] Starting ${numCPUs} workers...\n`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Handle worker exit - auto restart
  cluster.on('exit', (worker, code, signal) => {
    console.log(`💀 [CLUSTER] Worker ${worker.process.pid} died (${signal || code})`);
    console.log(`🔄 [CLUSTER] Starting a new worker...`);
    cluster.fork();
  });

  // Log when workers come online
  cluster.on('online', (worker) => {
    console.log(`✅ [CLUSTER] Worker ${worker.process.pid} is online`);
  });

} else {
  // Workers run the actual app
  import('./app.js');
}
