import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteEntry = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const playwrightEntry = path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js');

const run = (args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      cwd: projectRoot,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`子进程被信号 ${signal} 终止`));
      } else {
        resolve(code ?? 1);
      }
    });
  });

const isPwa = process.env.PLAYWRIGHT_PWA !== '0';
const testEnv = {
  VITE_API_BASE: '/api-v1/api.php',
  REACT_APP_API_BASE: '',
  ...Object.fromEntries(
    [
      'API_KEY',
      'AUTH_DOMAIN',
      'PROJECT_ID',
      'STORAGE_BUCKET',
      'MESSAGING_SENDER_ID',
      'APP_ID',
      'MEASUREMENT_ID',
    ].flatMap((key) => [
      [`VITE_FIREBASE_${key}`, ''],
      [`REACT_APP_FIREBASE_${key}`, ''],
    ])
  ),
};
// Vite replaces environment variables at build time, so isolate both build and server.
const buildExitCode = await run([viteEntry, 'build'], testEnv);
if (buildExitCode !== 0) process.exit(buildExitCode);

const testExitCode = await run([playwrightEntry, 'test', '--config=playwright.config.mjs'], {
  ...testEnv,
  PLAYWRIGHT_PWA: isPwa ? '1' : '0',
});
process.exit(testExitCode);
