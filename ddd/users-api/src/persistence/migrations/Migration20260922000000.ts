/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Migration } from '@mikro-orm/migrations';

/**
 * Turns `auth` into refresh-token sessions and adds the rotated-token history.
 * Existing sessions stored raw access tokens, which cannot be hashed into
 * refresh tokens, so they are discarded: every user logs in again.
 */
export class Migration20260922000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('delete from auth;');
    this.addSql('drop table auth;');
    this.addSql(`create table auth (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      user_id varchar(64) not null references users(id) on delete cascade,
      refresh_token_hash varchar(64) not null,
      previous_refresh_token_hash varchar(64) null,
      rotated_at bigint null,
      expires_at bigint not null,
      revoked_at bigint null,
      version int not null default 1,
      primary key (id)
    );`);
    this.addSql(
      'create unique index auth_refresh_token_hash_unique on auth (refresh_token_hash);',
    );
    this.addSql(
      'create index auth_previous_refresh_token_hash_idx on auth (previous_refresh_token_hash);',
    );
    this.addSql('create index auth_user_id_idx on auth (user_id);');

    this.addSql(`create table auth_consumed_refresh_tokens (
      token_hash varchar(64) not null,
      auth_id varchar(64) not null references auth(id) on delete cascade,
      consumed_at bigint not null,
      primary key (token_hash)
    );`);
    this.addSql(
      'create index auth_consumed_refresh_tokens_auth_id_index on auth_consumed_refresh_tokens (auth_id);',
    );
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists auth_consumed_refresh_tokens;');
    this.addSql('drop table if exists auth;');
    this.addSql(`create table auth (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      user_id varchar(64) not null,
      token text not null,
      primary key (id)
    );`);
    this.addSql('create index auth_user_id_idx on auth (user_id);');
  }
}
