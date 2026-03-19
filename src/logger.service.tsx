/**
 * @file logger.service.ts
 * 
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Logging services for the applicatoin.
 * 
 */
interface Logger {
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

const isProd =
  import.meta.env.PROD ||
  import.meta.env.MODE === 'production' ||
  import.meta.env.VITE_APP_ENV === 'production';
const logger: Logger = {
  log: (...args: any[]) => {
    if (!isProd) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (!isProd) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    console.error(...args);
  },
  debug: (...args: any[]) => {
    if (!isProd) {
      console.debug(...args);
    }
  },
};

export default logger;
