module.exports = {
  apps: [
    {
      name: 'pulse-server',
      script: './apps/server/dist/index.js',
      cwd: '/home/ubuntu/pulse-app',
      env_file: '/etc/pulse.env',
      max_memory_restart: '400M',
      node_args: '--max-old-space-size=300',
    },
  ],
};
