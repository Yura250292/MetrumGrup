module.exports = {
  apps: [
    {
      name: 'metrum-web',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/metrum-group',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'metrum-bot',
      script: 'dist/bot/index.js',
      cwd: '/var/www/metrum-group',
      env: {
        NODE_ENV: 'production',
        BOT_MODE: 'polling' // or 'webhook'
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/bot-error.log',
      out_file: './logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
