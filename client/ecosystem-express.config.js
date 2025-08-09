module.exports = {
  apps: [
    {
      name: 'seedbox-frontend',
      script: 'server.js',
      cwd: '/home/toor/seedbox-lite/client',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 5174
      }
    }
  ]
};
