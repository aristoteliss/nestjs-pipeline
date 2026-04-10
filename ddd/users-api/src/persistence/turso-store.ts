import type { Client } from '@libsql/client';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

export const TURSO_CLIENT = Symbol('TURSO_CLIENT');

@Injectable()
export class TursoStore implements OnModuleInit {
  private readonly logger = new Logger(TursoStore.name);

  constructor(@Inject(TURSO_CLIENT) private readonly client: Client) {}

  async onModuleInit(): Promise<void> {
    await this.client.batch(
      [
        // ── Users (extended with tenant / department for CASL interpolation) ──
        `CREATE TABLE IF NOT EXISTS users (
          id         TEXT     PRIMARY KEY,
          username   TEXT     NOT NULL,
          email      TEXT     NOT NULL,
          tenant_id  TEXT,
          department TEXT,
          created_at INTEGER  NOT NULL,
          updated_at INTEGER  NOT NULL
        )`,

        // ── CASL: capabilities ─────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS capabilities (
          id         TEXT    PRIMARY KEY,
          subject    TEXT    NOT NULL,
          action     TEXT    NOT NULL,
          conditions TEXT,
          inverted   INTEGER NOT NULL DEFAULT 0,
          reason     TEXT,
          fields     TEXT
        )`,

        // ── CASL: roles ────────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS roles (
          id   TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE
        )`,

        // ── CASL: role ↔ capability junction ───────────────────────────────────
        `CREATE TABLE IF NOT EXISTS role_capabilities (
          role_id       TEXT NOT NULL REFERENCES roles(id),
          capability_id TEXT NOT NULL REFERENCES capabilities(id),
          PRIMARY KEY (role_id, capability_id)
        )`,

        // ── CASL: user ↔ role junction ─────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS user_roles (
          user_id TEXT NOT NULL REFERENCES users(id),
          role_id TEXT NOT NULL REFERENCES roles(id),
          PRIMARY KEY (user_id, role_id)
        )`,

        // ── CASL: per-user additional capabilities ─────────────────────────────
        `CREATE TABLE IF NOT EXISTS user_additional_capabilities (
          user_id       TEXT NOT NULL REFERENCES users(id),
          capability_id TEXT NOT NULL REFERENCES capabilities(id),
          PRIMARY KEY (user_id, capability_id)
        )`,

        // ── CASL: per-user denied capabilities ─────────────────────────────────
        `CREATE TABLE IF NOT EXISTS user_denied_capabilities (
          user_id       TEXT NOT NULL REFERENCES users(id),
          capability_id TEXT NOT NULL REFERENCES capabilities(id),
          PRIMARY KEY (user_id, capability_id)
        )`,
        // ── Auth sessions ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS auth (
          id         TEXT     PRIMARY KEY,
          tenant_id  TEXT,
          token      TEXT     NOT NULL,
          created_at INTEGER  NOT NULL,
          updated_at INTEGER  NOT NULL
        )`,
      ],
      'write',
    );

    this.logger.log(
      'Turso tables ready (users, capabilities, roles, junctions, auth)',
    );
  }
}
