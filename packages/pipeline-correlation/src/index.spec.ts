/* Copyright (C) 2026-present Aristotelis — see repository license. */

import * as adapter from '@cqrs-ddd/nestjs/correlation';
import * as engine from '@cqrs-ddd/pipeline-correlation';
import { describe, expect, it } from 'vitest';
import * as facade from './index.js';

describe('@nestjs-pipeline/correlation', () => {
  it('re-exports @cqrs-ddd/pipeline-correlation and @cqrs-ddd/nestjs/correlation unchanged', () => {
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
