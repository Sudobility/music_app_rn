#!/usr/bin/env node
/*
 * Runs the React Native CLI with --port taken from .env (METRO_PORT), so the
 * Metro dev-server port has a single source of truth in .env — the same value
 * the iOS build injects into Info.plist (see the "Inject Metro Dev Server
 * (.env)" Xcode build phase). Usage: node scripts/metro.mjs <rn-command> [args]
 *   e.g. node scripts/metro.mjs start
 *        node scripts/metro.mjs run-ios
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = ['.env', '.env.example'].map((f) => join(root, f)).find(existsSync);
const env = envFile ? readFileSync(envFile, 'utf8') : '';
const read = (key) => {
  const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};

const port = read('METRO_PORT') || '8081';
const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node scripts/metro.mjs <rn-command> [args]');
  process.exit(1);
}

const bin = join(root, 'node_modules', '.bin', 'react-native');
const args = [cmd, '--port', port, ...rest];
console.log(`[metro] react-native ${args.join(' ')}  (METRO_PORT from ${envFile ? envFile.split('/').pop() : 'default'})`);
const child = spawn(bin, args, { stdio: 'inherit', cwd: root });
child.on('exit', (code) => process.exit(code ?? 1));
