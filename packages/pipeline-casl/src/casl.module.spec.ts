/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Module } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CaslBehavior } from './casl.behavior';
import { CaslModule } from './casl.module';
import { CASL_PERMISSION_SOURCE } from './constants/tokens';
import { CaslAuthorizer } from './helpers/authorizer';
import type {
  CaslAuthorizationInput,
  ICaslPermissionSource,
} from './interfaces/permission-source.interface';

class Source implements ICaslPermissionSource {
  async load(): Promise<CaslAuthorizationInput | null> {
    return null;
  }
}

@Module({})
class SourceModule {}

const SOURCE_TOKEN = Symbol('source');

function sourceProvider(options: Parameters<typeof CaslModule.forRoot>[0]) {
  return CaslModule.forRoot(options).providers?.find(
    (provider) =>
      typeof provider === 'object' &&
      'provide' in provider &&
      provider.provide === CASL_PERMISSION_SOURCE,
  );
}

describe('CaslModule.forRoot', () => {
  it.each([
    ['a class', Source, { useClass: Source }],
    ['useClass', { useClass: Source }, { useClass: Source }],
    ['useExisting', { useExisting: Source }, { useExisting: Source }],
    [
      'useExisting with a token',
      { useExisting: SOURCE_TOKEN },
      { useExisting: SOURCE_TOKEN },
    ],
  ])('binds %s to CASL_PERMISSION_SOURCE', (_, permissionSource, expected) => {
    expect(sourceProvider({ permissionSource })).toEqual({
      provide: CASL_PERMISSION_SOURCE,
      ...expected,
    });
  });

  it('binds a factory with its injection list', () => {
    const useFactory = () => new Source();

    expect(
      sourceProvider({
        permissionSource: { useFactory, inject: [SOURCE_TOKEN] },
      }),
    ).toEqual({
      provide: CASL_PERMISSION_SOURCE,
      useFactory,
      inject: [SOURCE_TOKEN],
    });
    expect(sourceProvider({ permissionSource: { useFactory } })).toMatchObject({
      inject: [],
    });
  });

  it('passes imports through', () => {
    expect(
      CaslModule.forRoot({ imports: [SourceModule], permissionSource: Source })
        .imports,
    ).toEqual([SourceModule]);
    expect(CaslModule.forRoot({ permissionSource: Source }).imports).toEqual(
      [],
    );
  });

  it('registers globally and exports the behavior, authorizer and source', () => {
    const module = CaslModule.forRoot({ permissionSource: Source });

    expect(module.module).toBe(CaslModule);
    expect(module.global).toBe(true);
    expect(module.exports).toEqual([
      CaslBehavior,
      CaslAuthorizer,
      CASL_PERMISSION_SOURCE,
    ]);
    expect(module.providers).toContain(CaslBehavior);
  });

  it('provides an authorizer that reads the ambient ability', () => {
    const provider = CaslModule.forRoot({
      permissionSource: Source,
    }).providers?.find(
      (candidate) =>
        typeof candidate === 'object' &&
        'provide' in candidate &&
        candidate.provide === CaslAuthorizer,
    ) as { useFactory: () => CaslAuthorizer };

    const authorizer = provider.useFactory();

    expect(authorizer).toBeInstanceOf(CaslAuthorizer);
    expect(authorizer.can('read', 'User')).toBe(false);
  });
});
