#!/usr/bin/env node
/**
 * Production Deployment Script
 * Deploys to Railway production environment via CLI.
 * 
 * Usage:
 *   npm run deploy:prod
 */
const { execSync, spawn } = require('child_process');
const path = require('path');

const PROJECT_NAME = 'novanexus-backend';
const ENVIRONMENT = 'production';
const SERVICE = 'abackend';

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
  } catch (error) {
    if (options.ignoreError) return '';
    throw error;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   NOVA PRODUCTION DEPLOYMENT         ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Get local git info
  let localCommit = 'unknown';
  let localBranch = 'unknown';
  try {
    localCommit = exec('git rev-parse HEAD');
    localBranch = exec('git rev-parse --abbrev-ref HEAD');
  } catch (e) {
    console.warn('⚠️  Could not determine git info');
  }

  console.log(`📦 Project: ${PROJECT_NAME}`);
  console.log(`🌍 Environment: ${ENVIRONMENT}`);
  console.log(`🔧 Service: ${SERVICE}`);
  console.log(`📝 Local commit: ${localCommit.substring(0, 7)} (${localBranch})`);
  console.log(`📝 Full SHA: ${localCommit}\n`);

  // Check Railway CLI
  try {
    const version = exec('npx @railway/cli --version');
    console.log(`✅ Railway CLI: ${version}`);
  } catch (e) {
    console.error('❌ Railway CLI not available. Install with: npm install -g @railway/cli');
    process.exit(1);
  }

  // Check login status
  try {
    const whoami = exec('npx @railway/cli whoami');
    console.log(`✅ Logged in as: ${whoami}`);
  } catch (e) {
    console.error('❌ Not logged in. Run: npx @railway/cli login');
    process.exit(1);
  }

  // Link to project
  console.log(`\n🔗 Linking to ${PROJECT_NAME}...`);
  try {
    exec(`npx @railway/cli link --project ${PROJECT_NAME} --environment ${ENVIRONMENT} --service ${SERVICE}`, {
      cwd: path.resolve(__dirname, '..'),
    });
    console.log('✅ Linked successfully');
  } catch (e) {
    console.error('❌ Failed to link project. You may need to run: npx @railway/cli link');
    process.exit(1);
  }

  // Deploy
  console.log('\n🚀 Deploying to Railway...\n');
  const startTime = Date.now();

  try {
    const result = exec('npx @railway/cli up --detach', {
      cwd: path.resolve(__dirname, '..'),
    });
    console.log(result);

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ Deployment initiated in ${duration}s`);

    // Extract deployment ID from output
    const deployIdMatch = result.match(/id=([a-f0-9-]+)/);
    if (deployIdMatch) {
      console.log(`\n📋 Deployment ID: ${deployIdMatch[1]}`);
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('DEPLOYMENT SUBMITTED');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Commit:      ${localCommit.substring(0, 7)}`);
    console.log(`Full SHA:    ${localCommit}`);
    console.log(`Branch:      ${localBranch}`);
    console.log(`Time:        ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════');

    console.log('\n⏳ Deployment is building. Wait 2-3 minutes, then run:');
    console.log('   npm run verify:prod');
    console.log('\n📊 Build logs: https://railway.com/project/' + PROJECT_NAME);

  } catch (e) {
    console.error('❌ Deployment failed:', e.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n❌ Deploy error: ${err.message}`);
  process.exit(1);
});
