// Writes sites/landing/email-check.js from packages/contracts/src/email-check.ts: the same check, without the types, for the landing
// pages, which have no build. Run it from the repository root after changing the TypeScript, then run prettier on the result:
//   node sites/make-email-check.mjs && npx prettier --write sites/landing/email-check.js
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('packages/contracts/src/email-check.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
});
const body = outputText
  .replace(/^\/\*\*[\s\S]*?\*\/\n/, '')
  .replace('export function checkEmail', 'function checkEmail');
writeFileSync(
  'sites/landing/email-check.js',
  `// Made by sites/make-email-check.mjs from packages/contracts/src/email-check.ts: change that, not this. A test there runs the same
// addresses through both. Sets window.checkEmail(text), which answers
// {kind: 'ok'} | {kind: 'suggest', suggestion} | {kind: 'impossible', suggestion?}.
${body}\nwindow.checkEmail = checkEmail;\n`,
);
