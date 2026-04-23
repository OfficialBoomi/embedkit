import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import postcss from './postcss.config';

export default defineConfig({
  plugins: [react()],
  css: { postcss },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: './src/embedkit-cdn.tsx',
      name: 'BoomiEmbedKitCdn',
      fileName: (format) => format === 'umd' ? 'embedkit-cdn.umd.js' : 'embedkit-cdn.js',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: [],
      output: {
        banner: 'var process = typeof process !== "undefined" ? process : { env: {} };',
      },
    },
  },
});
