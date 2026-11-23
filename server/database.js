import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';

export async function openDatabase(url = process.env.TURSO_DATABASE_URL || 'file:data/work-better.db') {
  if (url.startsWith('file:data/')) mkdirSync('data', { recursive:true });
  const db = createClient({ url, authToken:process.env.TURSO_AUTH_TOKEN || undefined });
  await db.batch([
    `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, timezone TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('daily','once')), start_day TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS completions (workspace_id TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id), day TEXT NOT NULL, PRIMARY KEY (task_id, day))`,
    `CREATE TABLE IF NOT EXISTS pairing_codes (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), expires_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS tasks_workspace ON tasks(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS completions_workspace ON completions(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS pairing_workspace ON pairing_codes(workspace_id)`
  ], 'write');
  return db;
}
