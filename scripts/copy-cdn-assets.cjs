const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const targets = [
  path.resolve(rootDir, '..', 'embedkit-cdn'),
  path.resolve(rootDir, '..', 'embedkit-cdn-bitbucket', 'public'),
];

if (!fs.existsSync(distDir)) {
  console.error(`Missing dist directory: ${distDir}`);
  process.exit(1);
}

const files = fs.readdirSync(distDir).filter((name) => name.startsWith('embedkit-cdn.'));
if (files.length === 0) {
  console.error('No embedkit-cdn assets found in dist.');
  process.exit(1);
}

for (const targetDir of targets) {
  fs.mkdirSync(targetDir, { recursive: true });

  // Remove existing embedkit-cdn.* files before copying
  for (const existing of fs.readdirSync(targetDir)) {
    if (existing.startsWith('embedkit-cdn.')) {
      fs.rmSync(path.join(targetDir, existing));
    }
  }

  for (const file of files) {
    fs.copyFileSync(path.join(distDir, file), path.join(targetDir, file));
  }

  // Keep backwards-compat alias so existing customer script tags don't break
  const umdJs = path.join(targetDir, 'embedkit-cdn.umd.js');
  const umdCjs = path.join(targetDir, 'embedkit-cdn.umd.cjs');
  if (fs.existsSync(umdJs) && !fs.existsSync(umdCjs)) {
    fs.copyFileSync(umdJs, umdCjs);
    console.log(`  Created backwards-compat alias: embedkit-cdn.umd.cjs`);
  }

  console.log(`Copied ${files.length} file(s) to ${targetDir}`);
}
