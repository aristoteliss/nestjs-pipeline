import type { UserCapabilities } from '@nestjs-pipeline/casl';

export type SessionUser = {
  id: string;
  email?: string;
  tenantId?: string;
  department?: string;
  capabilities?: UserCapabilities;
};

/** Shape of the Fastify secure-session data store. */
export interface SessionData {
  user?: SessionUser;
  api?: { id: string };
}
