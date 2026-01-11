#!/usr/bin/env bun

import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

function which(cmd: string): string | null {
  // Validate command name to prevent injection - only allow alphanumeric and dashes
  if (!/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    return null;
  }
  // Use array-based spawn to avoid shell interpolation
  const res = spawnSync('which', [cmd]);
  if (res.status === 0) return res.stdout.toString().trim();
  return null;
}

async function downloadAct(destDir = 'bin'): Promise<string> {
  const os = process.platform;
  const arch = process.arch;
  const base = 'https://github.com/nektos/act/releases/latest/download';

  let asset = '';
  if (os === 'darwin' && arch === 'arm64') asset = 'act_Darwin_arm64.tar.gz';
  else if (os === 'darwin') asset = 'act_Darwin_x86_64.tar.gz';
  else if (os === 'linux' && (arch === 'x64' || arch === 'arm64')) {
    asset = arch === 'arm64' ? 'act_Linux_arm64.tar.gz' : 'act_Linux_x86_64.tar.gz';
  } else if (os === 'win32') {
    asset = 'act_Windows_x86_64.zip';
  } else {
    throw new Error(`Unsupported platform: ${os}-${arch}`);
  }

  const url = `${base}/${asset}`;
  mkdirSync(destDir, { recursive: true });
  const outPath = join(destDir, asset.split('.')[0]);

  console.log(`Downloading act from ${url} ...`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download act: ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const tgzPath = join(destDir, asset);
  await Bun.write(tgzPath, buf);

  if (asset.endsWith('.zip')) {
    throw new Error('Windows zip extraction not implemented');
  }

  // Extract tar.gz using array-based spawn to avoid shell injection
  await new Promise<void>((resolve, reject) => {
    const p = spawn('tar', ['-xzf', tgzPath, '-C', destDir], { stdio: 'inherit' });
    p.on('error', (err) => reject(new Error(`Failed to spawn tar: ${err.message}`)));
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}`))));
  });

  const actBinary = join(destDir, 'act');
  chmodSync(actBinary, 0o755);
  return actBinary;
}

async function ensureAct(): Promise<string> {
  const existing = await which('act');
  if (existing) return existing;
  const local = join(process.cwd(), 'bin', 'act');
  if (existsSync(local)) return local;
  return downloadAct('bin');
}

async function ensureEvent(kind: 'pull_request' | 'merge_group', scenario = 'essential-risk'): Promise<string> {
  const dir = join(process.cwd(), 'events');
  const path = join(dir, `${kind}.json`);
  if (existsSync(path)) return path;
  mkdirSync(dir, { recursive: true });
  // Generate from our generator
  const res = Bun.spawnSync(['bun', 'run', 'tools/generate-events.ts', scenario]);
  if (res.exitCode !== 0) throw new Error('Failed to generate event');
  writeFileSync(path, res.stdout);
  return path;
}

async function runAct(job: string, eventFile: string, eventName: string) {
  const act = await ensureAct();
  const args = [eventName, '-j', job, '-e', eventFile];
  await new Promise<void>((resolve, reject) => {
    const p = spawn(act, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`act exit ${code}`))));
  });
}

async function main() {
  try {
    const [cmd, a1, a2] = process.argv.slice(2);
    if (!cmd || cmd === 'help') {
      console.log('Usage: act-run.ts <setup|run|list> [scenario] [job]');
      console.log('Scenarios: minimal-risk, essential-risk, full-risk, merge-queue');
      console.log('Jobs: detect, meta, minimal, essential, full');
      process.exit(0);
    }

    if (cmd === 'setup') {
      const bin = await ensureAct();
      console.log(`act available at ${bin}`);
      process.exit(0);
    }

    if (cmd === 'list') {
      const res = Bun.spawnSync(['bun', 'run', 'tools/generate-events.ts', 'list'], { stdio: 'inherit' });
      process.exit(res.exitCode ?? 0);
    }

    if (cmd === 'run') {
      const scenario = a1 || 'essential-risk';
      const job = a2 || 'minimal';
      const isMerge = scenario === 'merge-queue';
      const kind = isMerge ? 'merge_group' : 'pull_request';
      const ev = await ensureEvent(kind as any, isMerge ? undefined : scenario);
      await runAct(job, ev, kind);
      process.exit(0);
    }

    console.error('Unknown command');
    process.exit(1);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
