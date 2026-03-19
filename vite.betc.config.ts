import { defineConfig, loadEnv  } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); 
  return {
    root: resolve(__dirname, 'src/test/BeTC'),
    envDir: process.cwd(), 
    server: {
      port: 3000,
      open: true,
    },
    build: {
      outDir: resolve(__dirname, 'dist-BeTC'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'src/test/BeTC/index.html'),
      },
    },
    resolve: {
      alias: {
        '/src': resolve(__dirname, 'src'),
      },
    },
  };
});
