-- ============================================================================
-- Demo seed data for CASL relational schema.
--
-- Mirrors the roles from demo-roles.yml. Run after creating the schema
-- (see README § "Suggested relational schema").
--
-- Condition placeholders like ${user.id} are resolved at runtime by
-- interpolateConditions() — store them verbatim.
-- ============================================================================

BEGIN;

-- ── Capabilities ────────────────────────────────────────────────────────────

-- Wildcard / admin
INSERT INTO capabilities (id, subject, action)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'all', 'manage');

-- Post
INSERT INTO capabilities (id, subject, action)
  VALUES ('a0000000-0000-0000-0000-000000000010', 'Post', 'read');
INSERT INTO capabilities (id, subject, action)
  VALUES ('a0000000-0000-0000-0000-000000000011', 'Post', 'create');
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000012', 'Post', 'update',
          '{"authorId":"${user.id}"}');
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000013', 'Post', 'delete',
          '{"authorId":"${user.id}"}');

-- Comment
INSERT INTO capabilities (id, subject, action)
  VALUES ('a0000000-0000-0000-0000-000000000020', 'Comment', 'read');
INSERT INTO capabilities (id, subject, action)
  VALUES ('a0000000-0000-0000-0000-000000000021', 'Comment', 'create');
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000022', 'Comment', 'read',
          '{"tenantId":"${user.tenantId}"}');
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000023', 'Comment', 'delete',
          '{"authorId":"${user.id}","status":"draft"}');

-- User (tenant-scoped)
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000030', 'User', 'manage',
          '{"tenantId":"${user.tenantId}"}');
INSERT INTO capabilities (id, subject, action, conditions, fields)
  VALUES ('a0000000-0000-0000-0000-000000000031', 'User', 'read',
          '{"tenantId":"${user.tenantId}"}', '{id,name,email,role}');
INSERT INTO capabilities (id, subject, action, inverted, reason)
  VALUES ('a0000000-0000-0000-0000-000000000032', 'User', 'update',
          true, 'Auditors have read-only access');
INSERT INTO capabilities (id, subject, action, fields)
  VALUES ('a0000000-0000-0000-0000-000000000033', 'User', 'read',
          '{id,name,email}');

-- Project (tenant-scoped)
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000040', 'Project', 'manage',
          '{"tenantId":"${user.tenantId}"}');
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000041', 'Project', 'read',
          '{"tenantId":"${user.tenantId}"}');
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000042', 'Project', 'update',
          '{"tenantId":"${user.tenantId}","members":{"$elemMatch":{"userId":"${user.id}"}},"status":{"$in":["active","planning"]}}');

-- Invoice (tenant-scoped)
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000050', 'Invoice', 'read',
          '{"tenantId":"${user.tenantId}"}');
INSERT INTO capabilities (id, subject, action, inverted)
  VALUES ('a0000000-0000-0000-0000-000000000051', 'Invoice', 'delete', true);

-- Task (tenant-scoped)
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000060', 'Task', 'manage',
          '{"tenantId":"${user.tenantId}","assigneeId":"${user.id}"}');
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000061', 'Task', 'read',
          '{"tenantId":"${user.tenantId}"}');

-- AuditLog (tenant-scoped)
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000070', 'AuditLog', 'read',
          '{"tenantId":"${user.tenantId}"}');

-- Ticket (department-scoped)
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000080', 'Ticket', 'read',
          '{"department":"${user.department}"}');
INSERT INTO capabilities (id, subject, action, conditions, fields)
  VALUES ('a0000000-0000-0000-0000-000000000081', 'Ticket', 'update',
          '{"department":"${user.department}"}', '{status,assigneeId}');
INSERT INTO capabilities (id, subject, action, inverted)
  VALUES ('a0000000-0000-0000-0000-000000000082', 'Ticket', 'delete', true);

-- Note
INSERT INTO capabilities (id, subject, action)
  VALUES ('a0000000-0000-0000-0000-000000000090', 'Note', 'create');
INSERT INTO capabilities (id, subject, action, conditions)
  VALUES ('a0000000-0000-0000-0000-000000000091', 'Note', 'read',
          '{"department":"${user.department}"}');

-- ── Roles ───────────────────────────────────────────────────────────────────

