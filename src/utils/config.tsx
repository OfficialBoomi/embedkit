import logger from '../logger.service';

/**
 * Safely retrieves a nested value from an object given a dot-notated string path.
 *
 * @param {object} obj - The object to search.
 * @param {string} path - Dot-notated path (e.g., `'form.selectEnvironmentForm.table'`).
 * @return {*} The nested value if found, otherwise `undefined`.
 */
export const getNestedConfig = (obj: any, path: string): any => {
  const result = path.split('.').reduce((acc, key) => acc?.[key], obj);
  return result;
};
