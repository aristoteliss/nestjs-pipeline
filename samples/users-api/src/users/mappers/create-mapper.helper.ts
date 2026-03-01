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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */
import { BadRequestException } from '@nestjs/common';
import { z, ZodType } from 'zod';

export function createMapper<TInput, TOutput>(
  schema: ZodType<TOutput, TInput>,
) {
  return {
    schema,
    map(input: TInput): TOutput {
      const result = schema.safeParse(input);
      if (!result.success) throw new BadRequestException(z.treeifyError(result.error));
      return result.data as TOutput;
    },
  };
}
