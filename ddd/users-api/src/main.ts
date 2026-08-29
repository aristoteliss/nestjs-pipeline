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

import 'reflect-metadata';
import { loadOptionalEnvFile } from '@common/environment/load-optional-env-file';

// This entrypoint intentionally has no environment-dependent static imports.
// ESM dependencies execute before a module body, so load .env first and only
// then import the module that initializes tracing and NestJS.
loadOptionalEnvFile();

void import('./bootstrap').then(({ bootstrap }) => bootstrap());
