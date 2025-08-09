module.exports = {
  apps: [
    {
      name: 'seedbox-frontend',
      script: 'serve',
      args: '-s dist -l 5174 -C',
      env: {
        PM2_SERVE_PATH: './dist',
        PM2_SERVE_PORT: 5174,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true
    }
  ]
};
