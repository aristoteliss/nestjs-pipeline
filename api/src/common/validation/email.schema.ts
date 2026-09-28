/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { z } from 'zod';

/**
 * The canonical form of an email address, shared by registration, login and
 * user lookup so the same mailbox always compares equal: surrounding spaces
 * are removed and the address is lower-cased before it is validated, so
 * `'  User@Example.COM '` is accepted as `'user@example.com'`.
 */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());
