import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { loadRuntimeEnv } from './runtime-env.mjs';

loadRuntimeEnv();
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running database migrations.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
const client = await pool.connect();
let transaction = false;
try {
  const directory = new URL('../database/', import.meta.url);
  const files = (await readdir(directory)).filter(file => /^\d{3,}[-_].+\.sql$/.test(file)).sort();
  if (!files.length) throw new Error('No PostgreSQL migrations were found.');
  await client.query('BEGIN'); transaction = true;
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await client.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
  const previous = new Map((await client.query('SELECT id, sha256 FROM schema_migrations')).rows.map(row => [row.id, row.sha256]));
  const applied = [];
  const alreadyApplied = [];
  for (const file of files) {
    const sql = await readFile(new URL(file, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (previous.has(file)) {
      if (previous.get(file) !== checksum) throw new Error(`Applied migration changed: ${file}. Restore it and add a new migration.`);
      alreadyApplied.push(file); continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (id, sha256) VALUES ($1, $2)', [file, checksum]);
    applied.push(file);
  }
  await client.query('COMMIT'); transaction = false;
  console.log(JSON.stringify({ success: true, applied, alreadyApplied }));
} catch (error) {
  if (transaction) { try { await client.query('ROLLBACK'); } catch {} }
  console.error('PostgreSQL migration failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
