/**
 * @file positioned-function.d.ts
 * @typedef PositionedFunction
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Represents a transformation function node in the Boomi integration mapping canvas.
 * Supports defining inputs, outputs, type, and optional visual positioning on the canvas.
 *
 * @property {string} id - Unique identifier for the function instance, used in mappings and UI.
 * @property {string} [newId] - Optional new ID assigned after repositioning or editing.
 * @property {string} name - Human-readable name displayed in the UI.
 * @property {string} type - Type or category of the function (e.g., `'custom'`, `'script'`).
 * @property {{ name: string; key: number; dataType: string }[]} inputs - List of input parameters.
 * @property {string} inputs[].name - Input parameter name.
 * @property {number} inputs[].key - Input parameter key identifier.
 * @property {string} inputs[].dataType - Data type for the input parameter.
 * @property {{ name: string; key: number }[]} outputs - List of output parameters.
 * @property {string} outputs[].name - Output parameter name.
 * @property {number} outputs[].key - Output parameter key identifier.
 * @property {string} [script] - Optional script content defining the function logic.
 * @property {boolean} [editable] - False for platform-defined function types (CurrentDate, UserDefined, ...)
 *   that the Transformation Editor cannot author; they are shown and can be wired or deleted, not edited.
 * @property {MapExtensionsFunction} [raw] - The original SDK function for non-scripting types, passed back
 *   to the platform untouched on save so configuration, cache type and UDF references survive.
 * @property {number} [x] - Optional x-coordinate for visual positioning on the canvas.
 * @property {number} [y] - Optional y-coordinate for visual positioning on the canvas.
 */
import type { MapExtensionsFunction } from '@boomi/embedkit-sdk';

export type PositionedFunction = {
  id: string;
  newId?: string;
  name: string;
  type: string;
  inputs: {
    name: string;
    key: number;
    dataType: string;
  }[];
  outputs: {
    name: string;
    key: number;
  }[];
  script?: string;
  editable?: boolean;
  raw?: MapExtensionsFunction;
  x?: number;
  y?: number;
};
