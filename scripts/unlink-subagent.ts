#!/usr/bin/env tsx
/**
 * Unlink local subagent package and revert to npm version
 * 
 * This script reverts @agentv/core to use the latest published
 * version of subagent from npm.
 * 
 * Usage:
 *   pnpm tsx scripts/unlink-subagent.ts
 *   pnpm tsx scripts/unlink-subagent.ts --version 0.4.2
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const CORE_PACKAGE_PATH = 'packages/core/package.json';

function getLatestVersion(packageName: string): string {
  try {
    const output = execSync(`npm view ${packageName} version`, { encoding: 'utf-8' });
    return output.trim();
  } catch (error) {
    console.error(`Warning: Could not fetch latest version for ${packageName}`);
    return '';
  }
}

function main() {
  const args = process.argv.slice(2);
  const versionIndex = args.indexOf('--version');
  let targetVersion: string | null = null;
  
  if (versionIndex !== -1 && args[versionIndex + 1]) {
    targetVersion = args[versionIndex + 1];
  }
  
  console.log('Unlinking local subagent package...\n');
  
  const corePath = resolve(process.cwd(), CORE_PACKAGE_PATH);
  
  // Read core package.json
  const content = readFileSync(corePath, 'utf-8');
  const pkg = JSON.parse(content);
  
  if (!pkg.dependencies?.subagent) {
    console.error('Error: subagent dependency not found in @agentv/core');
    process.exit(1);
  }
  
  const currentVersion = pkg.dependencies.subagent;
  
  if (!currentVersion.startsWith('file:')) {
    console.log('✓ Already using npm version');
    console.log(`  Current: ${currentVersion}\n`);
    return;
  }
  
  // Determine target version
  if (!targetVersion) {
    console.log('Fetching latest version from npm...');
    targetVersion = getLatestVersion('subagent');
    if (!targetVersion) {
      console.error('Error: Could not determine target version');
      console.error('Please specify version manually: --version 0.4.2');
      process.exit(1);
    }
  }
  
  const npmVersion = `^${targetVersion}`;
  
  console.log(`  From: ${currentVersion}`);
  console.log(`  To:   ${npmVersion}\n`);
  
  // Update package.json
  pkg.dependencies.subagent = npmVersion;
  writeFileSync(corePath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  
  console.log('✓ Updated packages/core/package.json');
  
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
  
  console.log(`\n✓ Successfully reverted to npm version ${targetVersion}`);
  console.log('\nTo link local version again: pnpm tsx scripts/link-subagent.ts');
}

main();
