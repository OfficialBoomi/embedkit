/**
 * Removes the encoded Y-coordinate segment (`@@y:<number>`) from a given ID string.
 *
 * Commonly used to normalize function IDs by stripping temporary Y-position markers.
 *
 * @param {string} id - The original ID string containing an optional Y-coordinate (e.g., `"func123@@y:250"`).
 * @return {string} The ID string without the Y-coordinate segment.
 */
export default function stripYFromId(id: string): string {
  try {
    return id.replace(/@@y:-?\d+/, '');
  } catch (err) {
    console.error('stripYFromId Error:', err);
    return id;
  }
}
