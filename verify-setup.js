// ZhiXu ACOP - Portable Setup Verifier (English-only for cross-platform safety)
// 知墟 ACOP 便携启动脚本验证器

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(__filename);

console.log('='.repeat(60));
console.log('  ZhiXu ACOP - Portable Setup Verifier');
console.log('='.repeat(60));
console.log('');

// === Step 1: Check runtime ===
console.log('[Step 1/6] Runtime environment...');
try {
  const nodeVer = execSync('node --version', { encoding: 'utf-8' }).trim();
  console.log('   [OK] Node.js ' + nodeVer);
} catch(e) {
  console.log('   [FAIL] Node.js not found');
  process.exit(1);
}

try {
  const npmVer = execSync('npm --version', { encoding: 'utf-8' }).trim();
  console.log('   [OK] npm ' + npmVer);
} catch(e) {
  console.log('   [FAIL] npm not found');
}

// === Step 2: Check package.json ===
console.log('');
console.log('[Step 2/6] Project configuration...');
const pkgPath = path.join(projectRoot, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  console.log('   [OK] package.json found: ' + pkg.name + ' v' + pkg.version);
} else {
  console.log('   [FAIL] package.json not found');
}

// === Step 3: Check dependencies ===
console.log('');
console.log('[Step 3/6] Dependencies installed...');
const deps = [
  { name: 'express', file: 'node_modules/express/package.json' },
  { name: 'react',   file: 'node_modules/react/package.json' },
  { name: 'vite',    file: 'node_modules/vite/package.json' },
  { name: 'tsx',     file: 'node_modules/tsx/package.json' },
];

let allDepsOK = true;
for (const dep of deps) {
  const fp = path.join(projectRoot, dep.file);
  if (fs.existsSync(fp)) {
    try {
      const d = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      console.log('   [OK] ' + dep.name + ' v' + d.version);
    } catch(e) {
      console.log('   [OK] ' + dep.name + ' installed');
    }
  } else {
    console.log('   [WARN] ' + dep.name + ' NOT installed');
    allDepsOK = false;
  }
}

// === Step 4: Check source code files ===
console.log('');
console.log('[Step 4/6] Source code files...');
const srcFiles = [
  'src/server/index.ts',
  'src/server/services/adapterService.ts',
  'src/client/src/App.tsx',
  'src/client/src/pages/Dashboard.tsx',
];
for (const sf of srcFiles) {
  const fp = path.join(projectRoot, sf);
  if (fs.existsSync(fp)) {
    console.log('   [OK] ' + sf);
  } else {
    console.log('   [WARN] Missing: ' + sf);
  }
}

// === Step 5: Check ports ===
console.log('');
console.log('[Step 5/6] Port availability...');
const netstat = execSync('netstat -ano', { encoding: 'utf-8' });
for (const port of [3000, 3001]) {
  const used = new RegExp(':' + port + '.*LISTENING', 'm').test(netstat);
  console.log('   ' + (used ? '[INFO] Port ' + port + ' in use (service may be running)' : '[OK] Port ' + port + ' available'));
}

// === Step 6: Check portable batch files ===
console.log('');
console.log('[Step 6/6] Portable batch files...');
const batFiles = [
  { name: '启动.bat',         desc: 'Main launcher (starts both front+backend)' },
  { name: '安装依赖.bat',     desc: 'Dependency installer (run first time)' },
  { name: '停止.bat',         desc: 'Service stopper' },
  { name: 'README.txt',      desc: 'User guide / instructions' },
];
for (const bf of batFiles) {
  const fp = path.join(projectRoot, bf.name);
  if (fs.existsSync(fp)) {
    const size = fs.statSync(fp).size;
    console.log('   [OK] ' + bf.name + ' (' + Math.round(size/1024*10)/10 + ' KB) - ' + bf.desc);
  } else {
    console.log('   [FAIL] Missing: ' + bf.name);
  }
}

console.log('');
console.log('='.repeat(60));
console.log('  Verification complete!');
console.log('='.repeat(60));
console.log('');

if (allDepsOK) {
  console.log('  All dependencies are installed.');
  console.log('  To start the platform, double-click: ');
  console.log('    [启动.bat]');
} else {
  console.log('  Dependencies not fully installed.');
  console.log('  Please run first: ');
  console.log('    [安装依赖.bat]');
}

console.log('');
console.log('  Frontend URL:  http://localhost:3000');
console.log('  Backend  URL:  http://localhost:3001');
console.log('  Health check:  http://localhost:3001/api/health');
console.log('');
console.log('  To stop the service, double-click:');
console.log('    [停止.bat]');
console.log('');
