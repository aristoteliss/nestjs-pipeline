/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability } from '@cqrs-ddd/pipeline-casl';
import { describe, expect, it, vi } from 'vitest';
import { GetUserPermissionRulesHandler } from './get-user-permission-rules.handler.js';
import { GetUserPermissionRulesQuery } from './get-user-permission-rules.query.js';

describe('GetUserPermissionRulesHandler', () => {
  it('delegates query execution to the query repository', async () => {
    const rules: Capability[] = [
      { subject: 'User', action: 'read' },
      { subject: 'Role', action: 'manage' },
    ];
    const queryRepository = {
      find: vi.fn().mockResolvedValue(rules),
    };
    const handler = new GetUserPermissionRulesHandler(queryRepository as never);

    const query = new GetUserPermissionRulesQuery({ userId: 'user-1' });
    const result = await handler.execute(query);

    expect(queryRepository.find).toHaveBeenCalledWith(query);
    expect(result).toEqual(rules);
  });
});
