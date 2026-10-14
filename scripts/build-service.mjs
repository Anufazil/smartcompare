import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const target = process.argv[2];
if (!['api', 'worker'].includes(target)) throw new Error('Choose api or worker');
const filename = target === 'api' ? 'server' : 'index';
const result = spawnSync(
  process.execPath,
  [
    require.resolve('esbuild/bin/esbuild'),
    resolve(root, 'apps', target, 'src', filename + '.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node22',
    '--packages=external',
    '--alias:@smartcompare/shared=' + resolve(root, 'packages/shared/src/index.ts'),
    '--alias:@smartcompare/live=' + resolve(root, 'packages/live/src/index.ts'),
    '--outfile=' + resolve(root, 'apps', target, 'dist', filename + '.js'),
    '--sourcemap',
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
