#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CacheConfig {
  cache_key: string;
  cache_path: string;
  restore_keys?: string[];
}

export class CacheKeyGenerator {
  private cwd: string;
  private os: string;

  constructor(cwd = process.cwd(), os = process.platform) {
    this.cwd = cwd;
    this.os = os;
  }

  private fileHash(path: string): string | null {
    const fullPath = join(this.cwd, path);
    if (!existsSync(fullPath)) return null;
    
    try {
      const content = readFileSync(fullPath);
      return createHash('sha256').update(content).digest('hex').substring(0, 16);
    } catch {
      return null;
    }
  }

  private globHash(pattern: string): string {
    // Simplified glob hash - in production would use proper glob library
    const files = Bun.spawnSync(['find', '.', '-name', pattern], { cwd: this.cwd });
    if (files.exitCode !== 0) return 'noglobmatch';
    
    const content = files.stdout.toString();
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  generate(lang: string): CacheConfig | null {
    const osPrefix = `${this.os}-${lang}`;

    switch (lang) {
      case 'bun': {
        const lockHash = this.fileHash('bun.lockb');
        if (!lockHash) return null;
        
        return {
          cache_key: `${osPrefix}-${lockHash}`,
          cache_path: '~/.bun/install/cache',
          restore_keys: [
            `${osPrefix}-`,
          ],
        };
      }

      case 'node': {
        // Check for different lock files
        const npmHash = this.fileHash('package-lock.json');
        const yarnHash = this.fileHash('yarn.lock');
        const pnpmHash = this.fileHash('pnpm-lock.yaml');
        
        const lockHash = npmHash || yarnHash || pnpmHash;
        if (!lockHash) return null;

        const paths = [];
        if (npmHash) paths.push('~/.npm');
        if (yarnHash) paths.push('~/.yarn/cache', '.yarn/cache');
        if (pnpmHash) paths.push('~/.cache/pnpm', '~/.local/share/pnpm/store');

        return {
          cache_key: `${osPrefix}-${lockHash}`,
          cache_path: paths.join('\n'),
          restore_keys: [
            `${osPrefix}-`,
          ],
        };
      }

      case 'rust': {
        const lockHash = this.fileHash('Cargo.lock');
        if (!lockHash) {
          // Generate from Cargo.toml if no lock file
          const tomlHash = this.fileHash('Cargo.toml');
          if (!tomlHash) return null;
          
          return {
            cache_key: `${osPrefix}-cargo-${tomlHash}`,
            cache_path: '~/.cargo/registry\n~/.cargo/git\ntarget',
            restore_keys: [
              `${osPrefix}-cargo-`,
              `${osPrefix}-`,
            ],
          };
        }

        return {
          cache_key: `${osPrefix}-${lockHash}`,
          cache_path: '~/.cargo/registry\n~/.cargo/git\ntarget',
          restore_keys: [
            `${osPrefix}-`,
          ],
        };
      }

      case 'go': {
        const sumHash = this.fileHash('go.sum');
        const modHash = this.fileHash('go.mod');
        
        const keyHash = sumHash || modHash;
        if (!keyHash) return null;

        return {
          cache_key: `${osPrefix}-${keyHash}`,
          cache_path: '~/go/pkg/mod\n~/.cache/go-build',
          restore_keys: [
            `${osPrefix}-`,
          ],
        };
      }

      case 'python': {
        const reqHash = this.fileHash('requirements.txt');
        const pyprojectHash = this.fileHash('pyproject.toml');
        const poetryHash = this.fileHash('poetry.lock');
        const pipfileHash = this.fileHash('Pipfile.lock');
        
        const keyHash = poetryHash || pipfileHash || pyprojectHash || reqHash;
        if (!keyHash) return null;

        const paths = [
          '~/.cache/pip',
          '~/.cache/pypoetry',
          '.venv',
          'venv',
        ];

        return {
          cache_key: `${osPrefix}-${keyHash}`,
          cache_path: paths.join('\n'),
          restore_keys: [
            `${osPrefix}-`,
          ],
        };
      }

      case 'java':
      case 'gradle': {
        const isMaven = existsSync(join(this.cwd, 'pom.xml'));
        const isGradle = existsSync(join(this.cwd, 'build.gradle')) || 
                        existsSync(join(this.cwd, 'build.gradle.kts'));

        if (isMaven) {
          const pomHash = this.fileHash('pom.xml');
          if (!pomHash) return null;

          return {
            cache_key: `${osPrefix}-maven-${pomHash}`,
            cache_path: '~/.m2/repository',
            restore_keys: [
              `${osPrefix}-maven-`,
              `${osPrefix}-`,
            ],
          };
        }

        if (isGradle) {
          const buildHash = this.fileHash('build.gradle') || this.fileHash('build.gradle.kts');
          if (!buildHash) return null;

          return {
            cache_key: `${osPrefix}-gradle-${buildHash}`,
            cache_path: '~/.gradle/caches\n~/.gradle/wrapper',
            restore_keys: [
              `${osPrefix}-gradle-`,
              `${osPrefix}-`,
            ],
          };
        }

        return null;
      }

      default:
        return null;
    }
  }

  // Generate smart cache keys for monorepos
  generateMonorepo(lang: string, workspaces: string[]): CacheConfig | null {
    const base = this.generate(lang);
    if (!base) return null;

    // Add workspace-specific cache paths
    if (lang === 'node' || lang === 'bun') {
      const workspacePaths = workspaces.map(ws => `${ws}/node_modules`).join('\n');
      base.cache_path += '\n' + workspacePaths;
    }

    return base;
  }
}

// CLI interface
if (import.meta.main) {
  const lang = process.argv[2]?.replace('--lang=', '') || 'unknown';
  
  const generator = new CacheKeyGenerator();
  const config = generator.generate(lang);
  
  if (config) {
    console.log(JSON.stringify(config, null, 2));
  } else {
    console.log('{}');
  }
}