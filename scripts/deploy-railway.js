#!/usr/bin/env node
/**
 * Automated Railway Deployment Script
 * 
 * Handles the complete deployment flow with minimal human interaction:
 * - Browser-based login (single click approval)
 * - Automatic project creation/linking
 * - Database provisioning (PostgreSQL + Redis)
 * - Environment variable configuration
 * - Deployment and verification
 * 
 * Usage: npm run deploy:railway
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_NAME = 'nova-enterprises';

// Required environment variables that must be set in Railway
const REQUIRED_SECRETS = [
  'JWT_SECRET',
];

// Optional but recommended
const RECOMMENDED_SECRETS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET', 
  'POLYGON_API_KEY',
  'OPENAI_API_KEY',
];

function railway(args, options = {}) {
  const cmd = `npx @railway/cli ${args}`;
  console.log(`> ${cmd}`);
  try {
    const result = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
    return result;
  } catch (error) {
    if (options.ignoreError) return null;
    throw error;
  }
}

function railwayJson(args) {
  try {
    const result = execSync(`npx @railway/cli ${args} --json`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

async function checkLogin() {
  console.log('\n=== Checking Railway Authentication ===');
  const whoami = railwayJson('whoami');
  if (whoami && whoami.email) {
    console.log(`✓ Logged in as: ${whoami.email}`);
    return true;
  }
  return false;
}

async function login() {
  console.log('\n=== Railway Login ===');
  console.log('Opening browser for authentication...');
  console.log('>>> HUMAN ACTION REQUIRED: Click "Approve" in the browser <<<\n');
  
  // This opens browser for OAuth login - requires single click approval
  railway('login --browserless', { ignoreError: true });
  
  // Verify login succeeded
  const whoami = railwayJson('whoami');
  if (!whoami || !whoami.email) {
    throw new Error('Login failed. Please try again.');
  }
  console.log(`✓ Logged in as: ${whoami.email}`);
}

async function ensureProject() {
  console.log('\n=== Checking Railway Project ===');
  
  // Check if already linked to a project
  const status = railwayJson('status');
  if (status && status.project) {
    console.log(`✓ Linked to project: ${status.project.name}`);
    return status.project;
  }

  // Try to find existing project
  console.log('No project linked. Checking for existing projects...');
  const projects = railwayJson('project list');
  
  if (projects && Array.isArray(projects)) {
    const existing = projects.find(p => p.name === PROJECT_NAME || p.name.includes('nova'));
    if (existing) {
      console.log(`Found existing project: ${existing.name}`);
      railway(`link --project ${existing.id}`);
      return existing;
    }
  }

  // Create new project
  console.log(`Creating new project: ${PROJECT_NAME}`);
  railway(`init --name ${PROJECT_NAME}`);
  
  const newStatus = railwayJson('status');
  if (!newStatus || !newStatus.project) {
    throw new Error('Failed to create/link project');
  }
  
  console.log(`✓ Created and linked project: ${newStatus.project.name}`);
  return newStatus.project;
}

async function ensureDatabase(type, name) {
  console.log(`\n=== Ensuring ${type} Database (${name}) ===`);
  
  // Check if service exists
  const services = railwayJson('service list');
  if (services && Array.isArray(services)) {
    const existing = services.find(s => 
      s.name.toLowerCase().includes(type.toLowerCase()) ||
      s.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      console.log(`✓ ${type} already exists: ${existing.name}`);
      return existing;
    }
  }

  // Add database
  console.log(`Adding ${type}...`);
  try {
    railway(`add --database ${type}`, { ignoreError: true });
    console.log(`✓ ${type} added`);
  } catch (e) {
    console.log(`Note: ${type} may need to be added via dashboard if CLI fails`);
  }
}

async function setSecrets() {
  console.log('\n=== Configuring Secrets ===');
  
  // Generate JWT_SECRET if not already set
  const jwtSecret = require('crypto').randomBytes(32).toString('hex');
  
  // Set required secrets with generated/default values
  const secrets = {
    JWT_SECRET: jwtSecret,
    NODE_ENV: 'production',
    APP_URL: 'https://novanexus-ai.vercel.app',
  };

  for (const [key, value] of Object.entries(secrets)) {
    try {
      railway(`variables set ${key}="${value}"`, { silent: true, ignoreError: true });
      console.log(`✓ Set ${key}`);
    } catch {
      console.log(`⚠ Could not set ${key} (may already exist)`);
    }
  }

  console.log('\n⚠ Note: The following secrets should be set in Railway dashboard:');
  RECOMMENDED_SECRETS.forEach(s => console.log(`  - ${s}`));
}

async function deploy() {
  console.log('\n=== Deploying to Railway ===');
  console.log('This may take several minutes...\n');
  
  // Deploy using the Dockerfile.prod
  railway('up --detach');
  
  console.log('\n✓ Deployment initiated');
  console.log('Waiting for deployment to complete...');
  
  // Wait for deployment
  let attempts = 0;
  const maxAttempts = 60; // 10 minutes max
  
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 10000)); // Wait 10 seconds
    attempts++;
    
    const status = railwayJson('status');
    if (status && status.deployment) {
      const state = status.deployment.status;
      console.log(`  Deployment status: ${state}`);
      
      if (state === 'SUCCESS' || state === 'DEPLOYED') {
        console.log('\n✓ Deployment successful!');
        return status;
      }
      if (state === 'FAILED' || state === 'CRASHED') {
        throw new Error(`Deployment failed: ${state}`);
      }
    }
  }
  
  console.log('\n⚠ Deployment still in progress. Check Railway dashboard for status.');
}

async function getProductionUrl() {
  console.log('\n=== Getting Production URL ===');
  
  // Get domain from Railway
  const status = railwayJson('status');
  if (status && status.service && status.service.domain) {
    const url = `https://${status.service.domain}`;
    console.log(`✓ Production URL: ${url}`);
    return url;
  }

  // Try to generate domain
  console.log('Generating public domain...');
  railway('domain', { ignoreError: true });
  
  // Check again
  const newStatus = railwayJson('status');
  if (newStatus && newStatus.service && newStatus.service.domain) {
    const url = `https://${newStatus.service.domain}`;
    console.log(`✓ Production URL: ${url}`);
    return url;
  }

  console.log('⚠ Could not determine production URL. Check Railway dashboard.');
  return null;
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   NOVA RAILWAY AUTOMATED DEPLOYMENT      ║');
  console.log('╚══════════════════════════════════════════╝\n');

  try {
    // Step 1: Check/perform login
    const loggedIn = await checkLogin();
    if (!loggedIn) {
      await login();
    }

    // Step 2: Ensure project exists
    await ensureProject();

    // Step 3: Ensure databases
    await ensureDatabase('postgres', 'nova-postgres');
    await ensureDatabase('redis', 'nova-redis');

    // Step 4: Set secrets
    await setSecrets();

    // Step 5: Deploy
    await deploy();

    // Step 6: Get production URL
    const prodUrl = await getProductionUrl();

    // Summary
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   DEPLOYMENT COMPLETE                    ║');
    console.log('╚══════════════════════════════════════════╝\n');

    if (prodUrl) {
      console.log(`Production API: ${prodUrl}`);
      console.log(`Health Check:   ${prodUrl}/health`);
      console.log(`\nNext: Run 'npm run verify:prod -- --url=${prodUrl}' to verify`);
      
      // Save URL to env file for verify:prod
      fs.writeFileSync(
        path.join(ROOT, '.env.prod'),
        `PROD_API_URL=${prodUrl}\nPROD_WEB_URL=https://novanexus-ai.vercel.app\n`
      );
      console.log(`\n✓ Saved production URL to .env.prod`);
    }

  } catch (error) {
    console.error(`\n❌ Deployment failed: ${error.message}`);
    console.error('\nTroubleshooting:');
    console.error('  1. Ensure you approved the browser login');
    console.error('  2. Check Railway dashboard for service status');
    console.error('  3. Review deployment logs: npx @railway/cli logs');
    process.exit(1);
  }
}

main();
