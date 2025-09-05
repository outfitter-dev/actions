#!/usr/bin/env bun

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Language {
  name: 'bun' | 'node' | 'rust' | 'go' | 'python' | 'java' | 'gradle' | 'make' | 'unknown';
  installCmd: string;
  lintCmd: string;
  typecheckCmd: string;
  testCmd: string;
  buildCmd: string;
}

export interface MonorepoInfo {
  isMonorepo: boolean;
  workspaces: string[];
  type?: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'cargo' | 'go' | 'python' | 'gradle' | 'maven';
}

export interface DetectorOutput {
  lang: string;
  install_cmd: string;
  lint_cmd: string;
  typecheck_cmd: string;
  test_cmd: string;
  build_cmd: string;
  provider: 'graphite' | 'github';
  is_monorepo: boolean;
  workspaces: string;
}

export class Detector {
  private cwd: string;

  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
  }

  private fileExists(path: string): boolean {
    return existsSync(join(this.cwd, path));
  }

  private readJson(path: string): any {
    try {
      const content = readFileSync(join(this.cwd, path), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private readFile(path: string): string | null {
    try {
      return readFileSync(join(this.cwd, path), 'utf-8');
    } catch {
      return null;
    }
  }

  detectLanguage(): Language {
    // Bun (highest priority)
    if (this.fileExists('bun.lockb')) {
      return this.detectBunCommands();
    }

    // Node.js variants
    if (this.fileExists('package-lock.json')) {
      return this.detectNodeCommands('npm');
    }
    if (this.fileExists('yarn.lock')) {
      return this.detectNodeCommands('yarn');
    }
    if (this.fileExists('pnpm-lock.yaml')) {
      return this.detectNodeCommands('pnpm');
    }

    // Rust (including Cargo workspaces)
    if (this.fileExists('Cargo.toml')) {
      return this.detectRustCommands();
    }

    // Go
    if (this.fileExists('go.mod')) {
      return this.detectGoCommands();
    }

    // Python
    if (this.fileExists('requirements.txt') || this.fileExists('pyproject.toml')) {
      return this.detectPythonCommands();
    }

    // Java/Maven
    if (this.fileExists('pom.xml')) {
      return this.detectMavenCommands();
    }

    // Gradle
    if (this.fileExists('build.gradle') || this.fileExists('build.gradle.kts')) {
      return this.detectGradleCommands();
    }

    // Makefile
    if (this.fileExists('Makefile')) {
      return this.detectMakeCommands();
    }

    return {
      name: 'unknown',
      installCmd: '',
      lintCmd: '',
      typecheckCmd: '',
      testCmd: '',
      buildCmd: '',
    };
  }

  private detectBunCommands(): Language {
    const pkg = this.readJson('package.json');
    const scripts = pkg?.scripts || {};

    return {
      name: 'bun',
      installCmd: 'bun install --frozen-lockfile',
      lintCmd: scripts.lint ? 'bun run lint' : '',
      typecheckCmd: scripts.typecheck ? 'bun run typecheck' : scripts['type-check'] ? 'bun run type-check' : '',
      testCmd: scripts.test ? 'bun test' : '',
      buildCmd: scripts.build ? 'bun run build' : '',
    };
  }

  private detectNodeCommands(manager: 'npm' | 'yarn' | 'pnpm'): Language {
    const pkg = this.readJson('package.json');
    const scripts = pkg?.scripts || {};

    const installCmds = {
      npm: 'npm ci',
      yarn: 'yarn install --frozen-lockfile',
      pnpm: 'pnpm install --frozen-lockfile',
    };

    return {
      name: 'node',
      installCmd: installCmds[manager],
      lintCmd: scripts.lint ? `${manager} run lint` : '',
      typecheckCmd: scripts.typecheck ? `${manager} run typecheck` : scripts['type-check'] ? `${manager} run type-check` : '',
      testCmd: scripts.test ? `${manager} test` : '',
      buildCmd: scripts.build ? `${manager} run build` : '',
    };
  }

  private detectRustCommands(): Language {
    return {
      name: 'rust',
      installCmd: 'cargo fetch',
      lintCmd: 'cargo fmt -- --check && cargo clippy -- -D warnings',
      typecheckCmd: 'cargo check --all',
      testCmd: 'cargo test --all',
      buildCmd: 'cargo build --all',
    };
  }

  private detectGoCommands(): Language {
    return {
      name: 'go',
      installCmd: 'go mod download',
      lintCmd: 'go vet ./...',
      typecheckCmd: 'go build -o /dev/null ./...',
      testCmd: 'go test ./...',
      buildCmd: 'go build ./...',
    };
  }

  private detectPythonCommands(): Language {
    const hasRequirements = this.fileExists('requirements.txt');
    const hasPyproject = this.fileExists('pyproject.toml');

    return {
      name: 'python',
      installCmd: hasRequirements ? 'pip install -r requirements.txt' : hasPyproject ? 'pip install .' : '',
      lintCmd: 'ruff check . || flake8 . || pylint **/*.py || true',
      typecheckCmd: 'mypy . || true',
      testCmd: 'pytest || python -m pytest || python -m unittest discover || true',
      buildCmd: 'python setup.py build || true',
    };
  }

  private detectMavenCommands(): Language {
    return {
      name: 'java',
      installCmd: 'mvn dependency:resolve',
      lintCmd: 'mvn checkstyle:check || true',
      typecheckCmd: 'mvn compile',
      testCmd: 'mvn test',
      buildCmd: 'mvn package',
    };
  }

  private detectGradleCommands(): Language {
    const wrapper = this.fileExists('gradlew') ? './gradlew' : 'gradle';

    return {
      name: 'gradle',
      installCmd: `${wrapper} dependencies`,
      lintCmd: `${wrapper} check || true`,
      typecheckCmd: `${wrapper} compileJava compileKotlin || true`,
      testCmd: `${wrapper} test`,
      buildCmd: `${wrapper} build`,
    };
  }

  private detectMakeCommands(): Language {
    const makefile = this.readFile('Makefile');
    if (!makefile) {
      return {
        name: 'make',
        installCmd: 'make deps || true',
        lintCmd: '',
        typecheckCmd: '',
        testCmd: '',
        buildCmd: '',
      };
    }

    const hasTarget = (target: string) => new RegExp(`^${target}:`, 'm').test(makefile);

    return {
      name: 'make',
      installCmd: hasTarget('deps') ? 'make deps' : hasTarget('install') ? 'make install' : '',
      lintCmd: hasTarget('lint') ? 'make lint' : '',
      typecheckCmd: hasTarget('typecheck') ? 'make typecheck' : '',
      testCmd: hasTarget('test') ? 'make test' : '',
      buildCmd: hasTarget('build') ? 'make build' : '',
    };
  }

  detectMonorepo(): MonorepoInfo {
    // NPM/Yarn/PNPM workspaces
    const pkg = this.readJson('package.json');
    if (pkg?.workspaces) {
      const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
      return {
        isMonorepo: true,
        workspaces,
        type: this.fileExists('bun.lockb') ? 'bun' : 
              this.fileExists('pnpm-lock.yaml') ? 'pnpm' : 
              this.fileExists('yarn.lock') ? 'yarn' : 'npm',
      };
    }

    // PNPM workspace
    if (this.fileExists('pnpm-workspace.yaml')) {
      const content = this.readFile('pnpm-workspace.yaml');
      const match = content?.match(/packages:\s*\n((?:\s+-\s+.+\n?)+)/);
      if (match) {
        const workspaces = match[1]
          .split('\n')
          .map(line => line.trim().replace(/^-\s*['"]?(.+?)['"]?$/, '$1'))
          .filter(Boolean);
        return { isMonorepo: true, workspaces, type: 'pnpm' };
      }
    }

    // Cargo workspace
    const cargoToml = this.readFile('Cargo.toml');
    if (cargoToml?.includes('[workspace]')) {
      const match = cargoToml.match(/members\s*=\s*\[(.*?)\]/s);
      if (match) {
        const workspaces = match[1]
          .split(',')
          .map(s => s.trim().replace(/["']/g, ''))
          .filter(Boolean);
        return { isMonorepo: true, workspaces, type: 'cargo' };
      }
    }

    // Go workspace
    if (this.fileExists('go.work')) {
      const content = this.readFile('go.work');
      const matches = content?.match(/use\s+\((.*?)\)/s);
      if (matches) {
        const workspaces = matches[1]
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('//'));
        return { isMonorepo: true, workspaces, type: 'go' };
      }
    }

    // Python monorepo patterns
    const pyproject = this.readFile('pyproject.toml');
    if (pyproject?.includes('[tool.poetry.group') || pyproject?.includes('packages = [')) {
      return { isMonorepo: true, workspaces: [], type: 'python' };
    }

    // Gradle multi-project
    const settingsGradle = this.readFile('settings.gradle') || this.readFile('settings.gradle.kts');
    if (settingsGradle) {
      const matches = settingsGradle.match(/include\s*\((.*?)\)/gs);
      if (matches) {
        const workspaces = matches
          .flatMap(m => m.match(/['"]([^'"]+)['"]/g) || [])
          .map(s => s.replace(/["']/g, ''));
        if (workspaces.length > 0) {
          return { isMonorepo: true, workspaces, type: 'gradle' };
        }
      }
    }

    // Maven multi-module
    const pomXml = this.readFile('pom.xml');
    if (pomXml?.includes('<modules>')) {
      const matches = pomXml.match(/<module>(.*?)<\/module>/g);
      if (matches) {
        const workspaces = matches.map(m => m.replace(/<\/?module>/g, ''));
        return { isMonorepo: true, workspaces, type: 'maven' };
      }
    }

    return { isMonorepo: false, workspaces: [] };
  }

  detectProvider(): 'graphite' | 'github' {
    const useGraphite = process.env.USE_GRAPHITE;
    const hasToken = !!process.env.GRAPHITE_TOKEN;

    if (useGraphite === 'true') return 'graphite';
    if (useGraphite === 'false') return 'github';
    
    // Auto mode
    if (hasToken) return 'graphite';
    
    // Check for Graphite indicators in the repo
    if (this.fileExists('.github/actions/graphite')) return 'graphite';
    
    // Check workflows for Graphite action
    try {
      const workflows = Bun.spawnSync(['grep', '-r', 'withgraphite/graphite-ci-action', '.github/workflows'], {
        cwd: this.cwd,
      });
      if (workflows.exitCode === 0) return 'graphite';
    } catch {}

    return 'github';
  }

  async detect(): Promise<DetectorOutput> {
    const language = this.detectLanguage();
    const monorepo = this.detectMonorepo();
    const provider = this.detectProvider();

    return {
      lang: language.name,
      install_cmd: language.installCmd,
      lint_cmd: language.lintCmd,
      typecheck_cmd: language.typecheckCmd,
      test_cmd: language.testCmd,
      build_cmd: language.buildCmd,
      provider,
      is_monorepo: monorepo.isMonorepo,
      workspaces: JSON.stringify(monorepo.workspaces),
    };
  }
}

// CLI entrypoint
if (import.meta.main) {
  const detector = new Detector();
  const output = await detector.detect();
  console.log(JSON.stringify(output, null, 2));
}