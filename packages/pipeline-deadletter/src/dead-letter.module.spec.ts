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
    send: async () => { },
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
});

