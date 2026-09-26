/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { InvalidValueException } from '@cqrs-ddd/core/domain';

/** A username breaks `User.rules.username`. */
export class InvalidUsernameException extends InvalidValueException {}
