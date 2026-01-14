#!/usr/bin/env node

/**
 * 构建原生模块脚本
 * 确保 better-sqlite3 和 electron 的原生模块被正确构建
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔨 开始构建原生模块...\n');

// 使用 electron-rebuild 重新编译 better-sqlite3（使用 Electron 的 Node.js 版本）
console.log('📦 使用 Electron 的 Node.js 重新编译 better-sqlite3...');
try {
  execSync('pnpm exec electron-rebuild -f -w better-sqlite3', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ better-sqlite3 构建完成（使用 Electron Node.js）\n');
} catch (error) {
  console.error('❌ better-sqlite3 构建失败:', error.message);
  process.exit(1);
}

// 检查并构建 electron
const electronPath = path.join(
  process.cwd(),
  'node_modules/.pnpm/electron@39.2.7/node_modules/electron'
);

if (fs.existsSync(electronPath)) {
  const electronExe = process.platform === 'win32' 
    ? path.join(electronPath, 'dist/electron.exe')
    : path.join(electronPath, 'dist/Electron.app/Contents/MacOS/Electron');
  
  if (!fs.existsSync(electronExe)) {
    console.log('📦 构建 electron...');
    try {
      process.chdir(electronPath);
      execSync('node install.js', { 
        stdio: 'inherit',
        env: { ...process.env, ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' }
      });
      console.log('✅ electron 构建完成\n');
    } catch (error) {
      console.error('❌ electron 构建失败:', error.message);
      process.exit(1);
    }
  } else {
    console.log('✅ electron 已构建\n');
  }
} else {
  console.log('⚠️  electron 路径未找到，跳过构建\n');
}

console.log('✨ 原生模块构建完成！');
