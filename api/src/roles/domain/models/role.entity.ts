/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ApplyMutation,
  Mutable,
  RootEntity,
  type RootEntitySnapshot,
  textRule,
} from '@cqrs-ddd/core/domain';
import { RoleCreatedEvent } from '../events/role-created.event.js';
import { RoleDeletedEvent } from '../events/role-deleted.event.js';
import { RoleUpdatedEvent } from '../events/role-updated.event.js';
import { InvalidRoleNameException } from './errors/role-name.exception.js';

export interface RoleSnapshot extends Partial<RootEntitySnapshot> {
  readonly name: string;
}

export class Role extends RootEntity<RoleSnapshot> {
  public static readonly aggregateName = 'role';
  public static readonly rules = {
    name: textRule({
      field: 'name',
      minLength: 3,
      maxLength: 128,
      error: (violation) => new InvalidRoleNameException(violation),
    }),
  } as const;

  @Mutable<string>({ normalize: (value) => Role.rules.name.parse(value) })
  private _name: string;

  private constructor(snapshot?: RoleSnapshot) {
    super(snapshot);
    if (!snapshot) {
      this._name = '';
      return;
    }
    this._name = Role.rules.name.parse(snapshot.name);
  }

  static create(name: string): Role {
    const role = new Role({ name });

    role.apply(new RoleCreatedEvent(role));

    return role;
  }

  static fromJSON(snapshot: RoleSnapshot): Role {
    return new Role({
      id: Role.normalizeId(snapshot.id),
      name: Role.rules.name.parse(snapshot.name),
      createdAt: Role.normalizeDate(snapshot.createdAt),
      updatedAt: Role.normalizeDate(snapshot.updatedAt),
      version: snapshot.version ?? 1,
    });
  }

  get name(): string {
    return this._name;
  }

  private set name(value: string) {
    this._name = Role.rules.name.parse(value);
  }

  @ApplyMutation<Role>({ event: (role) => new RoleUpdatedEvent(role) })
  rename(name: string): this {
    this.applyPatch({ name });
    return this;
  }

  @ApplyMutation<Role>({ event: (role) => new RoleDeletedEvent(role) })
  delete(): this {
    return this;
  }

  toJSON(): RootEntitySnapshot & RoleSnapshot {
    return this.freezeState({
      id: this.id,
      name: this._name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    });
  }
}
