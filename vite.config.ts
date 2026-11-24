import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const firefox = mode === 'firefox';
  const outDir = resolve(root, firefox ? 'dist/firefox' : 'dist/edge');
  return {
    base: './',
    plugins: [{
      name: 'extension-package',
      apply: 'build',
      closeBundle() {
        cpSync(resolve(root, '_locales'), resolve(outDir, '_locales'), { recursive: true });
        for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
          if (existsSync(resolve(root, file))) cpSync(resolve(root, file), resolve(outDir, file));
        }
        if (firefox) {
          const path = resolve(outDir, 'manifest.json');
          const { minimum_chrome_version: _, ...manifest } = JSON.parse(readFileSync(path, 'utf8'));
          manifest.permissions.push('dns');
          manifest.browser_specific_settings = {
            gecko: {
              id: 'broken-link-inspector@bli.invalid',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
                optional: ['websiteContent', 'bookmarksInfo'],
              },
            },
          };
          writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
        }
      },
    }],
    build: {
      outDir,
      target: firefox ? 'firefox140' : 'chrome154',
      rollupOptions: {
        input: {
          popup: resolve(root, 'popup.html'),
          report: resolve(root, 'report.html'),
        },
      },
    },
  };
});
