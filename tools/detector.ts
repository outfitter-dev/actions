#!/usr/bin/env bun

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as TOML from '@iarna/toml';

/**
 * Represents a detected programming language and its associated CI commands.
 *
 * This interface encapsulates the language runtime and the shell commands
 * required to install dependencies, lint, typecheck, test, and build the project.
 *
 * @example
 * ```ts
 * const lang: Language = {
 *   name: 'bun',
 *   installCmd: 'bun install --frozen-lockfile',
 *   lintCmd: 'bun run lint',
 *   typecheckCmd: 'bun run typecheck',
 *   testCmd: 'bun run test',
 *   buildCmd: 'bun run build',
 * };
 * ```
 */
export interface Language {
  /** The detected language/runtime identifier */
  name: 'bun' | 'node' | 'rust' | 'go' | 'python' | 'java' | 'gradle' | 'make' | 'unknown';
  /** Shell command to install project dependencies */
  installCmd: string;
  /** Shell command to run linting (empty string if not available) */
  lintCmd: string;
  /** Shell command to run type checking (empty string if not available) */
  typecheckCmd: string;
  /** Shell command to run tests (empty string if not available) */
  testCmd: string;
  /** Shell command to build the project (empty string if not available) */
  buildCmd: string;
}

/**
 * Information about a detected monorepo structure.
 *
 * Captures whether the repository is a monorepo, what workspaces it contains,
 * and which package manager or build tool manages the monorepo.
 *
 * @example
 * ```ts
 * const info: MonorepoInfo = {
 *   isMonorepo: true,
 *   workspaces: ['packages/*', 'apps/*'],
 *   type: 'pnpm',
 * };
 * ```
 */
export interface MonorepoInfo {
  /** Whether the repository is detected as a monorepo */
  isMonorepo: boolean;
  /** List of workspace glob patterns or paths */
  workspaces: string[];
  /** The package manager or build tool type managing the monorepo */
  type?: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'cargo' | 'go' | 'python' | 'gradle' | 'maven';
}

/**
 * Repository-specific CI configuration from `.ci.toml` or `.ci.json`.
 *
 * Allows repositories to override default Belay behavior with custom settings
 * for CI intensity, timeouts, ignored paths, and output channels.
 *
 * @example
 * ```ts
 * const config: CIConfig = {
 *   force: 'essential',
 *   timeout_minutes: 45,
 *   ignore: ['**\/*.md', 'docs/**'],
 *   critical_globs: ['packages/**\/package.json'],
 *   outputs: { comment: true, webhook: false },
 * };
 * ```
 */
export interface CIConfig {
  /** Force a specific CI tier regardless of risk scoring */
  force?: 'full' | 'essential' | 'minimal';
  /** Maximum timeout in minutes for CI jobs (5-120) */
  timeout_minutes?: number;
  /** Glob patterns for files to ignore in risk calculations */
  ignore?: string[];
  /** Glob patterns that trigger full CI when matched */
  critical_globs?: string[];
  /** Configuration for CI output channels */
  outputs?: {
    /** Enable sticky PR comments with CI summary */
    comment?: boolean;
    /** Enable webhook notifications */
    webhook?: boolean;
  };
}

/**
 * Complete output from the detector, ready for GitHub Actions consumption.
 *
 * This interface represents all detection results in a format suitable for
 * setting as GitHub Actions outputs. String fields use snake_case for
 * compatibility with shell scripts and YAML workflows.
 *
 * @example
 * ```ts
 * const output: DetectorOutput = {
 *   lang: 'bun',
 *   install_cmd: 'bun install --frozen-lockfile',
 *   lint_cmd: 'bun run lint',
 *   typecheck_cmd: 'bun run typecheck',
 *   test_cmd: 'bun run test',
 *   build_cmd: 'bun run build',
 *   provider: 'github',
 *   position: 'bottom',
 *   tier: 'essential',
 *   is_agent: false,
 *   is_monorepo: true,
 *   workspaces: '["packages/*"]',
 *   critical: false,
 *   cache_key: '${{ runner.os }}-bun-...',
 *   cache_path: '~/.bun/install/cache',
 * };
 * ```
 */
