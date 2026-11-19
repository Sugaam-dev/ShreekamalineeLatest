import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRuntimeEnv } from './runtime-env.mjs';

const [command, ...args] = process.argv.slice(2);
if (!['dev', 'build', 'start'].includes(command)) throw new Error('Expected dev, build or start.');
loadRuntimeEnv();
const options = command === 'build' ? ['--webpack'] : ['--hostname', process.env.APP_BIND_HOST || '127.0.0.1', '--port', process.env.PORT || '3000'];
const preload = command === 'build' && process.platform === 'win32' ? ['--require', fileURLToPath(new URL('./windows-build-dirs.cjs', import.meta.url))] : [];
const child = spawn(process.execPath, [...preload, fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)), command, ...options, ...args], {
  stdio: 'inherit', windowsHide: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
