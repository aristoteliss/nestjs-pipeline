/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BaseQuery } from '@cqrs-ddd/core/application';
import { createQuery } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class GetUsersQuery extends createQuery(z.object({}), BaseQuery) {}
