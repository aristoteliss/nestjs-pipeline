/* Copyright (C) 2026-present Aristotelis — see repository license. */

import 'reflect-metadata';
import { loadOptionalEnvFile } from '@common/environment/load-optional-env-file.js';

// This entrypoint intentionally has no environment-dependent static imports.
// ESM dependencies execute before a module body, so load .env first and only
// then import the module that initializes tracing and NestJS.
loadOptionalEnvFile();

void import('./bootstrap.js').then(({ bootstrap }) => bootstrap());
