import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  client       TEXT NOT NULL,
  site         TEXT,
  status       TEXT NOT NULL DEFAULT 'em_andamento',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  concluded_at TEXT
);

CREATE TABLE IF NOT EXISTS systems (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template   TEXT NOT NULL,
  label      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id                INTEGER PRIMARY KEY,
  system_id         INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,
  section           TEXT NOT NULL,
  description       TEXT NOT NULL,
  evidence_required INTEGER NOT NULL,
  position          INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pendente',
  note              TEXT,
  evidence          TEXT NOT NULL DEFAULT '[]',
  inspector         TEXT,
  inspected_at      TEXT
);

-- Cada inspeção vira uma linha aqui. É o que permite mostrar ao cliente
-- que um item foi reprovado, corrigido e aprovado depois.
CREATE TABLE IF NOT EXISTS item_history (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  evidence   TEXT NOT NULL,
  inspector  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_system ON items (system_id);
CREATE INDEX IF NOT EXISTS idx_history_item ON item_history (item_id);
`;

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}
