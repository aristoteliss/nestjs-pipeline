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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { PIPELINE_MODULE_OPTIONS, PipelineModuleOptions } from '../options/pipeline-module.options';
import { correlationStore } from './correlation.store';

/**
 * NestJS middleware that extracts a correlation ID from the incoming HTTP
 * request header and stores it in {@link correlationStore}.
 *
 * The header name defaults to `x-correlation-id` and can be customized via
 * `correlation: { header: 'x-request-id' }` in {@link PipelineModule.forRoot}.
 *
 * Applied automatically unless `correlation: { header: false }` is set.
 */
@Injectable()
export class HttpCorrelationMiddleware implements NestMiddleware {
  private readonly header: string;

  constructor(
    @Optional()
    @Inject(PIPELINE_MODULE_OPTIONS)
    options?: PipelineModuleOptions,
  ) {
    const h = options?.correlation?.header;
    this.header = typeof h === 'string' ? h : 'x-correlation-id';
  }

  use(req: IncomingMessage, _res: ServerResponse, next: () => void): void {
    const correlationId = req.headers?.[this.header] as string | undefined;

    if (correlationId) {
      correlationStore.run(correlationId, next);
    } else {
      next();
    }
  }
}
