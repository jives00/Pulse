import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: process.env.NODE_ENV === 'production' ? '/pulse/' : '/',
    resolve: {
      alias: {
        '@pulse/api-client': path.resolve(__dirname, '../../packages/api-client/src/index.ts'),
      },
    },
    server: {
      proxy: {
        '/api': {
        target: env.API_TARGET ?? 'http://synology:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'http://synology:3004');
          });
        },
      },
      },
    },
  };
});
