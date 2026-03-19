import '@testing-library/jest-dom';

console.log('[LIVE TEST] Running with real Boomi API calls.');
console.log('Parent Account ID:', import.meta.env.VITE_API_ACCOUNT_ID);
console.log('Auth Account ID:', import.meta.env.VITE_API_AUTH_USER);
console.log('Account Group:', import.meta.env.VITE_ACCOUNT_GROUP);

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => {
  cleanup();
});
