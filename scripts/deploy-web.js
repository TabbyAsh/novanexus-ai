#!/usr/bin/env node
/**
 * Web (Vercel) Deployment Script
 * Deploys the Next.js frontend to Vercel production.
 * 
 * Usage:
 *   npm run deploy:web
 */
const { execSync } = require('child_process');
const path = require('path');

const WEB_DIR = path.resolve(__dirname, '../apps/web');

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, { 
      encoding: 'utf8', 
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.cwd || WEB_DIR,
      ...options 
    }).trim();
  } catch (error) {
    if (options.ignoreError) return '';
    throw error;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   NOVA WEB DEPLOYMENT (VERCEL)       ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Get local git info
  let localCommit = 'unknown';
  let localBranch = 'unknown';
  try {
    localCommit = exec('git rev-parse HEAD', { cwd: path.resolve(__dirname, '..') });
    localBranch = exec('git rev-parse --abbrev-ref HEAD', { cwd: path.resolve(__dirname, '..') });
  } catch (e) {
    console.warn('⚠️  Could not determine git info');
  }

  console.log(`📦 App: apps/web (Next.js)`);
  console.log(`🌍 Target: Vercel Production`);
  console.log(`📝 Local commit: ${localCommit.substring(0, 7)} (${localBranch})`);
  console.log(`📝 Full SHA: ${localCommit}\n`);

  // Check Vercel CLI
  try {
    const version = exec('npx vercel --version', { cwd: WEB_DIR });
    console.log(`✅ Vercel CLI: ${version}`);
  } catch (e) {
    console.error('❌ Vercel CLI not available. Install with: npm install -g vercel');
    process.exit(1);
  }

  // Check login status
  try {
    const whoami = exec('npx vercel whoami', { cwd: WEB_DIR });
    console.log(`✅ Logged in as: ${whoami}`);
  } catch (e) {
    console.error('❌ Not logged in. Run: npx vercel login');
    process.exit(1);
  }

  // Deploy to production with GIT_SHA
  console.log('\n🚀 Deploying to Vercel production...\n');
  const startTime = Date.now();

  try {
    // Note: VERCEL_GIT_COMMIT_SHA is auto-set by Vercel for git-based deploys.
    // For CLI deploys, we need to use `vercel env add` or set build env vars in project settings.
    // The --env flag in vercel CLI is for runtime env vars, not build-time.
    // Our next.config.js will use VERCEL_GIT_COMMIT_SHA when available.
    
    // Deploy to production (--prod flag)
    // Using execSync with inherit stdio so output streams in real-time
    execSync(`npx vercel --prod --yes`, { 
      cwd: WEB_DIR,
      stdio: 'inherit',
      env: { ...process.env, GIT_SHA: localCommit }
    });

    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('WEB DEPLOYMENT COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Commit:      ${localCommit.substring(0, 7)}`);
    console.log(`Full SHA:    ${localCommit}`);
    console.log(`Branch:      ${localBranch}`);
    console.log(`Duration:    ${duration}s`);
    console.log(`Time:        ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════');

    console.log('\n✅ Web deployment complete!');
    console.log('🔍 Verify at: https://nova-enterprises.vercel.app/dashboard');
    console.log('   Check footer for version: v' + localCommit.substring(0, 7));

  } catch (e) {
    console.error('❌ Deployment failed:', e.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n❌ Deploy error: ${err.message}`);
  process.exit(1);
});
