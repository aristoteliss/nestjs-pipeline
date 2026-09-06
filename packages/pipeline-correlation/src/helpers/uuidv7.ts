/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for alternative licensing.
 */

/**
 * Canonical UUIDv7 implementation shared with `@nestjs-pipeline/core`.
 * UUIDs are timestamp-sortable across different milliseconds; random bits mean
 * values generated within the same millisecond are not monotonic.
 */
export { uuidv7 } from '@nestjs-pipeline/core';
