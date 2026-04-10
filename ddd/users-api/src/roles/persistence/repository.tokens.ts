export const COMMAND_REPOSITORY = {
  createRole: Symbol('createRole'),
  updateRole: Symbol('updateRole'),
  deleteRole: Symbol('deleteRole'),
} as const;

export const QUERY_REPOSITORY = {
  getRole: Symbol('getRole'),
  getRoles: Symbol('getRoles'),
  getRolesCapabilities: Symbol('getRolesCapabilities'),
} as const;
