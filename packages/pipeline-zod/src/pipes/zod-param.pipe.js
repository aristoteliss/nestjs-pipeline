Object.defineProperty(exports, '__esModule', { value: true });
exports.ZodPipe = void 0;
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
const common_1 = require('@nestjs/common');
/**
 * A reusable NestJS pipe that validates any value (route param, body, query)
 * against a Zod schema — including transform schemas (e.g. mappers).
 *
 *   @Param('id', new ZodPipe<UserIdDto, string>(UserIdDtoSchema))
 *   @Body(new ZodPipe(CreateUserDtoSchema))
 *   @Body(new ZodPipe(CreateUserMapper))   // transform schema → outputs a Command
 */
class ZodPipe {
  constructor(schema) {
    this.schema = schema;
  }
  transform(value) {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new common_1.BadRequestException(result.error.flatten());
    return result.data;
  }
}
exports.ZodPipe = ZodPipe;
//# sourceMappingURL=zod-param.pipe.js.map
