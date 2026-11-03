/**
 * Mezoteric Export & Deployment Script
 * 
 * Compiles the Next.js frontend with static export and deploys it
 * into the Mezoteric server's public/ directory so that:
 * 1. The local school Node server (server/index.js) serves the modern Next.js frontend
 * 2. Works completely offline on the school LAN with zero external cloud dependencies
 * 3. Supports self-signed HTTPS certificates for WebCrypto, camera, and microphone
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(FRONTEND_DIR, 'out');
const TARGET_PUBLIC = path.resolve(__dirname, '../../public');

console.log('🚀 Building Next.js Static Export for Mezoteric School LAN...');

try {
  // Execute next build with export mode enabled
  execSync('npx next build', {
    cwd: FRONTEND_DIR,
    stdio: 'inherit',
    env: { ...process.env, NEXT_EXPORT: 'true' },
  });

  if (!fs.existsSync(OUT_DIR)) {
    console.error('❌ Build failed: output directory does not exist:', OUT_DIR);
    process.exit(1);
  }

  console.log('📦 Copying exported assets to server/public directory...');

  // Copy recursive function
  function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  copyRecursive(OUT_DIR, TARGET_PUBLIC);
  console.log('✅ Successfully deployed Next.js build to server/public!');
  console.log('🎉 Start the school LAN server with: npm start');
} catch (err) {
  console.error('❌ Build/Export error:', err.message);
  process.exit(1);
}
