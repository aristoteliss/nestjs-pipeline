/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Mutate,
  RootEntity,
  type RootEntitySnapshot,
} from '@nestjs-pipeline/ddd-core/domain';
import { UserCreatedEvent } from '../events/user-created.event';
import { UserDeletedEvent } from '../events/user-deleted.event';
import { UserUpdatedEvent } from '../events/user-updated.event';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
} from './errors';

export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
  readonly department?: string | null;
}

const USERNAME_MIN_LENGTH = 3;
const DEPARTMENT_MIN_LENGTH = 3;

export class User extends RootEntity<UserSnapshot> {
  public static readonly aggregateName = 'user';

  private _username: string;
  private _department: string | null;
  readonly email: string;

  private constructor(snapshot?: UserSnapshot) {
    super(snapshot);
    if (!snapshot) {
      this._username = '';
      this._department = null;
      this.email = '';
      return;
    }
    this._username = User.normalizeUsername(snapshot.username);
    this._department = User.normalizeDepartment(snapshot.department);
    this.email = snapshot.email;
  }

  static create(
    username: string,
    email: string,
    department?: string | null,
  ): User {
    const user = new User({
      username: User.normalizeUsername(username),
      department: User.normalizeDepartment(department),
      email,
    });

    user.apply(new UserCreatedEvent(user));

    return user;
  }

  static fromJSON(snapshot: UserSnapshot): User {
    return new User({
      id: User.normalizeId(snapshot.id),
      username: User.normalizeUsername(snapshot.username),
      email: snapshot.email,
      department: User.normalizeDepartment(snapshot.department),
      createdAt: User.normalizeDate(snapshot.createdAt),
      updatedAt: User.normalizeDate(snapshot.updatedAt),
      version: snapshot.version ?? 1,
    });
  }

  private static normalizeUsername(username: string): string {
    const trimmed = username?.trim();
    if (!trimmed || trimmed.length < USERNAME_MIN_LENGTH) {
      throw new InvalidUsernameException(USERNAME_MIN_LENGTH, username);
    }
    return trimmed;
  }

  private static normalizeDepartment(
    department?: string | null,
  ): string | null {
    if (department === null || department === undefined) {
      return null;
    }
    const trimmed = department.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length < DEPARTMENT_MIN_LENGTH) {
      throw new InvalidDepartmentException(DEPARTMENT_MIN_LENGTH, department);
    }
    return trimmed;
  }

  get username(): string {
    return this._username;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * @deprecated Direct mutation via setter is prohibited. Mutate aggregate state exclusively via domain methods/factories.
   */
  set username(value: string) {
    this._username = User.normalizeUsername(value);
  }

  get department(): string | null {
    return this._department;
  }

  /**
   * @internal For MikroORM persistence hydration only.
   * @deprecated Direct mutation via setter is prohibited. Mutate aggregate state exclusively via domain methods/factories.
   */
  set department(value: string | null) {
    this._department = User.normalizeDepartment(value);
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
  update(fields: {
    username?: string | null;
    department?: string | null;
  }): this {
    if (fields.username === undefined && fields.department === undefined) {
      throw new EmptyUserUpdateException();
    }
    const nextUsername =
      fields.username !== undefined && fields.username !== null
        ? User.normalizeUsername(fields.username)
        : undefined;

    const nextDepartment =
      fields.department !== undefined
        ? User.normalizeDepartment(fields.department)
        : undefined;

    if (nextUsername !== undefined) {
      this._username = nextUsername;
    }
    if (nextDepartment !== undefined) {
      this._department = nextDepartment;
    }
    this.apply(new UserUpdatedEvent(this));
    return this;
  }

  @Mutate()
  delete(): this {
    this.apply(new UserDeletedEvent(this));
    return this;
  }

  toJSON(): RootEntitySnapshot & UserSnapshot {
    return this.freezeState({
      id: this.id,
      username: this._username,
      department: this._department,
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
    });
  }

  afterUpdate(): void {}
}
