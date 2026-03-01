import { describe, it, expect } from 'vitest';
import { safeStringify } from '../helpers/safeStringify';

describe('safeStringify', () => {
  it('stringifies a plain object', () => {
    expect(safeStringify({ a: 1, b: 'hello' })).toBe('{"a":1,"b":"hello"}');
  });

  it('stringifies primitives', () => {
    expect(safeStringify(42)).toBe('42');
    expect(safeStringify('text')).toBe('"text"');
    expect(safeStringify(null)).toBe('null');
    expect(safeStringify(true)).toBe('true');
  });

  it('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = { name: 'root' };
    obj.self = obj;

    const result = safeStringify(obj);
    expect(result).toContain('"name":"root"');
    expect(result).toContain('"self":"[Circular]"');
  });

  it('handles deeply nested circular references', () => {
    const a: Record<string, unknown> = { id: 'a' };
    const b: Record<string, unknown> = { id: 'b', parent: a };
    a.child = b;
    b.grandchild = a;

    const result = safeStringify(a);
    expect(result).toContain('[Circular]');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('supports indentation', () => {
    const result = safeStringify({ x: 1 }, 2);
    expect(result).toContain('\n');
    expect(result).toContain('  "x": 1');
  });

  it('handles arrays', () => {
    expect(safeStringify([1, 2, 3])).toBe('[1,2,3]');
  });

  it('handles undefined values in objects (omitted by JSON.stringify)', () => {
    const result = safeStringify({ a: 1, b: undefined });
    expect(result).toBe('{"a":1}');
  });

  it('handles Date objects', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const result = safeStringify({ date });
    expect(result).toContain('2026-01-01');
  });
});
