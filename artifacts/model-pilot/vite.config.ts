import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const isReplit = process.env.REPL_ID !== undefined;
const rawPort = process.env.PORT ?? '3791';

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const localWindowsProxy =
  process.env.LOCAL_WINDOWS === '1'
    ? {
        '/api': {
          target: `http://127.0.0.1:${process.env.LOCAL_API_PORT ?? '3792'}`,
          changeOrigin: true,
        },
      }
    : undefined;
const serviceHost =
  process.env.LOCAL_WINDOWS === '1' ? '127.0.0.1' : '0.0.0.0';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    isReplit
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: serviceHost,
    allowedHosts: true,
    proxy: localWindowsProxy,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: serviceHost,
    allowedHosts: true,
    proxy: localWindowsProxy,
  },
});
