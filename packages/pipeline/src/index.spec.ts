/* Copyright (C) 2026-present Aristotelis — see repository license. */

import * as adapter from '@cqrs-ddd/nestjs';
import * as engine from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';
import * as facade from './index.js';

describe('@nestjs-pipeline/core', () => {
  it('re-exports @cqrs-ddd/pipeline and @cqrs-ddd/nestjs unchanged', () => {
    const source = { ...engine, ...adapter };
    const own = Object.entries(facade);
    expect(own.map(([name]) => name).sort()).toEqual(
      Object.keys(source).sort(),
    );
    for (const [name, value] of own) {
      expect(value).toBe(source[name as keyof typeof source]);
    }
  });
});
