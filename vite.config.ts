import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built site works from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  // exceljs is lazy-loaded only when exporting, so its large chunk is expected.
  build: { chunkSizeWarningLimit: 1000 },
});
