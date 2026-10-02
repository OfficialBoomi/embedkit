import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const LIVE = env.LIVE_TEST === '1';
  return {
    plugins: [react()],
    define: { 'import.meta.env': env },
    test: {
      include: [
        'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
        'src/test/**/*.{test,spec}.{js,ts,jsx,tsx}' 
      ],
      environment: 'jsdom', 
      setupFiles: './src/test/setupTests.ts',
      globals: true,
      css: true,
      testTimeout: 30_000,
      coverage: {
        // lcov is what SonarQube's JS/TS analyzer consumes
        // (sonar.javascript.lcov.reportPaths). 'text' keeps a summary in the CI log.
        provider: 'v8',
        reporter: ['text', 'lcov'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{js,ts,jsx,tsx}'],
        exclude: ['src/test/**', 'src/**/*.d.ts'],
      },
    },
  };
});