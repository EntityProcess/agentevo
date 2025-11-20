#!/usr/bin/env tsx
/**
 * Link local subagent package for development
 * 
 * This script updates @agentv/core to use a local file reference
 * to the subagent package for real-time development testing.
 * 
 * Usage:
 *   pnpm tsx scripts/link-subagent.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, relative } from 'path';
import { execSync } from 'child_process';

const CORE_PACKAGE_PATH = 'packages/core/package.json';
const SUBAGENT_PATH = '../subagent';

function main() {
  const corePath = resolve(process.cwd(), CORE_PACKAGE_PATH);
  const subagentPath = resolve(process.cwd(), SUBAGENT_PATH);
  
  console.log('Linking local subagent package...\n');
  
  // Read core package.json
  const content = readFileSync(corePath, 'utf-8');
  const pkg = JSON.parse(content);
  
  if (!pkg.dependencies?.subagent) {
    console.error('Error: subagent dependency not found in @agentv/core');
    process.exit(1);
  }
  
  const currentVersion = pkg.dependencies.subagent;
  
  if (currentVersion.startsWith('file:')) {
    console.log('✓ Already linked to local subagent');
    console.log(`  Current: ${currentVersion}\n`);
    return;
  }
  
  // Calculate relative path from core package to subagent
  const relativePath = relative(resolve(process.cwd(), 'packages/core'), subagentPath);
  const fileReference = `file:${relativePath}`;
  
  console.log(`  From: ${currentVersion}`);
  console.log(`  To:   ${fileReference}\n`);
  
  // Update package.json
  pkg.dependencies.subagent = fileReference;
  writeFileSync(corePath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  
  console.log('✓ Updated packages/core/package.json');
  
  // Build subagent
  console.log('\nBuilding subagent...');
  try {
    execSync('pnpm build', { cwd: subagentPath, stdio: 'inherit' });
  } catch (error) {
    console.error('Warning: Failed to build subagent');
  }
  
  // Reinstall dependencies
  console.log('\nReinstalling dependencies...');
  try {
    execSync('pnpm install', { cwd: process.cwd(), stdio: 'inherit' });
  } catch (error) {
    console.error('Error: Failed to install dependencies');
    process.exit(1);
  }
  
  // Rebuild agentv
  console.log('\nRebuilding agentv...');
  try {
    execSync('pnpm build', { cwd: process.cwd(), stdio: 'inherit' });
  } catch (error) {
    console.error('Error: Failed to build agentv');
    process.exit(1);
  }
  
  console.log('\n✓ Successfully linked local subagent');
  console.log('\nDevelopment workflow:');
  console.log('  1. Make changes in subagent');
  console.log('  2. Run: cd ../subagent && pnpm build');
  console.log('  3. Run: cd ../agentv && pnpm build');
  console.log('  4. Test: pnpm agentv <command>');
  console.log('\nTo revert: pnpm tsx scripts/unlink-subagent.ts');
}

main();
