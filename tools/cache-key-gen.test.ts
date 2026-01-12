import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CacheKeyGenerator, type CacheConfig } from './cache-key-gen';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dir, '.cache-test-fixtures');

describe('CacheKeyGenerator', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('generate() - Bun', () => {
    test('generates cache config when bun.lockb exists', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'bun.lockb'), 'binary-lockfile-content');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('bun');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_key).toMatch(/^linux-bun-[a-f0-9]{16}$/);
      expect(config?.cache_path).toBe('~/.bun/install/cache');
      expect(config?.restore_keys).toContain('linux-bun-');
    });

    test('returns null when bun.lockb is missing', () => {
      // Arrange
      const generator = new CacheKeyGenerator(TEST_DIR, 'darwin');

      // Act
      const config = generator.generate('bun');

      // Assert
      expect(config).toBeNull();
    });

    test('generates different keys for different lockfile content', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'bun.lockb'), 'content-v1');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');
      const config1 = generator.generate('bun');

      writeFileSync(join(TEST_DIR, 'bun.lockb'), 'content-v2');
      const config2 = generator.generate('bun');

      // Assert
      expect(config1?.cache_key).not.toBe(config2?.cache_key);
    });
  });

  describe('generate() - Node', () => {
    test('generates config for npm (package-lock.json)', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'package-lock.json'), '{}');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('node');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_key).toMatch(/^linux-node-[a-f0-9]{16}$/);
      expect(config?.cache_path).toContain('~/.npm');
    });

    test('generates config for yarn (yarn.lock)', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'yarn.lock'), '# yarn lockfile');
      const generator = new CacheKeyGenerator(TEST_DIR, 'darwin');

      // Act
      const config = generator.generate('node');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_path).toContain('~/.yarn/cache');
    });

    test('generates config for pnpm (pnpm-lock.yaml)', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'pnpm-lock.yaml'), 'lockfileVersion: 5');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('node');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_path).toContain('~/.cache/pnpm');
    });

    test('returns null when no lock file exists', () => {
      // Arrange
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('node');

      // Assert
      expect(config).toBeNull();
    });
  });

  describe('generate() - Rust', () => {
    test('generates config with Cargo.lock', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'Cargo.lock'), '[[package]]');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('rust');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_key).toMatch(/^linux-rust-[a-f0-9]{16}$/);
      expect(config?.cache_path).toContain('~/.cargo/registry');
      expect(config?.cache_path).toContain('target');
    });

    test('falls back to Cargo.toml when no lock file', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'Cargo.toml'), '[package]\nname = "test"');
      const generator = new CacheKeyGenerator(TEST_DIR, 'darwin');

      // Act
      const config = generator.generate('rust');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_key).toMatch(/^darwin-rust-cargo-[a-f0-9]{16}$/);
      expect(config?.restore_keys).toContain('darwin-rust-cargo-');
    });

    test('returns null when neither Cargo.lock nor Cargo.toml exists', () => {
      // Arrange
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('rust');

      // Assert
      expect(config).toBeNull();
    });
  });

  describe('generate() - Go', () => {
    test('generates config with go.sum', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'go.sum'), 'github.com/pkg v1.0.0 h1:abc123');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('go');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_key).toMatch(/^linux-go-[a-f0-9]{16}$/);
      expect(config?.cache_path).toContain('~/go/pkg/mod');
      expect(config?.cache_path).toContain('~/.cache/go-build');
    });

    test('falls back to go.mod when no go.sum', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'go.mod'), 'module example.com/test\n\ngo 1.21');
      const generator = new CacheKeyGenerator(TEST_DIR, 'darwin');

      // Act
      const config = generator.generate('go');

      // Assert
      expect(config).not.toBeNull();
    });
  });

  describe('generate() - Python', () => {
    test('generates config with requirements.txt', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'requirements.txt'), 'flask==2.0.0\nrequests>=2.25.0');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('python');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_key).toMatch(/^linux-python-[a-f0-9]{16}$/);
      expect(config?.cache_path).toContain('~/.cache/pip');
    });

    test('prefers poetry.lock over requirements.txt', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'requirements.txt'), 'old-content');
      writeFileSync(join(TEST_DIR, 'poetry.lock'), 'new-poetry-content');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('python');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_path).toContain('~/.cache/pypoetry');
    });

    test('generates config with pyproject.toml', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'pyproject.toml'), '[project]\nname = "test"');
      const generator = new CacheKeyGenerator(TEST_DIR, 'darwin');

      // Act
      const config = generator.generate('python');

      // Assert
      expect(config).not.toBeNull();
    });
  });

  describe('generate() - Java/Gradle', () => {
    test('generates Maven config with pom.xml', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'pom.xml'), '<project></project>');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('java');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_key).toMatch(/^linux-java-maven-[a-f0-9]{16}$/);
      expect(config?.cache_path).toBe('~/.m2/repository');
    });

    test('generates Gradle config with build.gradle', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'build.gradle'), 'plugins { id "java" }');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('gradle');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_key).toMatch(/^linux-gradle-gradle-[a-f0-9]{16}$/);
      expect(config?.cache_path).toContain('~/.gradle/caches');
    });

    test('generates Gradle config with build.gradle.kts', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'build.gradle.kts'), 'plugins { kotlin("jvm") }');
      const generator = new CacheKeyGenerator(TEST_DIR, 'darwin');

      // Act
      const config = generator.generate('java');

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_path).toContain('~/.gradle/wrapper');
    });
  });

  describe('generate() - Unknown language', () => {
    test('returns null for unknown language', () => {
      // Arrange
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('unknown');

      // Assert
      expect(config).toBeNull();
    });

    test('returns null for empty language', () => {
      // Arrange
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generate('');

      // Assert
      expect(config).toBeNull();
    });
  });

  describe('OS prefix handling', () => {
    test('includes correct OS in cache key for darwin', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'bun.lockb'), 'content');
      const generator = new CacheKeyGenerator(TEST_DIR, 'darwin');

      // Act
      const config = generator.generate('bun');

      // Assert
      expect(config?.cache_key).toMatch(/^darwin-bun-/);
    });

    test('includes correct OS in cache key for win32', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'bun.lockb'), 'content');
      const generator = new CacheKeyGenerator(TEST_DIR, 'win32');

      // Act
      const config = generator.generate('bun');

      // Assert
      expect(config?.cache_key).toMatch(/^win32-bun-/);
    });
  });

  describe('generateMonorepo()', () => {
    test('adds workspace node_modules paths for bun', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'bun.lockb'), 'content');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');
      const workspaces = ['packages/core', 'packages/cli', 'apps/web'];

      // Act
      const config = generator.generateMonorepo('bun', workspaces);

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_path).toContain('packages/core/node_modules');
      expect(config?.cache_path).toContain('packages/cli/node_modules');
      expect(config?.cache_path).toContain('apps/web/node_modules');
    });

    test('adds workspace node_modules paths for node', () => {
      // Arrange
      writeFileSync(join(TEST_DIR, 'package-lock.json'), '{}');
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');
      const workspaces = ['apps/frontend'];

      // Act
      const config = generator.generateMonorepo('node', workspaces);

      // Assert
      expect(config).not.toBeNull();
      expect(config?.cache_path).toContain('apps/frontend/node_modules');
    });

    test('returns null when base generation fails', () => {
      // Arrange - no lock files
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config = generator.generateMonorepo('bun', ['packages/a']);

      // Assert
      expect(config).toBeNull();
    });
  });

  describe('hash consistency', () => {
    test('same content produces same hash', () => {
      // Arrange
      const content = 'identical-lockfile-content';
      writeFileSync(join(TEST_DIR, 'bun.lockb'), content);
      const generator = new CacheKeyGenerator(TEST_DIR, 'linux');

      // Act
      const config1 = generator.generate('bun');
      const config2 = generator.generate('bun');

      // Assert
      expect(config1?.cache_key).toBe(config2?.cache_key);
    });
  });
});
