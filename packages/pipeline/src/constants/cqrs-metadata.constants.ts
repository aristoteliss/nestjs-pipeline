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

/**
 * NestJS CQRS metadata keys — re-exported from `@nestjs/cqrs` internal constants
 * as a convenience for consumers who need to inspect handler metadata directly.
 *
 * These are the keys set by `@CommandHandler`, `@QueryHandler`, and
 * `@EventsHandler` decorators. The pipeline itself uses `ExplorerService.explore()`
 * rather than reading these keys directly.
 */
export {
  COMMAND_HANDLER_METADATA,
  EVENTS_HANDLER_METADATA,
  QUERY_HANDLER_METADATA,
} from '@nestjs/cqrs/dist/decorators/constants';
