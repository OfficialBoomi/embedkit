const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const targetDir = path.resolve(rootDir, '..', 'embedkit-cdn', 'public');

if (!fs.existsSync(distDir)) {
  console.error(`Missing dist directory: ${distDir}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });

const files = fs.readdirSync(distDir).filter((name) => name.startsWith('embedkit-cdn.'));
if (files.length === 0) {
  console.error('No embedkit-cdn assets found in dist.');
  process.exit(1);
}

for (const file of files) {
  const from = path.join(distDir, file);
  const to = path.join(targetDir, file);
  fs.copyFileSync(from, to);
}

console.log(`Copied ${files.length} file(s) to ${targetDir}`);
