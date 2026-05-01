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
      id text not null,
      created_at integer not null,
      updated_at integer not null,
      username text not null,
      department text null,
      email text not null,
      tenant_id text null,
      primary key (id)
    );`);

    this.addSql(`create table if not exists auth (
      id text not null,
      created_at integer not null,
      updated_at integer not null,
      user_id text not null,
      tenant_id text null,
      token text not null,
      primary key (id)
    );`);

    this.addSql(`create table if not exists roles (
      id text not null,
      created_at integer not null,
      updated_at integer not null,
      name text not null,
      primary key (id)
    );`);

    this.addSql('create unique index if not exists roles_name_unique on roles (name);');

    this.addSql(`create table if not exists capabilities (
      id text not null,
      created_at integer not null,
      updated_at integer not null,
      role_id text not null,
      action text not null,
      subject text not null,
      conditions text null,
      inverted integer not null default 0,
      reason text null,
      fields text null,
      primary key (id)
    );`);

    this.addSql(`create table if not exists role_capabilities (
      role_id text not null references roles(id),
      capability_id text not null references capabilities(id),
      primary key (role_id, capability_id)
    );`);

    this.addSql(`create table if not exists user_roles (
      user_id text not null references users(id),
      role_id text not null references roles(id),
      primary key (user_id, role_id)
    );`);

    this.addSql(`create table if not exists user_additional_capabilities (
      user_id text not null references users(id),
      capability_id text not null references capabilities(id),
      primary key (user_id, capability_id)
    );`);

    this.addSql(`create table if not exists user_denied_capabilities (
      user_id text not null references users(id),
      capability_id text not null references capabilities(id),
      primary key (user_id, capability_id)
    );`);

    this.addSql(`create table if not exists cache (
      key text not null,
      value text not null,
      expires_at integer null,
      primary key (key)
    );`);
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
