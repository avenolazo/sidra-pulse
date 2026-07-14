import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: './web',
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './web/src'),
      '@data': path.resolve(__dirname, './data'),
    },
  },
});
