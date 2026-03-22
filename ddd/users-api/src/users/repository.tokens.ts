export const COMMAND_REPOSITORY = {
  createUser: Symbol('createUser'),
  updateUser: Symbol('updateUser'),
  deleteUser: Symbol('deleteUser'),
} as const;

export const QUERY_REPOSITORY = {
  getUser: Symbol('getUser'),
  getUsers: Symbol('getUsers'),
} as const;
