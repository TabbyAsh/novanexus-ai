/**
 * SMITH OUTPUT PARSER — the fix for the real defect found under a live mind:
 * LLMs emit multiline code that is not valid JSON, so the strict-JSON contract
 * failed every iteration. These tests lock the fenced-block extraction.
 */
import { parseSmithOutput } from '../smith';

describe('parseSmithOutput', () => {
  test('extracts labeled SOLUTION/TEST fenced blocks with multiline code', () => {
    const raw = [
      '===SOLUTION===',
      '```js',
      'function f(n){',
      '  return n + 1;',
      '}',
      'module.exports = { f };',
      '```',
      '===TEST===',
      '```js',
      "const { f } = require('./solution');",
      'if (f(1) !== 2) process.exit(1);',
      'console.log("ok");',
      '```',
    ].join('\n');
    const out = parseSmithOutput(raw)!;
    expect(out).not.toBeNull();
    expect(out.solution).toContain('return n + 1;');
    expect(out.test).toContain("require('./solution')");
  });

  test('falls back to two bare fenced blocks in order', () => {
    const raw = '```js\nmodule.exports={a:1};\n```\nand the test:\n```js\nrequire("./solution");\n```';
    const out = parseSmithOutput(raw)!;
    expect(out.solution).toContain('module.exports');
    expect(out.test).toContain('require');
  });

  test('still accepts legacy strict JSON', () => {
    const raw = JSON.stringify({ solution: 'module.exports={};', test: 'process.exit(0)' });
    const out = parseSmithOutput(raw)!;
    expect(out.solution).toBe('module.exports={};');
  });

  test('returns null (honest give-up) when no code is present', () => {
    expect(parseSmithOutput('I cannot help with that.')).toBeNull();
  });
});
