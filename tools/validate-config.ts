#!/usr/bin/env bun

/**
 * @fileoverview Validation utilities for Belay CI configuration files.
 *
 * This module provides Zod-based schema validation for `.ci.toml` and `.ci.json`
 * configuration files, along with utilities to generate example and default configs.
 *
 * @example
 * ```ts
 * import { ConfigValidator, CIConfigSchema, type CIConfig } from './validate-config';
 *
 * const validator = new ConfigValidator();
 * const result = validator.validate('.ci.toml');
 * if (result.valid) {
 *   console.log('Config:', result.config);
 * }
 * ```
 */

import { z } from 'zod';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import * as TOML from '@iarna/toml';

/**
 * Zod schema for Belay CI configuration files.
 *
 * Validates the structure and types of `.ci.toml` or `.ci.json` files.
 * Uses strict mode to reject unknown properties.
 *
 * @example
 * ```ts
 * import { CIConfigSchema } from './validate-config';
 *
 * const result = CIConfigSchema.safeParse({
 *   force: 'essential',
 *   timeout_minutes: 45,
 * });
 *
 * if (result.success) {
 *   console.log('Valid config:', result.data);
 * } else {
 *   console.error('Validation errors:', result.error.errors);
 * }
 * ```
 */
const CIConfigSchema = z.object({
  force: z.enum(['full', 'essential', 'minimal']).optional(),
  timeout_minutes: z.number().min(5).max(120).optional(),
  ignore: z.array(z.string()).optional(),
  critical_globs: z.array(z.string()).optional(),
  outputs: z.object({
    comment: z.boolean().optional(),
    webhook: z.boolean().optional(),
  }).optional(),
}).strict();

/**
 * TypeScript type inferred from the CIConfigSchema.
 *
 * Use this type when working with validated CI configuration objects.
 *
 * @example
 * ```ts
 * import type { CIConfig } from './validate-config';
 *
 * function processConfig(config: CIConfig): void {
 *   if (config.force === 'full') {
 *     console.log('Running full CI');
 *   }
 * }
 * ```
 */
export type CIConfig = z.infer<typeof CIConfigSchema>;

/**
 * Validates and generates Belay CI configuration files.
 *
 * Provides methods to validate existing config files, generate example
 * configurations, and create default configurations.
 *
 * @example
 * ```ts
 * const validator = new ConfigValidator();
 *
 * // Validate existing config
 * const result = validator.validate('.ci.toml');
 * if (!result.valid) {
 *   console.error('Errors:', result.errors);
 * }
 *
 * // Generate example config
 * const example = validator.generateExample();
 * console.log(example);
 * ```
 */
export class ConfigValidator {
  /**
   * Validates a CI configuration file.
   *
   * Reads the file at the specified path, parses it as TOML or JSON based on
   * extension, and validates it against the CIConfigSchema.
   *
   * @param configPath - Path to the configuration file (`.ci.toml` or `.ci.json`)
   * @returns Validation result with `valid` flag, parsed `config` if valid, or `errors` array
   *
   * @example
   * ```ts
   * const validator = new ConfigValidator();
   * const result = validator.validate('.ci.toml');
   *
   * if (result.valid) {
   *   console.log('Timeout:', result.config?.timeout_minutes);
   * } else {
   *   result.errors?.forEach(err => console.error(err));
   * }
   * ```
   */
  validate(configPath: string): { valid: boolean; config?: CIConfig; errors?: string[] } {
    if (!existsSync(configPath)) {
      return { valid: false, errors: [`Config file not found: ${configPath}`] };
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      let data: unknown;

      // Parse based on file extension
      if (configPath.endsWith('.toml')) {
        data = TOML.parse(content);
      } else if (configPath.endsWith('.json')) {
        data = JSON.parse(content) as unknown;
      } else {
        // Default to TOML
        data = TOML.parse(content);
      }

      const result = CIConfigSchema.safeParse(data);
      
      if (result.success) {
        return { valid: true, config: result.data };
      } else {
        const errors = result.error.errors.map(err => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });
        return { valid: false, errors };
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        return { valid: false, errors: [`Invalid TOML/JSON: ${error.message}`] };
      }
      return { valid: false, errors: [`Failed to read config: ${error}`] };
    }
  }

  /**
   * Generates a default CI configuration object.
   *
   * Returns a minimal configuration with sensible defaults that can be
   * serialized to TOML or JSON.
   *
   * @returns Default CIConfig object
   *
   * @example
   * ```ts
   * const validator = new ConfigValidator();
   * const config = validator.generateDefault();
   * console.log(config.timeout_minutes); // 30
   * ```
   */
  generateDefault(): CIConfig {
    return {
      timeout_minutes: 30,
      outputs: {
        comment: false,
        webhook: false,
      },
    };
  }

  /**
   * Generates an example `.ci.toml` configuration file content.
   *
   * Returns a commented TOML string demonstrating all available options
   * with typical values. Useful for bootstrapping new configurations.
   *
   * @returns TOML-formatted string with example configuration
   *
   * @example
   * ```ts
   * const validator = new ConfigValidator();
   * const example = validator.generateExample();
   * writeFileSync('.ci.toml', example);
   * ```
   */
  generateExample(): string {
    const exampleToml = `# Belay CI configuration (TOML)
# Preferred format

force = "essential"          # "full" | "essential" | "minimal"
timeout_minutes = 45

ignore = [
  "**/*.md",
  "docs/**",
]

critical_globs = [
  "packages/**/package.json",
  "**/schema.*",
  ".github/**",
  "**/Cargo.toml",
]

[outputs]
comment = true
webhook = false
`;

    return exampleToml;
  }
}

// CLI interface
if (import.meta.main) {
  const command = process.argv[2];
  const validator = new ConfigValidator();

  switch (command) {
    case 'validate': {
      const configPath = process.argv[3] || '.ci.toml';
      const result = validator.validate(configPath);
      
      if (result.valid) {
        console.log('✅ Config is valid');
        console.log(JSON.stringify(result.config, null, 2));
        process.exit(0);
      } else {
        console.error('❌ Config validation failed:');
        result.errors?.forEach(err => console.error(`  - ${err}`));
        process.exit(1);
      }
      break;
    }

    case 'generate': {
      console.log(validator.generateExample());
      break;
    }

    case 'default': {
      const defaultConfig = validator.generateDefault();
      // CIConfig is a plain object compatible with TOML's JsonMap type
      const toml = TOML.stringify(defaultConfig as TOML.JsonMap);
      console.log(toml);
      break;
    }

    default:
      console.error('Usage: validate-config.ts <command> [options]');
      console.error('Commands:');
      console.error('  validate [path]  - Validate a .ci.toml file');
      console.error('  generate         - Generate an example .ci.toml config');
      console.error('  default          - Show default config in TOML format');
      process.exit(1);
  }
}
