import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTemplates, validateTemplate, flattenItems } from '../src/templates.js';

test('todos os modelos do repositório são válidos', () => {
  const templates = loadTemplates();
  assert.ok(templates.size >= 3);
});

test('rejeita código repetido', () => {
  const t = {
    key: 'x',
    name: 'X',
    sections: [{ name: 'S', items: [{ code: 'A', description: 'a' }, { code: 'A', description: 'b' }] }],
  };
  assert.throws(() => validateTemplate(t), /repetido/);
});

test('flattenItems mantém a ordem das seções', () => {
  const t = {
    key: 'x',
    name: 'X',
    sections: [
      { name: 'S1', items: [{ code: 'A', description: 'a', evidence: true }] },
      { name: 'S2', items: [{ code: 'B', description: 'b' }] },
    ],
  };
  const items = flattenItems(t);
  assert.deepEqual(items.map((i) => [i.code, i.section, i.evidenceRequired]), [
    ['A', 'S1', true],
    ['B', 'S2', false],
  ]);
  assert.ok(items[0].position < items[1].position);
});
