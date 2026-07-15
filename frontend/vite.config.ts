import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

// Open-core: `@ee` resolves to the extension bundle when present (private repo)
// and falls back to no-op stubs in the Community edition (where src/_ee is
// stripped). Same config in both editions — auto-detected, no env flag needed.
const eeDir = existsSync(fileURLToPath(new URL('./src/_ee', import.meta.url)))
  ? './src/_ee'
  : './src/_ee-stubs';

// Read backend port from the root .env file
let backendPort = '3080';
try {
  const envUrl = new URL('../.env', import.meta.url);
  if (existsSync(envUrl)) {
    const envContent = readFileSync(envUrl, 'utf8');
    const match = envContent.match(/^APP_PORT\s*=\s*(\d+)/m);
    if (match) {
      backendPort = match[1];
    }
  }
} catch (e) {
  // Fallback if read fails
}

// Determine backend proxy target (use container hostname in Docker, localhost on host)
const isDocker = process.env.IS_DOCKER === 'true';
const backendTarget = isDocker ? 'http://app:3000' : `http://localhost:${backendPort}`;

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ee': fileURLToPath(new URL(eeDir, import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': backendTarget,
      '/socket.io': {
        target: backendTarget,
        ws: true,
      },
    },
  },
});
