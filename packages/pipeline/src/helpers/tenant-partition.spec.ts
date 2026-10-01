/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { MissingPartitionError } from '../errors/missing-partition.error.js';
import type { IPipelineContext } from '../interfaces/pipeline.context.interface.js';
import { tenantSegments } from './tenant-partition.js';

class MissingTestPartitionError extends MissingPartitionError<'tenant'> {
  override readonly name = 'MissingTestPartitionError';

  constructor(requestName: string, dimension: 'tenant', remedy: string) {
    super('Test', requestName, dimension, remedy);
  }
}

const context = (tenantId?: string) =>
  ({ tenantId, requestName: 'GetThing' }) as IPipelineContext;

describe('tenantSegments', () => {
  it('returns the tenant segment by default', () => {
    expect(
      tenantSegments(context('t1'), {}, MissingTestPartitionError),
    ).toEqual(['t1']);
  });

  it('refuses a missing tenant by default, with the package error', () => {
    const run = () => tenantSegments(context(), {}, MissingTestPartitionError);

    expect(run).toThrow(MissingTestPartitionError);
    expect(run).toThrow(
      'Test key for GetThing requires a tenant partition, which could not be resolved. Run the request inside a tenant scope',
    );
    try {
      run();
    } catch (error) {
      expect(error).toMatchObject({
        name: 'MissingTestPartitionError',
        requestName: 'GetThing',
        dimension: 'tenant',
      });
    }
  });

  it('keeps an absent tenant segment when the tenant is not required', () => {
    expect(
      tenantSegments(
        context(),
        { requireTenant: false },
        MissingTestPartitionError,
      ),
    ).toEqual([undefined]);
  });

  it('omits the segment, and requires nothing, when the tenant is not included', () => {
    expect(
      tenantSegments(
        context(),
        { includeTenant: false },
        MissingTestPartitionError,
      ),
    ).toEqual([]);
  });
});
