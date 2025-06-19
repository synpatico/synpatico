 /**
 * Synpatico Core Protocol (Functional)
 * ------------------------------------
 * This file contains the stateless, core logic engine for the Synpatico protocol,
 * exported as a collection of pure functions. It is framework-agnostic.
 */

import { getStructureInfo, getStructureSignature } from '@synpatico/genome'
import type { 
  StructurePacket, 
  StructureDefinition, 
  EncodeContext 
} from './types.js';
import { 
  TYPE_MARKER,
  type SerializedSpecialType, 
  type TypeMarker 
} from './serialization-types.js';

// --- Helper Functions (previously private methods) ---

/**
 * Recursively creates a map of an object's structure (its "shape").
 * It correctly identifies special types that should be treated as single values.
 */
function createShape(obj: unknown): Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null) {
    return { type: typeof obj };
  }
  // These types are handled by the rich serializer and represent a single value.
  if (obj instanceof Date || obj instanceof Map || obj instanceof Set || obj instanceof Error) {
    return { type: 'special_value' };
  }
  if (Array.isArray(obj)) {
    return { type: 'array', itemShapes: obj.map(item => createShape(item)) };
  }
  const shape: Record<string, unknown> = { type: 'object' };
  const sortedKeys = Object.keys(obj).sort();
  for (const key of sortedKeys) {
    shape[key] = createShape((obj as Record<string, unknown>)[key]);
  }
  return shape;
}

/**
 * Recursively traverses an object to produce a flat array of its values.
 * The traversal order is deterministic based on sorted keys.
 */
function extractValues(data: unknown): unknown[] {
  const values: unknown[] = [];
  const recurse = (current: unknown) => {
    if (typeof current !== 'object' || current === null) {
      values.push(current);
      return;
    }
    if (current instanceof Date || current instanceof Map || current instanceof Set || current instanceof Error) {
      values.push(current);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(item => recurse(item));
      return;
    }
    const sortedKeys = Object.keys(current).sort();
    for (const key of sortedKeys) {
      recurse((current as Record<string, unknown>)[key]);
    }
  };
  recurse(data);
  return values;
}

/**
 * Reconstructs an object from a flat array of values and a shape definition.
 */
function reconstructObject(values: unknown[], shape: Record<string, unknown>): unknown {
  let valueIndex = 0;
  const recurse = (currentShape: Record<string, unknown>): unknown => {
    const type = currentShape.type as string;
    // If the type is a primitive or a special value, consume one item from the array.
    if (type !== 'object' && type !== 'array') {
      return values[valueIndex++];
    }
    if (type === 'array') {
      const arr: unknown[] = [];
      const itemShapes = currentShape.itemShapes as Record<string, unknown>[];
      for (const itemShape of itemShapes) {
        arr.push(recurse(itemShape));
      }
      return arr;
    }
    const obj: Record<string, unknown> = {};
    const sortedKeys = Object.keys(currentShape).filter(k => k !== 'type').sort();
    for (const key of sortedKeys) {
      obj[key] = recurse(currentShape[key] as Record<string, unknown>);
    }
    return obj;
  };
  return recurse(shape);
}

/**
 * Processes an object or array, wrapping special JS types in a placeholder object.
 */
function processForSerialization(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") { return obj; }
  if (obj instanceof Date) { return { __type: TYPE_MARKER.Date, value: obj.toISOString() }; }
  if (obj instanceof Map) { return { __type: TYPE_MARKER.Map, value: Array.from(obj.entries()) }; }
  if (obj instanceof Set) { return { __type: TYPE_MARKER.Set, value: Array.from(obj) }; }
  if (obj instanceof Error) { return { __type: TYPE_MARKER.Error, value: { message: obj.message, name: obj.name, stack: obj.stack } }; }
  if (Array.isArray(obj)) { return obj.map((item) => processForSerialization(item)); }
  if (obj.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) { result[key] = processForSerialization(value); }
    return result;
  }
  return obj;
}

/**
 * Traverses a reconstructed object and "hydrates" placeholder objects back into rich JS types.
 */
function processForDeserialization(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") { return obj; }
  const objRecord = obj as Record<string, unknown>;
  if ("__type" in objRecord && typeof objRecord.__type === "string") {
    const typeMarker = objRecord.__type as TypeMarker;
    switch (typeMarker) {
      case TYPE_MARKER.Date:
        if (typeof objRecord.value === "string") { return new Date(objRecord.value); }
        return null;
      case TYPE_MARKER.Map:
        // [MODIFIED] Returns a standard Map.
        if (Array.isArray(objRecord.value)) { return new Map(objRecord.value as [unknown, unknown][]); }
        return new Map();
      case TYPE_MARKER.Set:
        // [MODIFIED] Returns a standard Set.
        if (Array.isArray(objRecord.value)) { return new Set(objRecord.value as unknown[]); }
        return new Set();
      case TYPE_MARKER.Error: {
        if (typeof objRecord.value === "object" && objRecord.value !== null) {
          const errorValue = objRecord.value as Record<string, unknown>;
          const error = new Error(typeof errorValue.message === 'string' ? errorValue.message : '');
          if (typeof errorValue.name === 'string') { error.name = errorValue.name; }
          if (typeof errorValue.stack === 'string') { error.stack = errorValue.stack; }
          return error;
        }
        return new Error();
      }
      default: return objRecord.value;
    }
  }
  if (Array.isArray(obj)) { return obj.map((item) => processForDeserialization(item)); }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(objRecord)) { result[key] = processForDeserialization(value); }
  return result;
}

// --- Public API Functions (previously public methods) ---

/**
 * A utility method to create a structure definition from an object.
 * This is used by both the client and server to cache structures after a standard JSON response.
 */
export function createStructureDefinition(data: object): StructureDefinition {
  const info = getStructureInfo(data);
  const shape = createShape(data);
  return { shape, id: info.id };
}

/**
 * Encodes an object into a values-only packet, assuming the structure is already known.
 * This is called by the server-side SDK for subsequent, optimized requests.
 */
export function encode(data: object, context: EncodeContext): StructurePacket {
  const structureInfo = getStructureInfo(data);
  
  // First, convert the object into a flat array of its values.
  const rawValues = extractValues(data);
  // Then, process that array to preserve rich types like Date, Map, etc.
  const processedValues = processForSerialization(rawValues);
  
  return {
    type: 'values-only',
    structureId: context.knownStructureId,
    values: processedValues,
    metadata: {
      collisionCount: structureInfo.collisionCount,
      levels: structureInfo.levels,
    }
  };
}

/**
 * Decodes a values-only packet using a provided structure definition.
 * This is called by the client-side SDK upon receiving an optimized packet.
 */
export function decode(packet: StructurePacket, structureDef: StructureDefinition): unknown {
  // First, reconstruct the object's shape, but with special types still as placeholders.
  const reconstructed = reconstructObject(packet.values as unknown[], structureDef.shape);
  // Then, traverse the reconstructed object and hydrate the placeholders into rich JS types.
  return processForDeserialization(reconstructed);
}
