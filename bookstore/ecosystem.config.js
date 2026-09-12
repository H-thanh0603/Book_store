/**
 * PM2 Cluster Configuration — Bookstore multi-instance (Group 2, task 5)
 * ----------------------------------------------------------------------
 * Run:    npm run build && pm2 start ecosystem.config.js --env production
 * Reload: pm2 reload bookstore          (zero-downtime rolling restart)
 * Scale:  edit `instances`, then `pm2 reload ecosystem.config.js --update-env`
 *
 * Topology:
 *   Cloudflare → nginx (:80/:443) → PM2 cluster (:3000, one shared socket)
 *   Each worker opens DB_POOL_MAX Postgres connections; put PgBouncer in front
 *   of Postgres once workers × DB_POOL_MAX approaches max_connections.
 *
 * Scheduler: the dedicated `bookstore-worker` app below owns the job queue.
 * The web cluster sets JOB_SCHEDULER_ENABLED=false so it never schedules —
 * DB claims would keep a double-scheduler safe but wasteful. If you run
 * without the worker app, unset the flag: worker NODE_APP_INSTANCE=0
 * schedules as before.
 *
 * Log rotation (OPS-002): PM2 itself never rotates ./logs/*. One-time on the
 * server: `pm2 install pm2-logrotate` (defaults: 10MB × 30 files per stream
 * are fine). Without it, disk fills slowly but certainly. MISA zips under
 * var/misa are pruned in-app by runDailyMisaExport (MISA_RETENTION_DAYS=90).
 */
module.exports = {
  apps: [
    {
      name: "bookstore",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: "max", // all CPU cores; use an integer for a fixed count
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Jobs are owned by the bookstore-worker app below.
        JOB_SCHEDULER_ENABLED: "false",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        // Behind nginx/Cloudflare the proxy rewrites XFF — required for correct
        // per-client rate limiting and audit identity.
        TRUST_PROXY_HEADERS: "true",
        // Set in your process manager / secret store, NOT committed:
        // DATABASE_URL       — primary (via PgBouncer :6432 when enabled)
        // READ_REPLICA_URL   — optional replica for hot read paths
        // APP_ORIGIN         — public origin, e.g. https://bookstore.example.com
        // INTEGRATION_ENCRYPTION_KEY
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // Graceful shutdown window for in-flight requests before SIGKILL.
      kill_timeout: 30000,
      // Wait for /api/health/live between restarts during reload.
      wait_ready: false,
    },
    {
      // Dedicated job worker (WS1.2 / REL-001): standalone tsx loop, outside
      // the HTTP cluster. A dead web worker can no longer stall background
      // work; a dead job worker is restarted by PM2 and another claimant
      // picks up expired leases within JOB_LEASE_MS (default 5 min).
      name: "bookstore-worker",
      script: "npx",
      args: "tsx scripts/worker.ts",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
        // JOB_TICK_MS / JOB_LEASE_MS optional overrides (defaults: 5 min).
      },
      error_file: "./logs/pm2-worker-error.log",
      out_file: "./logs/pm2-worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      kill_timeout: 60000, // let the in-flight tick finish before SIGKILL
    },
  ],
};
