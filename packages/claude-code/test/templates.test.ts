import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { TEMPLATE_PATHS, readTemplate } from '../src/index.js';

test('templates: all template files exist on disk', () => {
  for (const [key, path] of Object.entries(TEMPLATE_PATHS)) {
    assert.ok(existsSync(path), `missing template ${key}: ${path}`);
  }
});

test('templates: SKILL.md has frontmatter and tool references', () => {
  const skill = readTemplate('skill');
  assert.match(skill, /^---/);
  assert.match(skill, /name: userigor/);
  assert.match(skill, /rigor_recall/);
  assert.match(skill, /rigor_capture/);
});

test('templates: recall slash command has argument hint', () => {
  const cmd = readTemplate('recallCommand');
  assert.match(cmd, /argument-hint/);
  assert.match(cmd, /rigor_recall/);
  assert.match(cmd, /\$ARGUMENTS/);
});

test('templates: hook example uses PostToolUse', () => {
  const hook = readTemplate('hookExample');
  assert.match(hook, /PostToolUse/);
});

test('templates: mcp example registers userigor', () => {
  const mcp = readTemplate('mcpExample');
  assert.match(mcp, /mcpServers/);
  assert.match(mcp, /userigor/);
});
