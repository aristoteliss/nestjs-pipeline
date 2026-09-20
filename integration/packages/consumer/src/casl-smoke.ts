import 'reflect-metadata';
import {
  buildAbility,
  CaslAuthorizer,
  parseCapabilityString,
  serializeCapability,
  UnauthorizedActionException,
} from '@nestjs-pipeline/casl';

const ability = buildAbility(
  [
    'Post|read|*',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: interpolation pattern
    'Post|update|{"authorId":"${user.id}"}',
    '!Post|read|*|draftNotes',
  ],
  { id: 'author-2' },
);
const authorizer = new CaslAuthorizer(ability);
const own = { __caslSubjectType__: 'Post', id: 'p-1', authorId: 'author-2' };
const foreign = { __caslSubjectType__: 'Post', id: 'p-2', authorId: 'other' };

if (!authorizer.can('read', 'Post') || authorizer.can('delete', 'Post')) {
  throw new Error('CaslAuthorizer.can check failed');
}

authorizer.authorize('update', own);
let denied = false;
try {
  authorizer.authorize('update', foreign);
} catch (error) {
  denied = error instanceof UnauthorizedActionException;
}
if (!denied) {
  throw new Error('CaslAuthorizer.authorize did not deny a foreign post');
}

const projected = authorizer.project('read', own, {
  title: 'Hello',
  draftNotes: 'secret',
});
if (projected.title !== 'Hello' || 'draftNotes' in projected) {
  throw new Error('CaslAuthorizer.project did not omit a denied field');
}

const capability = parseCapabilityString(
  '!Post|update|{"status":"draft"}|title,body|locked',
);
const delimited = { ...capability, conditions: { status: 'a|b' } };
if (
  JSON.stringify(parseCapabilityString(serializeCapability(capability))) !==
    JSON.stringify(capability) ||
  JSON.stringify(parseCapabilityString(serializeCapability(delimited))) !==
    JSON.stringify(delimited)
) {
  throw new Error('Capability string round trip failed');
}

console.log('CASL smoke contract passed');
