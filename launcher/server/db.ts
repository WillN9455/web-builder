// SQLite schema for the Idea Hub launcher.
//
// Mirrors the v5 data model in launcher/design/plan.md. Tables are intentionally
// small and explicit; migrations run idempotently on every boot so the dev DB is
// always in sync with the code.

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// data/launcher.db — gitignored, regenerated via `npm run db:reset`.
const DB_PATH = resolve(__dirname, '..', 'data', 'launcher.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// The two tables whose CHECK constraints name the stage list are pulled out
// as standalone DDL so migrate() can rebuild a table whose on-disk definition
// predates a stage-key addition (SQLite can't ALTER a CHECK constraint).
const PROJECT_TABLE_DDL = `CREATE TABLE IF NOT EXISTS project (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  slug            TEXT    NOT NULL UNIQUE,
  one_liner       TEXT    NOT NULL,
  category        TEXT    NOT NULL DEFAULT 'Maintenance',
  folder_path     TEXT    NOT NULL,
  current_stage   TEXT    NOT NULL CHECK (current_stage IN
                    ('Intake','Requirements','PRD','Design','Build','Review','QA','Shipped')),
  status          TEXT    NOT NULL CHECK (status IN
                    ('queued','active','review','blocked','done','shipped')),
  priority        TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN
                    ('high','medium','low')),
  tasks_total     INTEGER NOT NULL DEFAULT 0,
  tasks_done      INTEGER NOT NULL DEFAULT 0,
  chats_count     INTEGER NOT NULL DEFAULT 0,
  tile_color      TEXT    NOT NULL DEFAULT 'peach' CHECK (tile_color IN
                    ('peach','sky','mint','lavender','butter','blush')),
  updated_relative TEXT   NOT NULL DEFAULT 'just now',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
)`;

const STAGE_TABLE_DDL = `CREATE TABLE IF NOT EXISTS stage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  stage_key    TEXT    NOT NULL CHECK (stage_key IN
                 ('Intake','Requirements','PRD','Design','Build','Review','QA','Shipped')),
  status       TEXT    NOT NULL CHECK (status IN
                 ('queued','active','review','blocked','done','shipped')),
  started_at   TEXT,
  completed_at TEXT,
  meta         TEXT    NOT NULL DEFAULT '{}'  -- JSON
)`;

const SCHEMA = `
${PROJECT_TABLE_DDL};

${STAGE_TABLE_DDL};

CREATE TABLE IF NOT EXISTS artifact (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  stage_key   TEXT    NOT NULL,
  label       TEXT    NOT NULL,
  path        TEXT    NOT NULL,
  kind        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  agent      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  kind       TEXT    NOT NULL,
  ts         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jira_link (
  project_id      INTEGER PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  jira_project_key TEXT NOT NULL,
  jira_base_url    TEXT NOT NULL,
  last_synced_at   TEXT
);

CREATE TABLE IF NOT EXISTS kanban_card (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  ticket_key      TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  column          TEXT    NOT NULL CHECK (column IN
                    ('todo','inprogress','inreview','done')),
  priority        TEXT    NOT NULL CHECK (priority IN ('high','med','low')),
  points          INTEGER NOT NULL DEFAULT 0,
  assignee_agent  TEXT    NOT NULL,
  status          TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_project_updated  ON project(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_project    ON stage(project_id);
CREATE INDEX IF NOT EXISTS idx_kanban_project   ON kanban_card(project_id);
`;

export function migrate(): void {
  migrateSchema(db);
}

/**
 * Idempotent schema bring-up: run the CREATE-if-missing schema, then rebuild
 * any table whose on-disk CHECK constraints predate a stage-key addition.
 *
 * Root cause this fixes: a launcher.db created before 'Requirements' was added
 * to the stage list kept its old CHECK forever (CREATE TABLE IF NOT EXISTS is
 * a no-op on an existing table), so the intake→capture rename failed at boot
 * of every chat with
 *   CHECK constraint failed: current_stage IN ('Intake','PRD','Design','Build','Review','QA','Shipped')
 * SQLite cannot ALTER a CHECK constraint, so the refresh is the standard
 * copy-drop-rename recipe inside a transaction with foreign keys off (both
 * tables are parents/children of each other via stage.project_id).
 */
export function migrateSchema(target: Database.Database): void {
  target.exec(SCHEMA);
  for (const [name, ddl] of [
    ['project', PROJECT_TABLE_DDL],
    ['stage', STAGE_TABLE_DDL],
  ] as const) {
    const row = target
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) as { sql: string | null } | undefined;
    if (!row?.sql || row.sql.includes("'Requirements'")) continue;
    // Stored definition is stale (pre-'Requirements'). Rebuild it from the
    // current DDL, preserving every row. AUTOINCREMENT ids survive: the
    // INSERT ... SELECT carries the explicit ids, which advances
    // sqlite_sequence to match.
    const tempName = `${name}__migrate`;
    const createTemp = ddl.replace(/^CREATE TABLE IF NOT EXISTS \w+ /, `CREATE TABLE ${tempName} `);
    const fkWasOn = (target.pragma('foreign_keys', { simple: true }) as number) === 1;
    target.pragma('foreign_keys = OFF');
    target.transaction(() => {
      target.exec(createTemp);
      target.exec(`INSERT INTO ${tempName} SELECT * FROM ${name}`);
      target.exec(`DROP TABLE ${name}`);
      target.exec(`ALTER TABLE ${tempName} RENAME TO ${name}`);
    })();
    target.pragma(`foreign_keys = ${fkWasOn ? 'ON' : 'OFF'}`);
    console.warn(
      `[db] rebuilt ${name} table: on-disk CHECK predated the 'Requirements' stage key — migrated in place`,
    );
  }
}
