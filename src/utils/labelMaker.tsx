/**
 * Converts a Boomi-style field name into a human-readable label.
 *
 * This function:
 * - Strips leading `@` characters
 * - Removes preceding path segments before `/`
 * - Adds spaces between camelCase, PascalCase, all-caps acronyms, and numbers
 * - Capitalizes the first letter of each word
 *
 * @param {string} label - The original Boomi-style field name.
 * @return {string} The formatted, human-readable label.
 */
export default function labelMaker(label: string): string {
  try {
    const raw = label.split('/').pop()?.replace(/^@/, '') || label;
    const spaced = raw
      .replace(/([a-z])([A-Z])/g, '$1 $2')     
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') 
      .replace(/([0-9])([a-zA-Z])/g, '$1 $2')   
      .replace(/([a-zA-Z])([0-9])/g, '$1 $2');   

    return spaced
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

  } catch (err) {
    console.error('labelMaker error:', err);
    return label;
  }
}
