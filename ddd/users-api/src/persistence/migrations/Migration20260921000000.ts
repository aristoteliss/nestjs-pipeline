/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Migration } from '@mikro-orm/migrations';

/**
 * Materializes each user's permission rules, one row per rule, and backfills
 * them from the assignment tables in the same order `UserPermissionsProjector`
 * writes: role rules by role id then capability id, then additional rules,
 * then denied rules (always inverted), each group by capability id.
 */
export class Migration20260921000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table user_permission_rules (
      user_id varchar(64) not null references users(id) on delete cascade,
      position integer not null,
      source varchar(16) not null,
      role_id varchar(64) null references roles(id) on delete cascade,
      capability_id varchar(64) not null references capabilities(id) on delete cascade,
      subject varchar(128) not null,
      action varchar(64) not null,
      conditions text null,
      fields text null,
      inverted boolean not null,
      reason text null,
      primary key (user_id, position)
    );`);
    this.addSql(
      'create index user_permission_rules_role_id_index on user_permission_rules (role_id);',
    );
    this.addSql(
      'create index user_permission_rules_capability_id_index on user_permission_rules (capability_id);',
    );

    this.addSql(`insert into user_permission_rules
      (user_id, position, source, role_id, capability_id, subject, action, conditions, fields, inverted, reason)
    select user_id,
           row_number() over (partition by user_id order by grp, role_key, capability_id),
           source, role_id, capability_id, subject, action, conditions, fields, inverted, reason
    from (
      select ur.user_id, 0 as grp, ur.role_id as role_key, 'role' as source, ur.role_id,
             c.id as capability_id, c.subject, c.action, c.conditions, c.fields, c.inverted, c.reason
        from user_roles ur
        join role_capabilities rc on rc.role_id = ur.role_id
        join capabilities c on c.id = rc.capability_id
      union all
      select uac.user_id, 1, '', 'additional', null,
             c.id, c.subject, c.action, c.conditions, c.fields, c.inverted, c.reason
        from user_additional_capabilities uac
        join capabilities c on c.id = uac.capability_id
      union all
      select udc.user_id, 2, '', 'denied', null,
             c.id, c.subject, c.action, c.conditions, c.fields, true, c.reason
        from user_denied_capabilities udc
        join capabilities c on c.id = udc.capability_id
    ) s;`);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists user_permission_rules;');
  }
}
