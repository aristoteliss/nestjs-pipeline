/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { Migration } from '@mikro-orm/migrations';
import { PostgreSqlPlatform } from '@mikro-orm/postgresql';

/** Align existing PostgreSQL installations with CapabilitySchema.inverted. */
export class Migration20260829000000 extends Migration {
  override async up(): Promise<void> {
    if (!(this.driver.getPlatform() instanceof PostgreSqlPlatform)) return;

    this.addSql(`do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'capabilities'
            and column_name = 'inverted'
            and data_type = 'smallint'
        ) then
          alter table capabilities alter column inverted drop default;
          alter table capabilities
            alter column inverted type boolean using (inverted <> 0);
          alter table capabilities alter column inverted set default false;
        end if;
      end
    $$;`);
  }

  override async down(): Promise<void> {
    if (!(this.driver.getPlatform() instanceof PostgreSqlPlatform)) return;

    this.addSql(`do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'capabilities'
            and column_name = 'inverted'
            and data_type = 'boolean'
        ) then
          alter table capabilities alter column inverted drop default;
          alter table capabilities
            alter column inverted type smallint using (inverted::int::smallint);
          alter table capabilities alter column inverted set default 0;
        end if;
      end
    $$;`);
  }
}
