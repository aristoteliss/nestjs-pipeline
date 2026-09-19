/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Mutate,
  RootEntity,
  type RootEntitySnapshot,
} from '@nestjs-pipeline/ddd-core/domain';
import { RoleCreatedEvent } from '../events/role-created.event';
import { RoleDeletedEvent } from '../events/role-deleted.event';
import { RoleUpdatedEvent } from '../events/role-updated.event';
import { InvalidRoleNameException } from './errors/role-name.exception';

export interface RoleSnapshot extends Partial<RootEntitySnapshot> {
  readonly name: string;
}

const ROLE_NAME_MIN_LENGTH = 3;

export class Role extends RootEntity<RoleSnapshot> {
  public static readonly aggregateName = 'role';

  private _name: string;

  private constructor(snapshot?: RoleSnapshot) {
    super(snapshot);
    if (!snapshot) {
      this._name = '';
      return;
    }
    this._name = Role.normalizeName(snapshot.name);
  }

  static create(name: string): Role {
    const role = new Role({
      name: Role.normalizeName(name),
    });

    role.apply(new RoleCreatedEvent(role));

    return role;
  }

  static fromJSON(snapshot: RoleSnapshot): Role {
    return new Role({
      id: Role.normalizeId(snapshot.id),
      name: Role.normalizeName(snapshot.name),
      createdAt: Role.normalizeDate(snapshot.createdAt),
      updatedAt: Role.normalizeDate(snapshot.updatedAt),
      version: snapshot.version ?? 1,
    });
  }

  private static normalizeName(name: string): string {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < ROLE_NAME_MIN_LENGTH) {
      throw new InvalidRoleNameException(
        ROLE_NAME_MIN_LENGTH,
        name,
        `Role name must be at least ${ROLE_NAME_MIN_LENGTH} characters.`,
      );
    }
    return trimmed;
  }

  get name(): string {
    return this._name;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * @deprecated Direct mutation via setter is prohibited. Mutate aggregate state exclusively via domain methods/factories.
   */
  set name(value: string) {
    this._name = Role.normalizeName(value);
  }

  get version(): number {
    return this._version;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * @deprecated Direct mutation via setter is prohibited. Mutate aggregate state exclusively via domain methods/factories.
   */
  set version(value: number) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      this._version = value;
      this._persistedVersion = value;
    }
  }

  @Mutate()
  rename(name: string): this {
    this._name = Role.normalizeName(name);
    this.apply(new RoleUpdatedEvent(this));
    return this;
  }

  @Mutate()
  delete(): this {
    this.apply(new RoleDeletedEvent(this));
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

  afterUpdate(): void {}
}
