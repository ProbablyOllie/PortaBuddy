import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Content Security Policy for the built site. GitHub Pages can't send headers, so it goes in a
 * <meta> tag. Only the app's own scripts and styles run; nothing is loaded from other sites, so
 * even if a bug let a project file inject markup or CSS, it couldn't load or send anything.
 * (Added at build time only: Vite's dev server needs inline scripts.)
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'portabuddy-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`),
  };
}

// Relative base so the built site works from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  // exceljs is lazy-loaded only when exporting, so its large chunk is expected.
  build: { chunkSizeWarningLimit: 1000 },
});
