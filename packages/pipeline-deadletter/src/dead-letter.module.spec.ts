/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  DEAD_LETTER_DEFAULT_OPTIONS,
  DEAD_LETTER_TRANSPORT,
} from './constants/tokens';
import { DeadLetterBehavior } from './dead-letter.behavior';
import { DeadLetterModule } from './dead-letter.module';
import type { DeadLetterTransport } from './interfaces/dead-letter-transport.interface';

describe('DeadLetterModule', () => {
  const mockTransport: DeadLetterTransport = {
    send: async () => {},
  };

  it('registers globally via forRoot with transport', () => {
    const dynamicModule = DeadLetterModule.forRoot({
      transport: mockTransport,
      defaults: { includeStack: false },
    });

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.module).toBe(DeadLetterModule);
    expect(dynamicModule.exports).toEqual([
      DeadLetterBehavior,
      DEAD_LETTER_TRANSPORT,
      DEAD_LETTER_DEFAULT_OPTIONS,
    ]);

    const transportProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === DEAD_LETTER_TRANSPORT,
    ) as any;
    const defaultsProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === DEAD_LETTER_DEFAULT_OPTIONS,
    ) as any;

    expect(transportProvider?.useValue).toBe(mockTransport);
    expect(defaultsProvider?.useValue).toEqual({ includeStack: false });
  });

  it('registers globally via forRootAsync with factory', () => {
    const factory = () => mockTransport;
    const dynamicModule = DeadLetterModule.forRootAsync({
      useFactory: factory,
      defaults: { includeStack: true },
    });

    expect(dynamicModule.global).toBe(true);
    const transportProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === DEAD_LETTER_TRANSPORT,
    ) as any;
    expect(transportProvider?.useFactory).toBe(factory);
  });

  it('defaults options.defaults to empty object when omitted', () => {
    const syncMod = DeadLetterModule.forRoot({ transport: mockTransport });
    const syncDefaults = syncMod.providers?.find(
      (p: any) => p.provide === DEAD_LETTER_DEFAULT_OPTIONS,
    ) as any;
    expect(syncDefaults?.useValue).toEqual({});

    const asyncMod = DeadLetterModule.forRootAsync({
      useFactory: () => mockTransport,
    });
    const asyncDefaults = asyncMod.providers?.find(
      (p: any) => p.provide === DEAD_LETTER_DEFAULT_OPTIONS,
    ) as any;
    expect(asyncDefaults?.useValue).toEqual({});
  });
});
