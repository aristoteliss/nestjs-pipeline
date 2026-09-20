/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Parses an optional integer variable, throwing at load time when invalid. */
function integer(
  name: string,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}, received "${raw}".`,
    );
  }
  return value;
}

function flag(name: string): boolean {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new Error(`${name} must be "true" or "false", received "${raw}".`);
}

/** Unset: off. `true`/`false`, a hop count, or an address list (`loopback`, CIDRs) as the adapters accept it. */
function trustProxy(): boolean | number | string | undefined {
  const raw = process.env.TRUST_PROXY?.trim();
  if (raw === undefined || raw === '') return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

/** Access-token lifetime in seconds (default 300). */
export const ACCESS_TOKEN_TTL_SECONDS = integer(
  'ACCESS_TOKEN_TTL_SECONDS',
  300,
  60,
  3600,
);

/** Refresh session lifetime in seconds, fixed at login (default 14 days). */
export const REFRESH_TOKEN_TTL_SECONDS = integer(
  'REFRESH_TOKEN_TTL_SECONDS',
  1_209_600,
  3600,
);

/** How long the immediately previous refresh token is still honoured (default 30). */
export const REFRESH_REUSE_GRACE_SECONDS = integer(
  'REFRESH_REUSE_GRACE_SECONDS',
  30,
  0,
  120,
);

/** Proxy trust passed to Express `trust proxy` / Fastify `trustProxy`, so `req.ip` is the client. */
export const TRUST_PROXY = trustProxy();

/** Copy the user's rules into the access token so requests need no permission read (default off). */
export const PERMISSIONS_IN_ACCESS_TOKEN = flag('PERMISSIONS_IN_ACCESS_TOKEN');

/**
 * Largest compact access token that may carry permissions; larger ones are
 * re-issued without them. The default keeps the Fastify session `Set-Cookie`
 * (which also repeats the tenant) under 4096 bytes for the e2e tenant name;
 * the cookie-budget e2e test is the authority.
 */
export const ACCESS_TOKEN_MAX_BYTES = integer(
  'ACCESS_TOKEN_MAX_BYTES',
  2600,
  1024,
  16_384,
);
