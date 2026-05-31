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

import { Migration } from '@mikro-orm/migrations';

export class Migration20260501000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists users (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      username varchar(255) not null,
      department varchar(255) null,
      email varchar(320) not null,
      primary key (id)
    );`);

    this.addSql('create unique index if not exists users_email_unique on users (email);');

    this.addSql(`create table if not exists auth (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      user_id varchar(64) not null,
      token text not null,
      primary key (id)
    );`);

    this.addSql('create index if not exists auth_user_id_idx on auth (user_id);');

    this.addSql(`create table if not exists roles (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      name varchar(128) not null,
      primary key (id)
    );`);

    this.addSql('create unique index if not exists roles_name_unique on roles (name);');

    this.addSql(`create table if not exists capabilities (
      id varchar(64) not null,
      created_at bigint not null,
      updated_at bigint not null,
      role_id varchar(64) not null,
      action varchar(64) not null,
      subject varchar(128) not null,
      conditions text null,
      inverted smallint not null default 0,
      reason text null,
      fields text null,
      primary key (id)
    );`);

    this.addSql(`create table if not exists role_capabilities (
      role_id varchar(64) not null references roles(id) on delete cascade,
      capability_id varchar(64) not null references capabilities(id) on delete cascade,
      primary key (role_id, capability_id)
    );`);

    this.addSql(`create table if not exists user_roles (
      user_id varchar(64) not null references users(id) on delete cascade,
      role_id varchar(64) not null references roles(id) on delete cascade,
      primary key (user_id, role_id)
    );`);

    this.addSql(`create table if not exists user_additional_capabilities (
      user_id varchar(64) not null references users(id) on delete cascade,
      capability_id varchar(64) not null references capabilities(id) on delete cascade,
      primary key (user_id, capability_id)
    );`);

    this.addSql(`create table if not exists user_denied_capabilities (
      user_id varchar(64) not null references users(id) on delete cascade,
      capability_id varchar(64) not null references capabilities(id) on delete cascade,
      primary key (user_id, capability_id)
    );`);

    this.addSql(`create table if not exists cache (
      key varchar(255) not null,
      value text not null,
      expires_at bigint null,
      primary key (key)
    );`);

    this.addSql('create index if not exists cache_expires_at_idx on cache (expires_at);');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists user_denied_capabilities;');
    this.addSql('drop table if exists user_additional_capabilities;');
    this.addSql('drop table if exists user_roles;');
    this.addSql('drop table if exists role_capabilities;');
    this.addSql('drop table if exists capabilities;');
    this.addSql('drop table if exists auth;');
    this.addSql('drop table if exists roles;');
    this.addSql('drop table if exists users;');
    this.addSql('drop table if exists cache;');
  }
}
