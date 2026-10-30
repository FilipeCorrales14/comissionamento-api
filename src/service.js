import { flattenItems } from './templates.js';
import { applyInspection, blockers, progress } from './rules.js';

export class NotFound extends Error {}
export class Conflict extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

export class Commissioning {
  constructor(db, templates, { now = () => new Date().toISOString() } = {}) {
    this.db = db;
    this.templates = templates;
    this.now = now;
  }

  listTemplates() {
    return [...this.templates.values()].map((t) => ({
      key: t.key,
      name: t.name,
      items: flattenItems(t).length,
    }));
  }

  createProject({ name, client, site = null }) {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO projects (name, client, site) VALUES (?, ?, ?)')
      .run(name, client, site);
    return this.getProject(Number(lastInsertRowid));
  }

  listProjects() {
    return this.db.prepare('SELECT * FROM projects ORDER BY id DESC').all().map((p) => ({
      ...p,
      progress: progress(this.projectItems(p.id)),
    }));
  }

  getProject(id) {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) throw new NotFound(`projeto ${id} não encontrado`);
    const systems = this.db.prepare('SELECT * FROM systems WHERE project_id = ? ORDER BY id').all(id);
    return {
      ...project,
      progress: progress(this.projectItems(id)),
      systems: systems.map((s) => ({ ...s, progress: progress(this.systemItems(s.id)) })),
    };
  }

  addSystem(projectId, { template: key, label }) {
    const project = this.getProject(projectId);
    this.assertOpen(project);
    const template = this.templates.get(key);
    if (!template) throw new NotFound(`modelo "${key}" não existe`);

    const insertItem = this.db.prepare(`
      INSERT INTO items (system_id, code, section, description, evidence_required, position)
      VALUES (?, ?, ?, ?, ?, ?)`);

    this.db.exec('BEGIN');
    try {
      const { lastInsertRowid } = this.db
        .prepare('INSERT INTO systems (project_id, template, label) VALUES (?, ?, ?)')
        .run(projectId, key, label ?? template.name);
      const systemId = Number(lastInsertRowid);
      for (const item of flattenItems(template)) {
        insertItem.run(systemId, item.code, item.section, item.description, item.evidenceRequired ? 1 : 0, item.position);
      }
      this.db.exec('COMMIT');
      return { id: systemId, project_id: projectId, template: key, label: label ?? template.name };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  systemItems(systemId, status) {
    const sql = `SELECT * FROM items WHERE system_id = ? ${status ? 'AND status = ?' : ''} ORDER BY position`;
    const params = status ? [systemId, status] : [systemId];
    return this.db.prepare(sql).all(...params).map(toItem);
  }

  projectItems(projectId) {
    return this.db
      .prepare(`
        SELECT i.*, s.label AS system_label
          FROM items i JOIN systems s ON s.id = i.system_id
         WHERE s.project_id = ?
         ORDER BY s.id, i.position`)
      .all(projectId)
      .map(toItem);
  }

  getItem(id) {
    const row = this.db
      .prepare(`
        SELECT i.*, s.label AS system_label, s.project_id, p.status AS project_status
          FROM items i
          JOIN systems s ON s.id = i.system_id
          JOIN projects p ON p.id = s.project_id
         WHERE i.id = ?`)
      .get(id);
    if (!row) throw new NotFound(`item ${id} não encontrado`);
    return { ...toItem(row), projectId: row.project_id, projectStatus: row.project_status };
  }

  inspect(itemId, change) {
    const item = this.getItem(itemId);
    if (item.projectStatus === 'concluido') {
      throw new Conflict('projeto concluído não aceita novas inspeções');
    }

    const next = applyInspection(item, change);
    const at = this.now();
    const evidenceJson = JSON.stringify(next.evidence);

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('UPDATE items SET status = ?, note = ?, evidence = ?, inspector = ?, inspected_at = ? WHERE id = ?')
        .run(next.status, next.note, evidenceJson, next.inspector, at, itemId);
      this.db
        .prepare('INSERT INTO item_history (item_id, status, note, evidence, inspector, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(itemId, next.status, next.note, evidenceJson, next.inspector, at);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return this.getItem(itemId);
  }

  history(itemId) {
    this.getItem(itemId);
    return this.db
      .prepare('SELECT status, note, evidence, inspector, created_at FROM item_history WHERE item_id = ? ORDER BY id')
      .all(itemId)
      .map((h) => ({ ...h, evidence: JSON.parse(h.evidence) }));
  }

  conclude(projectId) {
    const project = this.getProject(projectId);
    this.assertOpen(project);
    const items = this.projectItems(projectId);
    if (items.length === 0) throw new Conflict('projeto sem sistemas cadastrados');

    const pending = blockers(items);
    if (pending.length > 0) {
      throw new Conflict(`${pending.length} item(ns) impedem a conclusão`, { blockers: pending });
    }

    this.db
      .prepare("UPDATE projects SET status = 'concluido', concluded_at = ? WHERE id = ?")
      .run(this.now(), projectId);
    return this.getProject(projectId);
  }

  assertOpen(project) {
    if (project.status === 'concluido') throw new Conflict('projeto já concluído');
  }
}

function toItem(row) {
  return {
    id: row.id,
    systemId: row.system_id,
    systemLabel: row.system_label,
    code: row.code,
    section: row.section,
    description: row.description,
    evidenceRequired: row.evidence_required === 1,
    status: row.status,
    note: row.note,
    evidence: JSON.parse(row.evidence),
    inspector: row.inspector,
    inspectedAt: row.inspected_at,
  };
}
