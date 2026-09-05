import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const stages = [
  ['Workspace build (including Users API TypeScript checks)', 'test:build'],
  ['Package and Users API unit/integration tests', 'test:unit'],
  ['Users API E2E with real Redis (requires Docker)', 'test:e2e'],
];
const results = [];

for (const [label, script] of stages) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync('pnpm', ['run', script], {
    cwd: root,
    stdio: 'inherit',
  });

  // Respect interruption instead of starting another stage after Ctrl-C.
  if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
    process.exit(result.signal === 'SIGINT' ? 130 : 143);
  }
  if (result.error) console.error(result.error.message);
  results.push({ label, passed: !result.error && result.status === 0 });
}

console.log('\n=== Test suite results ===');
for (const { label, passed } of results) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
}
process.exitCode = results.every(({ passed }) => passed) ? 0 : 1;
