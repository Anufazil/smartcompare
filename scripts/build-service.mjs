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
const esbuild = require.resolve('esbuild/bin/esbuild');
const argumentsForEsbuild = [
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
];
// esbuild's package entry is a Windows-friendly JS shim on Windows, but a native
// ELF/Mach-O executable on CI and Unix hosts. Node may execute the former only.
const command = process.platform === 'win32' ? process.execPath : esbuild;
const args = process.platform === 'win32' ? [esbuild, ...argumentsForEsbuild] : argumentsForEsbuild;
const result = spawnSync(
  command,
  args,
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
