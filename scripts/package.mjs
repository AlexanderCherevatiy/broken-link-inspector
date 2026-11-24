import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
const output = resolve(root, 'release');
await mkdir(output, { recursive: true });

const hashes = [];
for (const [browser, suffix] of [['edge', 'zip'], ['firefox', 'xpi']]) {
  const build = resolve(root, 'dist', browser);
  const filename = `broken-link-inspector-${version}-${browser}.${suffix}`;
  const target = resolve(output, filename);
  const manifest = JSON.parse(await readFile(resolve(build, 'manifest.json'), 'utf8'));
  if (manifest.version !== version || manifest.manifest_version !== 3) throw new Error('Build version mismatch: ' + browser);
  await rm(target, { force: true });
  const entries = (await readdir(build)).filter((entry) => !entry.startsWith('.')).sort();
  const zip = spawnSync('zip', ['-q', '-r', '-X', target, ...entries, '-x', '*/.DS_Store'], { cwd: build, stdio: 'inherit' });
  if (zip.status !== 0) throw zip.error ?? new Error('zip failed for ' + browser);
  hashes.push(createHash('sha256').update(await readFile(target)).digest('hex') + '  ' + filename);
}
const sourceName = `broken-link-inspector-${version}-source.zip`;
const sourceTarget = resolve(output, sourceName);
await rm(sourceTarget, { force: true });
const sourceFiles = [
  '.github', '.gitignore', '_locales', 'fixtures', 'public', 'scripts', 'src', 'store-assets',
  'store-listings', 'tests', 'BUILD.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE', 'LOCALIZATION.md',
  'PRIVACY.md', 'README.md', 'README.ru.md', 'RELEASE.md', 'RELEASE-QA.md', 'THIRD_PARTY_NOTICES.txt',
  'package.json', 'package-lock.json', 'popup.html', 'report.html', 'tsconfig.json', 'vite.config.ts',
];
await Promise.all(sourceFiles.map((entry) => access(resolve(root, entry))));
const sourceZip = spawnSync('zip', ['-q', '-r', '-X', sourceTarget, ...sourceFiles.sort(),
  '-x', '*/.DS_Store'], { cwd: root, stdio: 'inherit' });
if (sourceZip.status !== 0) throw sourceZip.error ?? new Error('Source zip failed');
hashes.push(createHash('sha256').update(await readFile(sourceTarget)).digest('hex') + '  ' + sourceName);

await writeFile(resolve(output, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
