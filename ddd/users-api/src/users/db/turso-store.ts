import type { Client } from '@libsql/client';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

export const TURSO_CLIENT = Symbol('TURSO_CLIENT');

@Injectable()
export class TursoStore implements OnModuleInit {
  private readonly logger = new Logger(TursoStore.name);

  constructor(@Inject(TURSO_CLIENT) private readonly client: Client) {}

  async onModuleInit(): Promise<void> {
    await this.client.execute(
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
    );
    this.logger.log(`Turso table "users" ready`);
  }
}
