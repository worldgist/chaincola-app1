module.exports = {
  apps: [
    {
      name: 'chaincola-transfer',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/.pm2/logs/chaincola-transfer-error.log',
      out_file: '/root/.pm2/logs/chaincola-transfer-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
