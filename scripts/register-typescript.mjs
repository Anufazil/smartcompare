// Optional in-process TS loader for environments where child-process pipes are unavailable.
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (context.parentURL && (specifier.startsWith('.') || specifier.startsWith('/'))) {
        const base = new URL(specifier, context.parentURL);
        for (const suffix of ['.ts', '.tsx', '/index.ts']) {
          const url = base.href + suffix;
          if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
        }
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (/\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});
