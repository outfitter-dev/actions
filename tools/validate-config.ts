#!/usr/bin/env bun

import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';

// Define the schema for .ci.json
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

export type CIConfig = z.infer<typeof CIConfigSchema>;

export class ConfigValidator {
  validate(configPath: string): { valid: boolean; config?: CIConfig; errors?: string[] } {
    if (!existsSync(configPath)) {
      return { valid: false, errors: [`Config file not found: ${configPath}`] };
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const data = JSON.parse(content);
      
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
        return { valid: false, errors: [`Invalid JSON: ${error.message}`] };
      }
      return { valid: false, errors: [`Failed to read config: ${error}`] };
    }
  }

  generateDefault(): CIConfig {
    return {
      timeout_minutes: 30,
      outputs: {
        comment: false,
        webhook: false,
      },
    };
  }

  generateExample(): string {
    const example: CIConfig = {
      force: 'essential',
      timeout_minutes: 45,
      ignore: ['**/*.md', 'docs/**'],
      critical_globs: [
        'packages/**/package.json',
        '**/schema.*',
        '.github/**',
        '**/Cargo.toml',
      ],
      outputs: {
        comment: true,
        webhook: false,
      },
    };

    return JSON.stringify(example, null, 2);
  }
}

// CLI interface
if (import.meta.main) {
  const command = process.argv[2];
  const validator = new ConfigValidator();

  switch (command) {
    case 'validate': {
      const configPath = process.argv[3] || '.ci.json';
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
      console.log(JSON.stringify(validator.generateDefault(), null, 2));
      break;
    }

    default:
      console.error('Usage: validate-config.ts <command> [options]');
      console.error('Commands:');
      console.error('  validate [path]  - Validate a .ci.json file');
      console.error('  generate         - Generate an example config');
      console.error('  default          - Show default config');
      process.exit(1);
  }
}