export interface DetectorOutput {
  /** Detected language/runtime name */
  lang: string;
  /** Shell command to install dependencies */
  install_cmd: string;
  /** Shell command to run linting */
  lint_cmd: string;
  /** Shell command to run type checking */
  typecheck_cmd: string;
  /** Shell command to run tests */
  test_cmd: string;
  /** Shell command to build the project */
  build_cmd: string;
  /** CI provider (graphite for Graphite CI Optimizer, github for native) */
  provider: 'graphite' | 'github';
  /** Position in a stacked PR chain */
  position: 'top' | 'middle' | 'bottom' | 'unknown';
  /** Calculated CI intensity tier based on risk scoring */
  tier: 'minimal' | 'essential' | 'full';
  /** Whether the actor appears to be an automated agent/bot */
  is_agent: boolean;
  /** Whether the repository is a monorepo */
  is_monorepo: boolean;
  /** JSON-stringified array of workspace paths */
  workspaces: string;
  /** Whether critical paths were detected in changes */
  critical: boolean;
  /** Cache key template for GitHub Actions cache */
  cache_key: string;
  /** Cache path(s) for the detected language */
  cache_path: string;
  /** Timeout in minutes from config or default */
  timeout_minutes?: number;
  /** JSON-stringified array of critical glob patterns */
  critical_globs?: string;
  /** Forced tier from config (overrides risk calculation) */
  force?: 'full' | 'essential' | 'minimal';
}

/**
 * Detects project language, tooling, and CI configuration for Belay workflows.
 *
 * The Detector class analyzes a repository to determine the programming language,
 * package manager, available CI commands, monorepo structure, and risk-based
 * CI tier. It outputs data suitable for GitHub Actions workflow consumption.
 *
 * @example
 * ```ts
 * const detector = new Detector('/path/to/repo');
 * const output = await detector.detect();
 * console.log(output.lang);      // 'bun'
 * console.log(output.tier);      // 'essential'
 * console.log(output.test_cmd);  // 'bun run test'
 * ```
 */
export class Detector {
  private cwd: string;

  /**
   * Creates a new Detector instance.
   *
   * @param cwd - Working directory to analyze. Defaults to `process.cwd()`.
   *
   * @example
   * ```ts
   * // Detect in current directory
   * const detector = new Detector();
   *
   * // Detect in specific directory
   * const detector = new Detector('/path/to/repo');
   * ```
   */
  constructor(cwd?: string) {
    // Use actual process CWD, not the script's directory
    this.cwd = cwd || process.cwd();
  }

  private fileExists(path: string): boolean {
    return existsSync(join(this.cwd, path));
  }

  private readJson(path: string): unknown {
    try {
      const content = readFileSync(join(this.cwd, path), 'utf-8');
      return JSON.parse(content) as unknown;
    } catch {
      return null;
    }
  }

  /**
   * Type guard to check if a value is a package.json-like object with scripts.
   *
   * @param value - Unknown value to check
   * @returns `true` if value is an object that may contain a `scripts` field
   *
   * @example
   * ```ts
   * const pkg = this.readJson('package.json');
   * if (this.isPackageJson(pkg)) {
   *   const scripts = pkg.scripts ?? {};
   * }
   * ```
   */
  private isPackageJson(value: unknown): value is { scripts?: Record<string, string> } {
    return typeof value === 'object' && value !== null;
  }

  /**
   * Type guard for package.json with workspaces field.
   *
   * Checks if the value is an object containing a `workspaces` property,
   * which can be either an array of strings or an object with a `packages` array.
   *
   * @param value - Unknown value to check
   * @returns `true` if value has a valid workspaces structure
   *
   * @example
   * ```ts
   * const pkg = this.readJson('package.json');
   * if (this.hasWorkspaces(pkg)) {
   *   const workspaces = Array.isArray(pkg.workspaces)
   *     ? pkg.workspaces
   *     : pkg.workspaces.packages;
   * }
   * ```
   */
  private hasWorkspaces(value: unknown): value is {
    workspaces: string[] | { packages: string[] };
  } {
    if (typeof value !== 'object' || value === null) return false;
    const pkg = value as Record<string, unknown>;
    return 'workspaces' in pkg && pkg.workspaces !== undefined;
  }

