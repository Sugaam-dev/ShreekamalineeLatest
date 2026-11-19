import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { PostgreSQLDatabase } from '../lib/postgres.ts';
import { loadRuntimeEnv } from './runtime-env.mjs';

loadRuntimeEnv();
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for the test database.');
const pool = new Pool({ connectionString:process.env.DATABASE_URL, max:1 });
const db = new PostgreSQLDatabase(pool);
try {
  await pool.query('CREATE TEMP TABLE vps_adapter_fixture (id TEXT PRIMARY KEY, value TEXT)');
  const inserted = await db.prepare('INSERT INTO vps_adapter_fixture(id,value) VALUES (?,?)').bind('one', "Saree's ? details").run();
  assert.equal(inserted.meta.changes, 1);
  const literal = await db.prepare("SELECT '?'::text AS literal, ?::text AS value, $$?$$::text AS dollar /* ? */").bind("Saree's ? details").first();
  assert.deepEqual(literal, {literal:'?',value:"Saree's ? details",dollar:'?'});
  assert.equal((await db.prepare('SELECT value FROM vps_adapter_fixture WHERE id=$1').bind('one').first()).value, "Saree's ? details");
  await assert.rejects(db.batch([
    db.prepare('INSERT INTO vps_adapter_fixture(id,value) VALUES (?,?)').bind('two','must roll back'),
    db.prepare('INSERT INTO vps_adapter_fixture(id,value) VALUES (?,?)').bind('one','duplicate'),
  ]), error=>error.code==='23505');
  assert.equal(await db.prepare('SELECT id FROM vps_adapter_fixture WHERE id=?').bind('two').first(), null);
  const committed = await db.batch([
    db.prepare('UPDATE vps_adapter_fixture SET value=? WHERE id=?').bind('updated','one'),
    db.prepare('SELECT value FROM vps_adapter_fixture WHERE id=?').bind('one'),
  ]);
  assert.equal(committed[0].meta.changes,1);
  assert.equal(committed[1].meta.changes,0);
  assert.equal(committed[1].results[0].value,'updated');
  assert.throws(()=>db.prepare('SELECT ?').bind(),/parameter count/);
  console.log('PASS: PostgreSQL parameters, quoted literals, native placeholders, result counts, atomic batch rollback and commit. Only a temporary test table was used.');
} finally { await pool.end(); }
