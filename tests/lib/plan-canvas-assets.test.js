/**
 * Tests for Plan Canvas sibling-asset confinement.
 *
 * Regression cover for the symlink escape: lexical containment alone let a
 * link inside the artifact directory serve any file the process could read.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveArtifactAsset } = require('../../scripts/lib/plan-canvas/server');

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    return true;
  } catch (error) {
    console.log(`  FAIL ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-canvas-assets-'));
  const artifactDir = path.join(root, 'artifact');
  const outsideDir = path.join(root, 'outside');
  fs.mkdirSync(artifactDir);
  fs.mkdirSync(outsideDir);
  fs.writeFileSync(path.join(artifactDir, 'style.css'), 'body{}');
  fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'top secret');
  fs.mkdirSync(path.join(artifactDir, 'nested'));
  fs.writeFileSync(path.join(artifactDir, 'nested', 'app.js'), '// app');
  return { root, artifactDir, outsideDir };
}

function runTests() {
  console.log('Testing Plan Canvas asset confinement\n');
  let passed = 0;
  let failed = 0;

  const { root, artifactDir, outsideDir } = makeFixture();

  const check = ok => (ok ? passed++ : failed++);

  check(test('serves a regular file inside the artifact directory', () => {
    const result = resolveArtifactAsset(artifactDir, 'style.css');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(fs.readFileSync(result.filePath, 'utf8'), 'body{}');
  }));

  check(test('serves a nested file inside the artifact directory', () => {
    const result = resolveArtifactAsset(artifactDir, 'nested/app.js');
    assert.strictEqual(result.ok, true);
  }));

  check(test('rejects a lexical parent-directory escape', () => {
    const result = resolveArtifactAsset(artifactDir, '../outside/secret.txt');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 403);
    assert.match(result.error, /escapes artifact directory/);
  }));

  check(test('rejects an absolute path outside the artifact directory', () => {
    const result = resolveArtifactAsset(artifactDir, path.join(outsideDir, 'secret.txt'));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 403);
  }));

  check(test('rejects a symlink pointing at a file outside the artifact directory', () => {
    fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(artifactDir, 'leak.txt'));
    const result = resolveArtifactAsset(artifactDir, 'leak.txt');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 403);
    assert.match(result.error, /escapes artifact directory/);
  }));

  check(test('rejects a symlinked directory used as a path segment', () => {
    fs.symlinkSync(outsideDir, path.join(artifactDir, 'linkdir'));
    const result = resolveArtifactAsset(artifactDir, 'linkdir/secret.txt');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 403);
  }));

  check(test('allows a symlink that stays inside the artifact directory', () => {
    fs.symlinkSync(path.join(artifactDir, 'style.css'), path.join(artifactDir, 'alias.css'));
    const result = resolveArtifactAsset(artifactDir, 'alias.css');
    assert.strictEqual(result.ok, true);
  }));

  check(test('rejects a directory request', () => {
    const result = resolveArtifactAsset(artifactDir, 'nested');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 403);
    assert.match(result.error, /not a regular file/);
  }));

  check(test('reports a missing asset as 404', () => {
    const result = resolveArtifactAsset(artifactDir, 'nope.css');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 404);
  }));

  check(test('reports a missing artifact directory as 404', () => {
    const result = resolveArtifactAsset(path.join(root, 'gone'), 'style.css');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 404);
  }));

  fs.rmSync(root, { recursive: true, force: true });

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
