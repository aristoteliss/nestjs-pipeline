/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

/** Canonical email representation used for persistence and lookup. */
export const EmailSchema = z.string().trim().toLowerCase().email();
