import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API is proxied so the session cookie is first-party to the app origin,
// and the Google OAuth callback can come back through the same host.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
    },
  },
});
