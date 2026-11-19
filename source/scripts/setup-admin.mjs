import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { parseEnv } from 'node:util';

function argumentsFor(list) {
  const result = {};
  for (let index = 0; index < list.length; index++) {
    const option = list[index];
    if (!['--env-file', '--origin', '--dry-run'].includes(option) || Object.hasOwn(result, option)) throw new Error('Use --env-file FILE, --origin https://YOUR-DOMAIN and optional --dry-run.');
    if (option === '--dry-run') result[option] = true;
    else {
      const value = list[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing value for ' + option);
      result[option] = value;
    }
  }
  return result;
}

function publicOrigin(value) {
  if (!value) throw new Error('Supply --origin https://YOUR-DOMAIN or APP_ORIGIN in the environment file.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('The admin setup origin must use HTTPS without a path, query or credentials.');
  return url.origin;
}

function setValues(text, values) {
  let result = text;
  for (const [name, value] of Object.entries(values)) {
    const line = name + '=' + JSON.stringify(value);
    const existing = new RegExp('^(?:export\\s+)?' + name + '\\s*=.*$', 'gm');
    if (existing.test(result)) result = result.replace(existing, () => line);
    else result += (result.endsWith('\n') || !result ? '' : '\n') + line + '\n';
  }
  return result;
}

try {
  const args = argumentsFor(process.argv.slice(2));
  const filename = path.resolve(args['--env-file'] || '.env.production');
  let original = '';
  try {
    const info = await fs.lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('The environment file must be a regular file.');
    original = await fs.readFile(filename, 'utf8');
    loadEnvFile(filename);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const fileValues = parseEnv(original);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL in the environment file before creating the admin setup link.');
  const origin = publicOrigin(args['--origin'] || process.env.APP_ORIGIN);
  if (process.env.APP_ORIGIN && publicOrigin(process.env.APP_ORIGIN) !== origin) throw new Error('--origin must match the configured APP_ORIGIN.');
  const existingPepper = process.env.ADMIN_PASSWORD_PEPPER || fileValues.ADMIN_PASSWORD_PEPPER;
  if (existingPepper && existingPepper.length < 32) throw new Error('Existing ADMIN_PASSWORD_PEPPER is invalid; investigate the configuration before proceeding.');
  if (args['--dry-run']) {
    console.log('Dry run: verify the migrated database has no admin; preserve any existing valid pepper; update the protected environment file with a one-hour setup-token hash and expiry. Restart the app, then open the private setup link. No database connection, secrets generated or file changes made.');
  } else {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      const result = await client.query("SELECT id FROM admin_credentials WHERE id = 'owner'");
      if (result.rowCount) throw new Error('An admin already exists. Sign in normally; this helper will not change its password or secrets.');
    } finally { await client.end(); }
    const token = randomBytes(32).toString('base64url');
    const pepper = existingPepper || randomBytes(32).toString('hex');
    const values = {
      APP_ORIGIN: origin,
      ADMIN_PASSWORD_PEPPER: pepper,
      ADMIN_SETUP_TOKEN_HASH: createHash('sha256').update(token).digest('hex'),
      ADMIN_SETUP_EXPIRES_AT: String(Date.now() + 60 * 60 * 1000),
    };
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, setValues(original, values), { flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, filename);
      await fs.chmod(filename, 0o600);
    } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    console.log('Updated the protected environment file. Existing database, image-storage settings and any existing valid pepper were preserved.');
    console.log('Restart the application to load these settings, then open this PRIVATE link within one hour and choose your admin username and password:');
    console.log(origin + '/admin/setup#token=' + token);
    console.log('After admin setup succeeds, remove ADMIN_SETUP_TOKEN_HASH and ADMIN_SETUP_EXPIRES_AT from the environment file and restart. Retain ADMIN_PASSWORD_PEPPER unchanged.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Admin setup preparation failed.');
  process.exitCode = 1;
}
