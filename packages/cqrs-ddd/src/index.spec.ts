/* Copyright (C) 2026-present Aristotelis — see repository license. */

import * as adapter from '@cqrs-ddd/nestjs';
import * as adapterCorrelation from '@cqrs-ddd/nestjs/correlation';
import * as adapterJobContext from '@cqrs-ddd/nestjs/job-context';
import { describe, expect, it } from 'vitest';
import * as correlation from './correlation.js';
import * as facade from './index.js';
import * as jobContext from './job-context.js';

describe('@nestjs-pipeline/cqrs-ddd', () => {
  it.each([
    ['the main entry', facade, adapter],
    ['correlation', correlation, adapterCorrelation],
    ['job-context', jobContext, adapterJobContext],
  ])('re-exports %s of @cqrs-ddd/nestjs unchanged', (_entry, own, source) => {
    expect(Object.keys(own).sort()).toEqual(Object.keys(source).sort());
    for (const [name, value] of Object.entries(source)) {
      expect(own[name as keyof typeof own]).toBe(value);
    }
  });
});
