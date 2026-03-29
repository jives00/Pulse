import React from 'react';
import ReactDOM from 'react-dom/client';
import { configureClient } from '@pulse/api-client';
import { useAuthStore } from './store/authStore';
import App from './App';
import './index.css';

configureClient({
  // In production nginx proxies /pulse/api/ → localhost:3000/api/
  // In dev the Vite proxy handles /api/ → localhost:3000
  apiBase: import.meta.env.PROD ? '/pulse/api' : '/api',
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().logout(),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
