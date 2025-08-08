module.exports = {
  apps: [
    {
      name: 'materialize-server',
      script: 'dist/index.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        LOG_LEVEL: 'debug'
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001,
        LOG_LEVEL: 'info'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'warn'
      },

      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',

      // Auto restart
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,

      // Health monitoring
      max_restarts: 5,
      min_uptime: '10s',

      // Advanced PM2 features
      merge_logs: true,
      time: true,
      
      // EC2 specific configurations
      node_args: '--max-old-space-size=2048',
      
      // Deployment configuration
      deploy: {
        production: {
          user: 'ec2-user',
          host: ['your-ec2-instance-ip'],
          ref: 'origin/main',
          repo: 'your-git-repo-url',
          path: '/home/ec2-user/materialize-server',
          'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env production',
          env: {
            NODE_ENV: 'production'
          }
        },
        staging: {
          user: 'ec2-user',
          host: ['your-staging-ec2-instance-ip'],
          ref: 'origin/develop',
          repo: 'your-git-repo-url',
          path: '/home/ec2-user/materialize-server-staging',
          'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.js --env staging',
          env: {
            NODE_ENV: 'staging'
          }
        }
      }
    }
  ]
};