INSERT INTO roles (id, name) VALUES ('b0000000-0000-0000-0000-000000000001', 'admin');
INSERT INTO roles (id, name) VALUES ('b0000000-0000-0000-0000-000000000002', 'viewer');
INSERT INTO roles (id, name) VALUES ('b0000000-0000-0000-0000-000000000003', 'author');
INSERT INTO roles (id, name) VALUES ('b0000000-0000-0000-0000-000000000004', 'tenant-admin');
INSERT INTO roles (id, name) VALUES ('b0000000-0000-0000-0000-000000000005', 'project-manager');
INSERT INTO roles (id, name) VALUES ('b0000000-0000-0000-0000-000000000006', 'auditor');
INSERT INTO roles (id, name) VALUES ('b0000000-0000-0000-0000-000000000007', 'support-agent');

-- ── Role ↔ Capability assignments ───────────────────────────────────────────

-- admin: full access
INSERT INTO role_capabilities (role_id, capability_id) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

-- viewer: read Post + Comment
INSERT INTO role_capabilities (role_id, capability_id) VALUES
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000020');

-- author: read/create Post, update/delete own Post, read/create Comment
INSERT INTO role_capabilities (role_id, capability_id) VALUES
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000011'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000012'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000013'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000020'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000021');

-- tenant-admin: manage User + Project, read Invoice, !delete Invoice
INSERT INTO role_capabilities (role_id, capability_id) VALUES
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000030'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000040'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000050'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000051');

-- project-manager: read/update Project, manage/read Task, read/create/delete Comment
INSERT INTO role_capabilities (role_id, capability_id) VALUES
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000041'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000042'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000060'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000061'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000022'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000021'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000023');

-- auditor: read User (restricted fields), read Project/Invoice/AuditLog, !update User
INSERT INTO role_capabilities (role_id, capability_id) VALUES
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000031'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000041'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000050'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000070'),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000032');

-- support-agent: read/update Ticket (field-restricted), !delete Ticket, read User (restricted), create/read Note
INSERT INTO role_capabilities (role_id, capability_id) VALUES
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000080'),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000081'),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000082'),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000033'),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000090'),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000091');

-- ── Example users & role assignments ────────────────────────────────────────
-- Assumes a 'users' table already exists. Uncomment and adapt as needed.

-- INSERT INTO users (id, name, email, tenant_id, department) VALUES
--   ('c0000000-0000-0000-0000-000000000001', 'Alice Admin',   'alice@example.com',   'd0000000-0000-0000-0000-000000000001', 'engineering'),
--   ('c0000000-0000-0000-0000-000000000002', 'Bob Author',    'bob@example.com',     'd0000000-0000-0000-0000-000000000001', 'content'),
--   ('c0000000-0000-0000-0000-000000000003', 'Carol Viewer',  'carol@example.com',   'd0000000-0000-0000-0000-000000000001', 'marketing'),
--   ('c0000000-0000-0000-0000-000000000004', 'Dan PM',        'dan@example.com',     'd0000000-0000-0000-0000-000000000001', 'engineering'),
--   ('c0000000-0000-0000-0000-000000000005', 'Eve Auditor',   'eve@example.com',     'd0000000-0000-0000-0000-000000000001', 'compliance'),
--   ('c0000000-0000-0000-0000-000000000006', 'Frank Support', 'frank@example.com',   'd0000000-0000-0000-0000-000000000001', 'support');

-- INSERT INTO user_roles (user_id, role_id) VALUES
--   ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001'), -- Alice → admin
--   ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003'), -- Bob → author
--   ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002'), -- Carol → viewer
--   ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000005'), -- Dan → project-manager
--   ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000006'), -- Eve → auditor
--   ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000007'); -- Frank → support-agent

-- ── Per-user overrides ──────────────────────────────────────────────────────
-- Bob (author) also gets the ability to invite users
-- INSERT INTO user_additional_capabilities (user_id, capability_id)
--   VALUES ('c0000000-0000-0000-0000-000000000002', <invite-capability-id>);

-- Carol (viewer) is explicitly denied from reading drafts
-- INSERT INTO user_denied_capabilities (user_id, capability_id)
--   VALUES ('c0000000-0000-0000-0000-000000000003', <draft-read-capability-id>);

COMMIT;
