module.exports = {
  apps: [{
    name: 'paxton-md',
    script: 'index.js',
    
    // Auto-restart settings
    watch: false,  // Don't watch for file changes
    ignore_watch: ['node_modules', 'sessions', 'temp', 'database.json'],
    watch_delay: 1000,
    
    // Memory management
    max_memory_restart: '500M',  // Restart if memory exceeds 500MB
    
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_file: './logs/combined.log',
    
    // Restart behavior
    min_uptime: '5s',  // Minimum uptime before considering successful
    max_restarts: 10,   // Max restarts in 60s
    restart_delay: 5000, // Wait 5 seconds before restarting
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      TZ: 'Africa/Johannesburg'
    },
    
    // Performance
    instances: 1,
    exec_mode: 'fork',
    
    // Auto-start on boot
    autorestart: true,
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Merge logs
    merge_logs: true,
    
    // Colors in logs
    force_color: true
  }]
};
