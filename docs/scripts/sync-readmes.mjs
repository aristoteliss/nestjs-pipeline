/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Copies the repository's README files and changelog into the site's content
 * collection, so the guides have one source. Each page gets frontmatter from
 * its first heading and its package description, loses the heading Starlight
 * renders itself, and has its links between README files turned into links
 * between pages. Links to anything else point to the file on GitHub.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const content = resolve(import.meta.dirname, '../src/content/docs');
const base = '/nestjs-pipeline';
const repository = 'https://github.com/aristoteliss/nestjs-pipeline';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Published packages by directory name, with the page each README becomes. */
const packages = new Map(
  readdirSync(resolve(root, 'packages'))
    .filter((dir) => existsSync(resolve(root, 'packages', dir, 'package.json')))
    .map((dir) => {
      const manifest = readJson(resolve(root, 'packages', dir, 'package.json'));
      return [
        dir,
        {
          name: manifest.name,
          description: manifest.description,
          slug: `packages/${manifest.name.slice(1)}`,
        },
      ];
    }),
);

const page = (slug, anchor = '') => `${base}/${slug}/${anchor}`;

/** The site page or GitHub URL a link in `source` (repository-relative) points to. */
function target(href, source) {
  const [path, hash] = href.split('#');
  const anchor = hash && hash !== 'readme' ? `#${hash}` : '';
  if (path.startsWith(repository)) {
    const rest = path
      .slice(repository.length)
      .replace(/^\/(tree|blob)\/master/, '');
    return local(rest.replace(/^\//, ''), anchor) ?? href;
  }
  if (/^[a-z]+:/.test(path) || path === '') return href;
  const resolved = posix.normalize(posix.join(posix.dirname(source), path));
  return local(resolved, anchor) ?? github(resolved, anchor);
}

/** The page for a repository path that a page renders, if one does. */
function local(path, anchor) {
  const clean = path.replace(/\/$/, '').replace(/\/README\.md$/, '');
  if (clean === '' || clean === 'README.md') return page('overview', anchor);
  if (clean === 'CHANGELOG.md') return page('changelog', anchor);
  const match = /^packages\/([^/]+)$/.exec(clean);
  const entry = match && packages.get(match[1]);
  return entry ? page(entry.slug, anchor) : undefined;
}

function github(path, anchor) {
  const full = resolve(root, path);
  const kind =
    existsSync(full) && statSync(full).isDirectory() ? 'tree' : 'blob';
  return `${repository}/${kind}/master/${path}${anchor}`;
}

/** Rewrites the Markdown links outside code blocks and inline code. */
function rewriteLinks(markdown, source) {
  let fenced = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((part, index) =>
          index % 2 === 1
            ? part
            : part.replace(
                /\]\(([^)\s]+)\)/g,
                (_, href) => `](${target(href, source)})`,
              ),
        )
        .join('');
    })
    .join('\n');
}

/** Frontmatter from the first heading, which is then removed. */
function toPage(markdown, source, description) {
  const heading = /^# (.+)$/m.exec(markdown);
  if (!heading)
    throw new Error(`${source}: no level-one heading to title the page`);
  const body = markdown.replace(heading[0], '').replace(/^\s+/, '');
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(heading[1].trim())}`,
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    'editUrl: false',
    '---',
    '',
  ].join('\n');
  return frontmatter + rewriteLinks(body, source);
}

function write(slug, markdown) {
  const file = join(content, `${slug}.md`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, markdown);
}

rmSync(join(content, 'packages'), { recursive: true, force: true });

const rootManifest = readJson(resolve(root, 'package.json'));
write(
  'overview',
  toPage(
    readFileSync(resolve(root, 'README.md'), 'utf8'),
    'README.md',
    rootManifest.description,
  ),
);
write(
  'changelog',
  toPage(readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8'), 'CHANGELOG.md'),
);
for (const [dir, entry] of packages) {
  const source = `packages/${dir}/README.md`;
  write(
    entry.slug,
    toPage(
      readFileSync(resolve(root, source), 'utf8'),
      source,
      entry.description,
    ),
  );
}

console.log(
  `Synced ${packages.size + 2} pages into ${relative(root, content)}`,
);
