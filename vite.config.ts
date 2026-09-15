import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // GitHub Pages: project sites are served under /<repo-name>/ (e.g. /llmrix-page/),
  // but user/org sites (repos named <owner>.github.io) are served at the root.
  // On GitHub Actions, GITHUB_REPOSITORY is "owner/repo"; locally it falls back to '/'.
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const base = repoName && !repoName.endsWith('.github.io') ? `/${repoName}/` : '/';
  return {
    base,
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      global: 'globalThis',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        buffer: 'buffer',
      },
    },
    optimizeDeps: {
      include: ['buffer'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('mermaid')) return 'vendor-mermaid';
              if (id.includes('react-syntax-highlighter') || id.includes('prism') || id.includes('refractor')) return 'vendor-syntax';
              if (id.includes('katex')) return 'vendor-katex';
            }
          }
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
