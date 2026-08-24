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
 * Scheduler: instrumentation.ts ticks the job queue. In cluster mode every
 * worker would race for the same JobRun rows — safe (DB claims) but wasteful,
 * so by default ONLY worker NODE_APP_INSTANCE=0 schedules (see schedulerEnabled).
 * Set JOB_SCHEDULER_ENABLED=false to outsource jobs to external cron instead.
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
        // Default gate resolves per-worker via NODE_APP_INSTANCE; leave unset here.
        // JOB_SCHEDULER_ENABLED: "false",
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
  ],
};
