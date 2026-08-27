/**
 * Every bundled MCP server that is fetched from a registry at launch must name
 * an exact version. `@latest` (or a bare package name, which npx resolves to
 * latest) means an unreviewed upstream release executes on the user's machine.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

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

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

// npx/dlx flags and CLI arguments are not package specs.
function isPackageSpec(arg) {
  return typeof arg === 'string' && !arg.startsWith('-') && !arg.includes('/..') && !arg.startsWith('/');
}

function packageSpecsFor(args) {
  const specs = [];
  for (const arg of args || []) {
    if (!isPackageSpec(arg)) continue;
    specs.push(arg);
    break; // only the first non-flag argument is the package
  }
  return specs;
}

function assertPinned(serverName, spec) {
  assert.ok(!spec.endsWith('@latest'), `${serverName} floats to @latest: ${spec}`);
  // npm pins with `name@version`, PyPI (uvx) with `name==version`.
  const at = spec.lastIndexOf('@');
  const pinned = (at > 0 && /^\d/.test(spec.slice(at + 1))) || /==\d/.test(spec);
  assert.ok(pinned, `${serverName} has no pinned version: ${spec}`);
}

function collectRegistryServers(config) {
  const entries = [];
  for (const [name, server] of Object.entries(config.mcpServers || {})) {
    if (server.command === 'npx' || server.command === 'pnpm' || server.command === 'bunx') {
      entries.push([name, packageSpecsFor(server.args)]);
    } else if (server.command === 'uvx') {
      entries.push([name, packageSpecsFor(server.args)]);
    }
  }
  return entries;
}

function runTests() {
  console.log('Testing MCP package version pinning\n');
  let passed = 0;
  let failed = 0;
  const check = ok => (ok ? passed++ : failed++);

  check(test('default .mcp.json pins every registry-fetched server', () => {
    const entries = collectRegistryServers(readJson('.mcp.json'));
    assert.ok(entries.length > 0, 'expected at least one registry-fetched default server');
    for (const [name, specs] of entries) {
      for (const spec of specs) assertPinned(name, spec);
    }
  }));

  check(test('opt-in mcp-configs/mcp-servers.json pins every registry-fetched server', () => {
    const entries = collectRegistryServers(readJson('mcp-configs/mcp-servers.json'));
    assert.ok(entries.length >= 17, `expected the bundled opt-in servers, found ${entries.length}`);
    for (const [name, specs] of entries) {
      for (const spec of specs) assertPinned(name, spec);
    }
  }));

  check(test('no bundled MCP config mentions @latest at all', () => {
    for (const file of ['.mcp.json', 'mcp-configs/mcp-servers.json']) {
      const raw = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      assert.ok(!raw.includes('@latest'), `${file} still contains @latest`);
    }
  }));

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
