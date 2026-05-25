module.exports = {
  apps: [
    {
      name: 'mail-telegram-bot',
      script: './dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,

      // Логи
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
      },
      env_development: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
      },
    },
  ],
};
