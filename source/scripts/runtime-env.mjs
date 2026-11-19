import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function loadRuntimeEnv(root = process.cwd()) {
  for (const name of ['.env.production', '.env']) {
    const filename = path.resolve(root, name);
    if (existsSync(filename)) loadEnvFile(filename);
  }
}
