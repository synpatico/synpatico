/**
 * serialization-types.ts
 * ----------------------
 * This file defines the types required for the advanced serialization strategy
 * that preserves rich JavaScript types (like Date, Map, Set) within a JSON-compatible format.
 */

// A const object that defines the unique markers for each special type.
export const TYPE_MARKER = {
  Date: 'Date',
  Map: 'Map',
  Set: 'Set',
  Symbol: 'Symbol',
  Function: 'Function',
  Error: 'Error',
  DOMElement: 'DOMElement',
  Class: 'Class'
} as const;

// A union type created from the keys of the TYPE_MARKER object.
export type TypeMarker = typeof TYPE_MARKER[keyof typeof TYPE_MARKER];

// The interface for the placeholder object that replaces a special type during serialization.
export interface SerializedSpecialType {
  __type: TypeMarker;
  value: unknown;
  className?: string;
}
