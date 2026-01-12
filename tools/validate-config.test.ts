import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigValidator, type CIConfig } from './validate-config';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dir, '.test-fixtures');

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
    // Create test fixtures directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test fixtures
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('validate() - Happy Path', () => {
    test('parses valid minimal TOML config', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.toml');
      writeFileSync(configPath, 'force = "minimal"');

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.config?.force).toBe('minimal');
      expect(result.errors).toBeUndefined();
    });

    test('parses valid full TOML config with all fields', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.toml');
      const content = `
force = "essential"
timeout_minutes = 45

ignore = [
  "**/*.md",
  "docs/**",
]

critical_globs = [
  "packages/**/package.json",
  ".github/**",
]

[outputs]
comment = true
webhook = false
`;
      writeFileSync(configPath, content);

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.config).toEqual({
        force: 'essential',
        timeout_minutes: 45,
        ignore: ['**/*.md', 'docs/**'],
        critical_globs: ['packages/**/package.json', '.github/**'],
        outputs: {
          comment: true,
          webhook: false,
        },
      });
    });

    test('parses valid JSON config', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.json');
      const content = JSON.stringify({
        force: 'full',
        timeout_minutes: 60,
        outputs: { comment: true },
      });
      writeFileSync(configPath, content);

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.config?.force).toBe('full');
      expect(result.config?.timeout_minutes).toBe(60);
    });

    test('parses empty config as valid (all fields optional)', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.toml');
      writeFileSync(configPath, '');

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.config).toEqual({});
    });
  });

  describe('validate() - Error Cases', () => {
    test('returns error for missing file', () => {
      // Arrange
      const configPath = join(TEST_DIR, 'nonexistent.toml');

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toContain('Config file not found');
    });

    test('returns error for invalid TOML syntax', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.toml');
      writeFileSync(configPath, 'force = invalid-without-quotes');

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      // TOML library throws TomlError, caught in generic error handler
      expect(result.errors?.some(e => e.includes('Failed to read config'))).toBe(true);
    });

    test('returns error for invalid JSON syntax', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.json');
      writeFileSync(configPath, '{ force: "minimal" }'); // Missing quotes on key

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('validate() - Schema Validation', () => {
    test('rejects invalid force value', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.toml');
      writeFileSync(configPath, 'force = "invalid"');

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.includes('force'))).toBe(true);
    });

    test('rejects timeout_minutes below minimum (5)', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.toml');
      writeFileSync(configPath, 'timeout_minutes = 2');

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.includes('timeout_minutes'))).toBe(true);
    });

    test('rejects timeout_minutes above maximum (120)', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.toml');
      writeFileSync(configPath, 'timeout_minutes = 200');

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.includes('timeout_minutes'))).toBe(true);
    });

    test('rejects unknown fields (strict mode)', () => {
      // Arrange
      const configPath = join(TEST_DIR, '.ci.toml');
      writeFileSync(configPath, 'unknown_field = "value"');

      // Act
      const result = validator.validate(configPath);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    test('accepts valid force enum values', () => {
      const validValues: Array<CIConfig['force']> = ['full', 'essential', 'minimal'];

      for (const value of validValues) {
        // Arrange
        const configPath = join(TEST_DIR, '.ci.toml');
        writeFileSync(configPath, `force = "${value}"`);

        // Act
        const result = validator.validate(configPath);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.config?.force).toBe(value);
      }
    });
  });

  describe('generateDefault()', () => {
    test('returns valid default config', () => {
      // Act
      const config = validator.generateDefault();

      // Assert
      expect(config.timeout_minutes).toBe(30);
      expect(config.outputs?.comment).toBe(false);
      expect(config.outputs?.webhook).toBe(false);
    });
  });

  describe('generateExample()', () => {
    test('returns non-empty example TOML string', () => {
      // Act
      const example = validator.generateExample();

      // Assert
      expect(typeof example).toBe('string');
      expect(example.length).toBeGreaterThan(0);
      expect(example).toContain('force');
      expect(example).toContain('timeout_minutes');
      expect(example).toContain('[outputs]');
    });
  });
});
