import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIR = fileURLToPath(new URL('../templates', import.meta.url));

// Os checklists ficam em JSON para que um engenheiro possa criar ou ajustar
// um modelo sem mexer no código.
export function loadTemplates(dir = DEFAULT_DIR) {
  const templates = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const template = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    validateTemplate(template, file);
    templates.set(template.key, template);
  }
  return templates;
}

export function validateTemplate(t, source = 'template') {
  if (!t.key || !t.name || !Array.isArray(t.sections)) {
    throw new Error(`${source}: precisa de "key", "name" e "sections"`);
  }
  const codes = new Set();
  for (const section of t.sections) {
    for (const item of section.items ?? []) {
      if (!item.code || !item.description) throw new Error(`${source}: item sem código ou descrição`);
      if (codes.has(item.code)) throw new Error(`${source}: código repetido ${item.code}`);
      codes.add(item.code);
    }
  }
}

export function flattenItems(template) {
  return template.sections.flatMap((section, s) =>
    section.items.map((item, i) => ({
      code: item.code,
      section: section.name,
      description: item.description,
      evidenceRequired: Boolean(item.evidence),
      position: s * 1000 + i,
    })),
  );
}
