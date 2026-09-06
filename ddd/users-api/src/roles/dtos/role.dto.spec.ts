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
import { toRoleResponseDto } from './role.dto';

describe('toRoleResponseDto', () => {
  it('maps a full role snapshot to response DTO', () => {
    const input = {
      id: 'role-1',
      name: 'admin',
    };

    expect(toRoleResponseDto(input as never)).toEqual({
      id: 'role-1',
      name: 'admin',
    });
  });

  it('handles projected role with name omitted by CASL field permissions', () => {
    const projected = {
      id: 'role-1',
    };

    expect(toRoleResponseDto(projected as never)).toEqual({
      id: 'role-1',
    });
  });

  it('handles projected role with id omitted by CASL field permissions', () => {
    const projected = {
      name: 'admin',
    };

    expect(toRoleResponseDto(projected as never)).toEqual({
      name: 'admin',
    });
  });

  it('throws NotFoundException when role is null', () => {
    expect(() => toRoleResponseDto(null)).toThrow(NotFoundException);
  });

  it('throws InternalServerErrorException when mapped fields have invalid types', () => {
    const invalid = {
      id: 12345, // invalid type, should be string
    };

    expect(() => toRoleResponseDto(invalid as never)).toThrow(
      InternalServerErrorException,
    );
  });
});
