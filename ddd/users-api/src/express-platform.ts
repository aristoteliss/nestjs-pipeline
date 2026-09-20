/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { TRUST_PROXY } from './common/environment/auth-token.config';

/** Express setup: `TRUST_PROXY`, so `req.ip` is the client, and `request.cookies`. */
export function configureExpress(app: NestExpressApplication): void {
  if (TRUST_PROXY !== undefined) app.set('trust proxy', TRUST_PROXY);
  app.use(cookieParser());
}
