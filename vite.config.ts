// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cleanPlugin from 'vite-plugin-clean';
import postcss from './postcss.config';

export default defineConfig({
  plugins: [
    react(),
    cleanPlugin({ targetFiles: ['dist'] }),
  ],
  
  css: { postcss },
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'BoomiEmbedKit',
      fileName: 'index',       
      formats: ['es', 'cjs', 'umd'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react-dom/server',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
      output: { globals: { react: 'React', 'react-dom': 'ReactDOM' } },
        },
  },
  server: { host: '0.0.0.0', port: 3000 },
});
