import { defineConfig } from 'vitest/config';
import ts from 'typescript';
export default defineConfig({
  plugins: [
    {
      name: 'in-process-typescript',
      enforce: 'pre',
      transform(code, id) {
        if (/\.tsx?$/.test(id) && (!id.includes('node_modules') || id.includes('@smartcompare')))
          return {
            code: ts.transpileModule(code, {
              compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                jsx: ts.JsxEmit.ReactJSX,
              },
            }).outputText,
            map: null,
          };
      },
    },
  ],
  esbuild: false,
  resolve: { preserveSymlinks: true },
  test: {
    include: ['apps/api/tests/**/*.test.ts', 'packages/shared/tests/**/*.test.ts', 'packages/live/tests/**/*.test.ts', 'apps/edge/tests/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    maxWorkers: 2,
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
});
