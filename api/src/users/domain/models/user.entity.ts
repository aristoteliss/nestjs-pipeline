/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  ApplyMutation,
  Mutable,
  RootEntity,
  type RootEntitySnapshot,
  textRule,
} from '@cqrs-ddd/core/domain';
import { UserCreatedEvent } from '../events/user-created.event.js';
import { UserDeletedEvent } from '../events/user-deleted.event.js';
import { UserUpdatedEvent } from '../events/user-updated.event.js';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
} from './errors/index.js';

export interface UserSnapshot extends Partial<RootEntitySnapshot> {
  readonly username: string;
  readonly email: string;
  readonly department?: string | null;
}

export class User extends RootEntity<UserSnapshot> {
  public static readonly aggregateName = 'user';
  public static readonly rules = {
    username: textRule({
      field: 'username',
      minLength: 3,
      maxLength: 255,
      error: (violation) => new InvalidUsernameException(violation),
    }),
    department: textRule({
      field: 'department',
      required: false,
      minLength: 3,
      maxLength: 255,
      error: (violation) => new InvalidDepartmentException(violation),
    }),
  } as const;

  @Mutable<string>({
    normalize: (value) => User.rules.username.parse(value),
  })
  private _username: string;

  @Mutable<string | null>({
    normalize: (value) => User.rules.department.parse(value),
  })
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
    this._username = User.rules.username.parse(snapshot.username);
    this._department = User.rules.department.parse(snapshot.department);
    this.email = snapshot.email;
  }

  static create(
    username: string,
    email: string,
    department?: string | null,
  ): User {
    const user = new User({ username, department, email });

    user.apply(new UserCreatedEvent(user));

    return user;
  }

  static fromJSON(snapshot: UserSnapshot): User {
    return new User({
      id: User.normalizeId(snapshot.id),
      username: User.rules.username.parse(snapshot.username),
      email: snapshot.email,
      department: User.rules.department.parse(snapshot.department),
      createdAt: User.normalizeDate(snapshot.createdAt),
      updatedAt: User.normalizeDate(snapshot.updatedAt),
      version: snapshot.version ?? 1,
    });
  }

  get username(): string {
    return this._username;
  }

  private set username(value: string) {
    this._username = User.rules.username.parse(value);
  }

  get department(): string | null {
    return this._department;
  }

  private set department(value: string | null) {
    this._department = User.rules.department.parse(value);
  }

  @ApplyMutation<User>({ event: (user) => new UserUpdatedEvent(user) })
  update(fields: {
    username?: string | null;
    department?: string | null;
  }): this {
    if (fields.username === undefined && fields.department === undefined) {
      throw new EmptyUserUpdateException();
    }

    this.applyPatch({
      username: fields.username ?? undefined,
      department: fields.department,
    });
    return this;
  }

  @ApplyMutation<User>({ event: (user) => new UserDeletedEvent(user) })
  delete(): this {
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
}
