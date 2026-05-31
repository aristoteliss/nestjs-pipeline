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

import { PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
/**
 * A reusable NestJS pipe that validates any value (route param, body, query)
 * against a Zod schema — including transform schemas (e.g. mappers).
 *
 *   @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema))
 *   @Body(new ZodPipe(CreateUserDtoSchema))
 *   @Body(new ZodPipe(CreateUserMapper))   // transform schema → outputs a Command
 */
export declare class ZodPipe<TOutput, TInput = unknown>
  implements PipeTransform<TInput, TOutput> {
  private readonly schema;
  constructor(schema: ZodType<TOutput>);
  transform(value: TInput): TOutput;
}
//# sourceMappingURL=zod-param.pipe.d.ts.map
