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

import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { toResponseDto } from './user.dto';

describe('toResponseDto', () => {
  it('maps a full user snapshot to response DTO', () => {
    const input = {
      id: 'usr_1',
      email: 'alice@example.com',
      username: 'alice',
      department: 'engineering',
    };

    expect(toResponseDto(input as never)).toEqual({
      id: 'usr_1',
      email: 'alice@example.com',
      name: 'alice',
      department: 'engineering',
    });
  });

  it('handles projected user with email omitted by CASL field permissions', () => {
    const projected = {
      id: 'usr_1',
      username: 'alice',
    };

    expect(toResponseDto(projected as never)).toEqual({
      id: 'usr_1',
      name: 'alice',
    });
  });

  it('handles projected user with id omitted by CASL field permissions', () => {
    const projected = {
      username: 'alice',
      email: 'alice@example.com',
    };

    expect(toResponseDto(projected as never)).toEqual({
      name: 'alice',
      email: 'alice@example.com',
    });
  });

  it('throws NotFoundException when user is null', () => {
    expect(() => toResponseDto(null)).toThrow(NotFoundException);
  });

  it('throws InternalServerErrorException when mapped fields have invalid types', () => {
    const invalid = {
      id: 12345, // invalid type, should be string
    };

    expect(() => toResponseDto(invalid as never)).toThrow(
      InternalServerErrorException,
    );
  });
});