  private readFile(path: string): string | null {
    try {
      return readFileSync(join(this.cwd, path), 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Detects the primary programming language and associated CI commands.
   *
   * Probes for lockfiles and configuration files in priority order:
   * 1. Bun (`bun.lockb`, `bun.lock`)
   * 2. Node.js (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`)
   * 3. Rust (`Cargo.toml`)
   * 4. Go (`go.mod`)
   * 5. Python (`requirements.txt`, `pyproject.toml`)
   * 6. Java/Maven (`pom.xml`)
   * 7. Gradle (`build.gradle`, `build.gradle.kts`)
   * 8. Make (`Makefile`)
   *
   * For Node.js projects, also inspects `package.json` scripts to determine
   * available lint, typecheck, test, and build commands.
   *
   * @returns Language object with detected runtime and commands
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * const lang = detector.detectLanguage();
   * console.log(lang.name);       // 'bun'
   * console.log(lang.installCmd); // 'bun install --frozen-lockfile'
   * console.log(lang.testCmd);    // 'bun run test'
   * ```
   */
  detectLanguage(): Language {
    // Bun (highest priority)
    if (this.fileExists('bun.lockb') || this.fileExists('bun.lock')) {
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

    // Fallback: package.json present but no lockfile → treat as Node (npm)
    if (this.fileExists('package.json')) {
      const pkg = this.readJson('package.json');
      const scripts = this.isPackageJson(pkg) ? (pkg.scripts ?? {}) : {};
      return {
        name: 'node',
        installCmd: 'npm install --no-audit --progress=false',
        lintCmd: scripts.lint ? 'npm run lint' : '',
        typecheckCmd: scripts.typecheck ? 'npm run typecheck' : scripts['type-check'] ? 'npm run type-check' : '',
        testCmd: scripts.test ? 'npm run test' : '',
        buildCmd: scripts.build ? 'npm run build' : '',
      };
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
    const scripts = this.isPackageJson(pkg) ? (pkg.scripts ?? {}) : {};

    return {
      name: 'bun',
      installCmd: 'bun install --frozen-lockfile',
      lintCmd: scripts.lint ? 'bun run lint' : '',
      typecheckCmd: scripts.typecheck ? 'bun run typecheck' : scripts['type-check'] ? 'bun run type-check' : '',
      testCmd: scripts.test ? 'bun run test' : '',
      buildCmd: scripts.build ? 'bun run build' : '',
    };
  }

  private detectNodeCommands(manager: 'npm' | 'yarn' | 'pnpm'): Language {
    const pkg = this.readJson('package.json');
    const scripts = this.isPackageJson(pkg) ? (pkg.scripts ?? {}) : {};

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

  /**
   * Detects monorepo structure and workspace configuration.
   *
   * Checks for various monorepo patterns:
   * - NPM/Yarn/PNPM/Bun workspaces in `package.json`
   * - PNPM workspace configuration (`pnpm-workspace.yaml`)
   * - Cargo workspaces (`Cargo.toml` with `[workspace]`)
   * - Go workspaces (`go.work`)
   * - Python monorepo patterns (`pyproject.toml`)
   * - Gradle multi-project builds (`settings.gradle`)
   * - Maven multi-module projects (`pom.xml` with `<modules>`)
   *
   * @returns MonorepoInfo with detection results and workspace paths
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * const mono = detector.detectMonorepo();
   * if (mono.isMonorepo) {
   *   console.log(`Found ${mono.type} monorepo with workspaces:`, mono.workspaces);
   * }
   * ```
   */
  detectMonorepo(): MonorepoInfo {
    // NPM/Yarn/PNPM workspaces
    const pkg = this.readJson('package.json');
    if (this.hasWorkspaces(pkg)) {
      const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages ?? [];
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

  /**
   * Detects which CI provider to use (Graphite or GitHub).
   *
   * Provider selection priority:
   * 1. `USE_GRAPHITE` environment variable (`'true'` or `'false'`)
   * 2. Presence of `GRAPHITE_TOKEN` environment variable
   * 3. Presence of `.github/actions/graphite` directory
   * 4. Usage of `withgraphite/graphite-ci-action` in workflows
   * 5. Default: `'github'`
   *
   * @returns `'graphite'` if Graphite CI Optimizer should be used, `'github'` otherwise
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * const provider = detector.detectProvider();
   * if (provider === 'graphite') {
   *   console.log('Using Graphite CI Optimizer');
   * }
   * ```
   */
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

  /**
   * Detects the position of the current PR within a stacked PR chain.
   *
   * Uses the `GITHUB_CONTEXT` environment variable to analyze the PR's
   * base and head refs to determine stack position:
   * - `'bottom'`: Base is `main` or `master` (first PR in stack)
   * - `'middle'`: Base is another feature branch
   * - `'top'`: No other PRs are based on this branch
   * - `'unknown'`: Unable to determine position
   *
   * @returns Stack position indicator
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * const position = detector.detectPosition();
   * if (position === 'bottom' || position === 'top') {
   *   console.log('Running full CI for stack boundary');
   * }
   * ```
   */
  detectPosition(): 'top' | 'middle' | 'bottom' | 'unknown' {
    // Try to parse GitHub context
    const githubContext = process.env.GITHUB_CONTEXT;
    if (!githubContext) return 'unknown';

    try {
      const context = JSON.parse(githubContext);
      const baseRef = context.event?.pull_request?.base?.ref;
      const headRef = context.event?.pull_request?.head?.ref;

      if (!baseRef || !headRef) return 'unknown';

      // If base is main/master, this is bottom of stack
      if (baseRef === 'main' || baseRef === 'master') return 'bottom';

      // TODO: More sophisticated stack position detection
      // For now, assume middle for non-main branches
      return 'middle';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Detects whether the current actor is an automated agent or bot.
   *
   * Checks the `GITHUB_ACTOR` environment variable against known bot patterns:
   * - Actors containing `[bot]` in their name
   * - `github-actions`
   * - `dependabot`
   * - `renovate`
   *
   * @returns `true` if the actor appears to be a bot, `false` otherwise
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * if (detector.detectAgent()) {
   *   console.log('Running with agent-optimized output');
   * }
   * ```
   */
  detectAgent(): boolean {
    const actor = process.env.GITHUB_ACTOR || '';

    // Common bot patterns
    if (actor.includes('[bot]')) return true;
    if (actor === 'github-actions') return true;
    if (actor === 'dependabot') return true;
    if (actor === 'renovate') return true;
    
    return false;
  }

  /**
   * Reads and parses the repository's CI configuration file.
   *
   * Looks for configuration at the path specified by `CONFIG_FILE` environment
   * variable, defaulting to `.ci.toml`. Supports both TOML and JSON formats.
   *
   * @returns Parsed CIConfig object, or `null` if no config exists or parsing fails
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * const config = detector.readCIConfig();
   * if (config?.force === 'full') {
   *   console.log('Config forces full CI');
   * }
   * ```
   */
  readCIConfig(): CIConfig | null {
    const configPath = process.env.CONFIG_FILE || '.ci.toml';
    
    try {
      const content = readFileSync(join(this.cwd, configPath), 'utf-8');
      
      // Parse TOML file
      if (configPath.endsWith('.toml')) {
        return TOML.parse(content) as CIConfig;
      }
      
      // Fallback to JSON for backwards compatibility
      if (configPath.endsWith('.json')) {
        return JSON.parse(content) as CIConfig;
      }
      
      // Try TOML by default
      return TOML.parse(content) as CIConfig;
    } catch {
      return null;
    }
  }

  /**
   * Detects whether changes affect critical paths that require full CI.
   *
   * Checks changed files against critical glob patterns. Default critical paths include:
   * - Package manifests (`packages/**\/package.json`, `Cargo.toml`, etc.)
   * - Schema files (`**\/schema.*`)
   * - GitHub workflows (`.github/**`)
   *
   * Also triggers on high file counts (>50 files changed).
   *
   * @param config - Optional CI configuration with custom `critical_globs`
   * @returns `true` if critical paths are affected, `false` otherwise
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * const config = detector.readCIConfig();
   * if (detector.detectCriticalPaths(config)) {
   *   console.log('Critical paths affected - running full CI');
   * }
   * ```
   */
  detectCriticalPaths(config: CIConfig | null): boolean {
    const defaultCriticalGlobs = [
      'packages/**/package.json',
      '**/schema.*',
      '.github/**',
      '**/Cargo.toml',
      '**/go.mod',
      '**/pyproject.toml',
      '**/pom.xml',
    ];

    const criticalGlobs = config?.critical_globs || defaultCriticalGlobs;
    
    // Get changed files from GitHub context
    const githubContext = process.env.GITHUB_CONTEXT;
    if (!githubContext) return false;

    try {
      const context = JSON.parse(githubContext);
      const changedFiles = context.event?.pull_request?.changed_files || 0;
      
      // If many files changed, consider it critical
      if (changedFiles > 50) return true;

      // TODO: Check actual file paths against critical globs
      // For now, use a simple heuristic
      for (const glob of criticalGlobs) {
        if (glob.includes('.github') && this.fileExists('.github')) return true;
        if (glob.includes('schema') && this.fileExists('schema.json')) return true;
      }
    } catch {}

    return false;
  }

  /**
   * Calculates the appropriate CI tier based on risk scoring.
   *
   * Risk factors that increase tier:
   * - High file count: >50 files (+30), >20 files (+20), >10 files (+10)
   * - Stack position: top/bottom (+30), middle (+10)
   * - Critical paths affected (+30)
   *
   * Risk factors that decrease tier:
   * - Draft PR (-10)
   *
   * Tier thresholds:
   * - `'full'`: risk > 70 or `merge_group` event or config forces it
   * - `'essential'`: risk > 30
   * - `'minimal'`: risk <= 30
   *
   * @param config - Optional CI configuration with `force` override
   * @param provider - Detected CI provider (`'graphite'` or `'github'`)
   * @param position - Detected stack position
   * @param critical - Whether critical paths are affected
   * @returns Calculated CI tier
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * const config = detector.readCIConfig();
   * const tier = detector.calculateRiskTier(config, 'github', 'bottom', true);
   * console.log(tier); // 'full' (critical + bottom position)
   * ```
   */
  calculateRiskTier(config: CIConfig | null, provider: string, position: string, critical: boolean): 'minimal' | 'essential' | 'full' {
    // Check for forced tier from config
    if (config?.force) return config.force;

    // Check for merge_group event
    const eventName = process.env.GITHUB_EVENT_NAME;
    if (eventName === 'merge_group') return 'full';

    // Calculate risk score (0-100)
    let risk = 0;

    // Changed files count
    try {
      const context = JSON.parse(process.env.GITHUB_CONTEXT || '{}');
      const filesChanged = context.event?.pull_request?.changed_files || 0;
      if (filesChanged > 50) risk += 30;
      else if (filesChanged > 20) risk += 20;
      else if (filesChanged > 10) risk += 10;
    } catch {}

    // Stack position
    if (position === 'top' || position === 'bottom') risk += 30;
    else if (position === 'middle') risk += 10;

    // Critical paths
    if (critical) risk += 30;

    // Draft PR reduces risk
    try {
      const context = JSON.parse(process.env.GITHUB_CONTEXT || '{}');
      if (context.event?.pull_request?.draft) risk -= 10;
    } catch {}

    // Determine tier based on risk
    if (risk > 70) return 'full';
    if (risk > 30) return 'essential';
    return 'minimal';
  }

  /**
   * Generates GitHub Actions cache key and path for the detected language.
   *
   * Returns cache configuration suitable for the `actions/cache` action,
   * with keys based on lockfile hashes for deterministic caching.
   *
   * Supported languages and their cache paths:
   * - Bun: `~/.bun/install/cache`
   * - Node (npm): `~/.npm`
   * - Node (pnpm): `~/.pnpm-store`
   * - Node (yarn): `~/.yarn/cache`
   * - Rust: `~/.cargo/registry ~/.cargo/git target`
   * - Go: `~/go/pkg/mod`
   * - Python: `~/.cache/pip`
   * - Java/Maven: `~/.m2`
   * - Gradle: `~/.gradle/caches`
   *
   * @param language - Detected language information
   * @param monorepo - Detected monorepo information (currently unused but reserved)
   * @returns Object with `key` (cache key template) and `path` (cache directory)
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * const lang = detector.detectLanguage();
   * const mono = detector.detectMonorepo();
   * const cache = detector.getCacheInfo(lang, mono);
   * console.log(cache.key);  // '${{ runner.os }}-bun-${{ hashFiles(...) }}'
   * console.log(cache.path); // '~/.bun/install/cache'
   * ```
   */
  getCacheInfo(language: Language, monorepo: MonorepoInfo): { key: string; path: string } {
    const runner = '${{ runner.os }}';
    let key = '';
    let path = '';

    switch (language.name) {
      case 'bun':
        key = `${runner}-bun-\${{ hashFiles('**/bun.lockb', '**/bun.lock') }}`;
        path = '~/.bun/install/cache';
        break;
      case 'node':
        if (this.fileExists('pnpm-lock.yaml')) {
          key = `${runner}-pnpm-\${{ hashFiles('**/pnpm-lock.yaml') }}`;
          path = '~/.pnpm-store';
        } else if (this.fileExists('yarn.lock')) {
          key = `${runner}-yarn-\${{ hashFiles('**/yarn.lock') }}`;
          path = '~/.yarn/cache';
        } else {
          key = `${runner}-npm-\${{ hashFiles('**/package-lock.json') }}`;
          path = '~/.npm';
        }
        break;
      case 'rust':
        key = `${runner}-rust-\${{ hashFiles('**/Cargo.lock') }}`;
        path = '~/.cargo/registry ~/.cargo/git target';
        break;
      case 'go':
        key = `${runner}-go-\${{ hashFiles('**/go.sum') }}`;
        path = '~/go/pkg/mod';
        break;
      case 'python':
        key = `${runner}-python-\${{ hashFiles('**/requirements.txt', '**/pyproject.toml') }}`;
        path = '~/.cache/pip';
        break;
      case 'java':
        key = `${runner}-maven-\${{ hashFiles('**/pom.xml') }}`;
        path = '~/.m2';
        break;
      case 'gradle':
        key = `${runner}-gradle-\${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}`;
        path = '~/.gradle/caches';
        break;
      default:
        key = '';
        path = '';
    }

    return { key, path };
  }

  /**
   * Runs all detection methods and returns complete output for GitHub Actions.
   *
   * This is the main entry point that orchestrates all detection:
   * 1. Language and CI commands
   * 2. Monorepo structure
   * 3. CI provider (Graphite/GitHub)
   * 4. Stack position
   * 5. Agent detection
   * 6. CI configuration
   * 7. Critical paths
   * 8. Risk tier calculation
   * 9. Cache configuration
   *
   * @returns Complete DetectorOutput suitable for GitHub Actions outputs
   *
   * @example
   * ```ts
   * const detector = new Detector();
   * const output = await detector.detect();
   *
   * // Set GitHub Actions outputs
   * for (const [key, value] of Object.entries(output)) {
   *   console.log(`::set-output name=${key}::${value}`);
   * }
   * ```
   */
  async detect(): Promise<DetectorOutput> {
    const language = this.detectLanguage();
    const monorepo = this.detectMonorepo();
    const provider = this.detectProvider();
    const position = this.detectPosition();
    const isAgent = this.detectAgent();
    const config = this.readCIConfig();
    const critical = this.detectCriticalPaths(config);
    const tier = this.calculateRiskTier(config, provider, position, critical);
    const cacheInfo = this.getCacheInfo(language, monorepo);
    const timeoutMinutes = config?.timeout_minutes ?? 30;

    return {
      lang: language.name,
      install_cmd: language.installCmd,
      lint_cmd: language.lintCmd,
      typecheck_cmd: language.typecheckCmd,
      test_cmd: language.testCmd,
      build_cmd: language.buildCmd,
      provider,
      position,
      tier,
      is_agent: isAgent,
      is_monorepo: monorepo.isMonorepo,
      workspaces: JSON.stringify(monorepo.workspaces),
      critical,
      cache_key: cacheInfo.key,
      cache_path: cacheInfo.path,
      timeout_minutes: timeoutMinutes,
      critical_globs: config?.critical_globs ? JSON.stringify(config.critical_globs) : undefined,
      force: config?.force,
    };
  }
}

// CLI entrypoint
if (import.meta.main) {
  const detector = new Detector();
  const output = await detector.detect();
  console.log(JSON.stringify(output, null, 2));
}
