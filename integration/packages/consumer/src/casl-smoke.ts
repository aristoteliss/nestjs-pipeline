import 'reflect-metadata';
import { buildAbility } from '@nestjs-pipeline/casl';

const adminRole = {
  name: 'admin',
  capabilities: ['all|manage|*'],
};

const authorRole = {
  name: 'author',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: interpolation pattern
  capabilities: ['Post|read|*', 'Post|update|{"authorId":"${id}"}'],
};

const adminAbility = buildAbility([adminRole], { id: 1 });
if (!adminAbility.can('manage', 'all') || !adminAbility.can('read', 'Post')) {
  throw new Error('Admin ability check failed');
}

const authorAbility = buildAbility([authorRole], { id: 2 });
if (!authorAbility.can('read', 'Post')) {
  throw new Error('Author ability read failed');
}
if (
  !authorAbility.can('update', {
    __caslSubjectType__: 'Post',
    authorId: 2,
  } as never)
) {
  throw new Error('Author ability condition check failed');
}
if (
  authorAbility.can('update', {
    __caslSubjectType__: 'Post',
    authorId: 999,
  } as never)
) {
  throw new Error('Author ability condition check leaked');
}

console.log('CASL smoke contract passed');
