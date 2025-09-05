import { describe, expect, test, bench, group } from 'bun:test';
import { Detector } from './detector';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Detector', () => {
  test('detects Bun projects', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'detector-test-'));
    
    try {
      writeFileSync(join(tmpDir, 'bun.lockb'), '');
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        scripts: {
          lint: 'biome check .',
          typecheck: 'tsc --noEmit',
          test: 'bun test',
          build: 'bun build ./src/index.ts',
        },
      }));

      const detector = new Detector(tmpDir);
      const result = detector.detectLanguage();

      expect(result.name).toBe('bun');
      expect(result.installCmd).toBe('bun install --frozen-lockfile');
      expect(result.lintCmd).toBe('bun run lint');
      expect(result.typecheckCmd).toBe('bun run typecheck');
      expect(result.testCmd).toBe('bun test');
      expect(result.buildCmd).toBe('bun run build');
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test('detects Rust projects with Cargo workspaces', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'detector-test-'));
    
    try {
      const cargoToml = `
[package]
name = "test"
version = "0.1.0"

[workspace]
members = ["crates/core", "crates/cli"]
`;
      writeFileSync(join(tmpDir, 'Cargo.toml'), cargoToml);

      const detector = new Detector(tmpDir);
      const result = detector.detectLanguage();
      const monorepo = detector.detectMonorepo();

      expect(result.name).toBe('rust');
      expect(result.installCmd).toBe('cargo fetch');
      expect(monorepo.isMonorepo).toBe(true);
      expect(monorepo.type).toBe('cargo');
      expect(monorepo.workspaces).toContain('crates/core');
      expect(monorepo.workspaces).toContain('crates/cli');
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test('detects polyglot monorepos', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'detector-test-'));
    
    try {
      // A monorepo with both Node and Rust
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        workspaces: ['packages/*'],
      }));
      writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), '');
      writeFileSync(join(tmpDir, 'Cargo.toml'), '[package]\nname = "rust-tool"');

      const detector = new Detector(tmpDir);
      const lang = detector.detectLanguage();
      const monorepo = detector.detectMonorepo();

      // Should prioritize Node due to package.json workspaces
      expect(lang.name).toBe('node');
      expect(monorepo.isMonorepo).toBe(true);
      expect(monorepo.type).toBe('pnpm');
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});

// Performance benchmarks
group('detector performance', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'bench-'));
  
  // Set up a complex project structure
  writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
    scripts: {
      lint: 'eslint .',
      test: 'jest',
      build: 'webpack',
    },
    workspaces: ['packages/*'],
  }));
  writeFileSync(join(tmpDir, 'bun.lockb'), '');
  
  const detector = new Detector(tmpDir);

  bench('language detection', () => {
    detector.detectLanguage();
  });

  bench('monorepo detection', () => {
    detector.detectMonorepo();
  });

  bench('provider detection', () => {
    detector.detectProvider();
  });

  bench('full detection', async () => {
    await detector.detect();
  });

  // Cleanup
  setTimeout(() => rmSync(tmpDir, { recursive: true }), 1000);
});