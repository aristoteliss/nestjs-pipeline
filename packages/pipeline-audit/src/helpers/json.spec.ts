/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { stringifyAuditValue } from './json';

describe('stringifyAuditValue', () => {
  it('serializes BigInt explicitly as tagged object', () => {
    const serialized = stringifyAuditValue({ balance: 9007199254740991000n });
    expect(JSON.parse(serialized)).toEqual({
      balance: { $type: 'BigInt', value: '9007199254740991000' },
    });
  });

  it('serializes non-finite numbers explicitly as tagged objects', () => {
    const serialized = stringifyAuditValue({
      nanVal: Number.NaN,
      posInf: Number.POSITIVE_INFINITY,
      negInf: Number.NEGATIVE_INFINITY,
    });

    expect(JSON.parse(serialized)).toEqual({
      nanVal: { $type: 'Number', value: 'NaN' },
      posInf: { $type: 'Number', value: 'Infinity' },
      negInf: { $type: 'Number', value: '-Infinity' },
    });
  });

  it('serializes ArrayBuffer and TypedArray views with byte arrays', () => {
    const buffer = new ArrayBuffer(4);
    const view = new Uint8Array(buffer);
    view[0] = 0xca;
    view[1] = 0xfe;
    view[2] = 0xba;
    view[3] = 0xbe;

    const serializedBuffer = stringifyAuditValue({ buf: buffer });
    expect(JSON.parse(serializedBuffer)).toEqual({
      buf: { $type: 'ArrayBuffer', bytes: [202, 254, 186, 190] },
    });

    const serializedView = stringifyAuditValue({ v: view });
    expect(JSON.parse(serializedView)).toEqual({
      v: { $type: 'Uint8Array', bytes: [202, 254, 186, 190] },
    });
  });

  it('serializes sparse arrays preserving array holes explicitly', () => {
    // biome-ignore lint/suspicious/noSparseArray: intentional test of sparse array hole
    const sparse = [1, , 3];
    const serialized = stringifyAuditValue(sparse);
    expect(JSON.parse(serialized)).toEqual([1, { $type: 'ArrayHole' }, 3]);
  });

  it('serializes symbols and symbol properties on objects and Error instances', () => {
    const symKey = Symbol('symField');
    const symVal = Symbol('symValue');

    const obj: Record<string | symbol, unknown> = { regular: 'val', symVal };
    Object.defineProperty(obj, symKey, {
      value: 'hiddenSymValue',
      enumerable: true,
    });

    const serializedObj = stringifyAuditValue(obj);
    const parsedObj = JSON.parse(serializedObj);
    expect(parsedObj.$type).toBe('Object');
    expect(parsedObj.properties.regular).toBe('val');
    expect(parsedObj.properties.symVal).toEqual({
      $type: 'Symbol',
      description: 'symValue',
    });
    expect(parsedObj.symbolProperties).toHaveLength(1);

    const err = new Error('failed with symbols');
    Object.defineProperty(err, symKey, {
      value: 'errSymValue',
      enumerable: true,
    });
    const serializedErr = stringifyAuditValue(err);
    const parsedErr = JSON.parse(serializedErr);
    expect(parsedErr.$type).toBe('Error');
    expect(parsedErr.symbolProperties).toBeDefined();
  });
});
