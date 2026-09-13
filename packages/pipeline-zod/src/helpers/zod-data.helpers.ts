/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

export const ZOD_RAW_INPUT_KEY = Symbol.for('@nestjs-pipeline/zod:raw-input');
export const ZOD_VALIDATED_DATA_KEY = Symbol.for(
  '@nestjs-pipeline/zod:validated-data',
);

const requestRawInputMap = new WeakMap<object, unknown>();
const requestValidatedDataMap = new WeakMap<object, Record<string, unknown>>();

/**
 * Stores the raw input for a request instance in a WeakMap.
 */
export function setRawInput(request: object, rawInput: unknown): void {
  requestRawInputMap.set(request, rawInput);
}

/**
 * Returns the raw input passed into a request constructor created via `createZodRequest()`.
 * If the request was not created via `createZodRequest()`, returns the request itself.
 */
export function getRawInput<T = unknown>(request: unknown): T | undefined {
  if (request && typeof request === 'object') {
    const raw =
      requestRawInputMap.get(request) ??
      (request as Record<string | symbol, unknown>)[ZOD_RAW_INPUT_KEY];
    if (raw !== undefined) {
      return raw as T;
    }
  }
  return request as T;
}

/**
 * Stores the validated output data snapshot of a request in a WeakMap.
 */
export function setValidatedData(
  request: object,
  snapshot: Record<string, unknown>,
): void {
  requestValidatedDataMap.set(request, Object.freeze(snapshot));
}

/**
 * Returns the validated output data snapshot of a request.
 */
export function getValidatedData<T = Record<string, unknown>>(
  request: unknown,
): T | undefined {
  if (request && typeof request === 'object') {
    return (
      (requestValidatedDataMap.get(request) as T | undefined) ??
      ((request as Record<string | symbol, unknown>)[ZOD_VALIDATED_DATA_KEY] as
        | T
        | undefined)
    );
  }
  return undefined;
}

/**
 * Performs a deep clone of data properties (objects, arrays, primitives, Dates).
 */
export function cloneData<T>(data: T): T {
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return new Date(data.getTime()) as unknown as T;
  }
  if (data instanceof RegExp) {
    return new RegExp(data.source, data.flags) as unknown as T;
  }
  if (data instanceof Map) {
    const copy = new Map();
    for (const [k, v] of data.entries()) {
      copy.set(cloneData(k), cloneData(v));
    }
    return copy as unknown as T;
  }
  if (data instanceof Set) {
    const copy = new Set();
    for (const v of data.values()) {
      copy.add(cloneData(v));
    }
    return copy as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(cloneData) as unknown as T;
  }
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    copy[k] = cloneData(v);
  }
  return copy as T;
}

/**
 * Performs a deep structural equality check.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }
  if (Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) {
    return false;
  }
  if (a instanceof Date && b instanceof Date) {
    return Object.is(a.getTime(), b.getTime());
  }
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    const remaining = [...b.entries()];
    for (const [key, value] of a) {
      const index = remaining.findIndex(
        ([otherKey, otherValue]) =>
          deepEqual(key, otherKey) && deepEqual(value, otherValue),
      );
      if (index < 0) return false;
      remaining.splice(index, 1);
    }
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const aItem of a) {
      let found = false;
      for (const bItem of b) {
        if (deepEqual(aItem, bItem)) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (Object.getOwnPropertyDescriptor(b, key) === undefined) {
      return false;
    }
    if (
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if a request instance has been mutated relative to its validated snapshot.
 */
export function hasBeenMutated(
  request: Record<string, unknown>,
  snapshot: Record<string, unknown>,
): boolean {
  const reqKeys = Object.keys(request);
  const snapKeys = Object.keys(snapshot);
  if (reqKeys.length !== snapKeys.length) return true;
  for (const key of snapKeys) {
    if (Object.getOwnPropertyDescriptor(request, key) === undefined) {
      return true;
    }
    if (!deepEqual(request[key], snapshot[key])) {
      return true;
    }
  }
  return false;
}
