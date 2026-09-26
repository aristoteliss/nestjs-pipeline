/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { InvalidValueException } from '@cqrs-ddd/core/domain';

/** A department breaks `User.rules.department`. */
export class InvalidDepartmentException extends InvalidValueException {}
