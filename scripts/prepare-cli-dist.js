const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distCliDir = path.join(rootDir, 'dist/apps/interface-cli');
const targetAppsDir = path.join(distCliDir, 'apps');

const backendApps = ['gpt-auto-api', 'mcp-gateway', 'local-mcp-bridge'];

console.log('📦 Preparing self-contained dist for @ducy23061999/browcall-cli...');

if (!fs.existsSync(distCliDir)) {
  console.error(`❌ Error: ${distCliDir} does not exist. Please run "nx build interface-cli" first.`);
  process.exit(1);
}

// Ensure target apps directory exists
if (!fs.existsSync(targetAppsDir)) {
  fs.mkdirSync(targetAppsDir, { recursive: true });
}

// Copy built backend apps into dist/apps/interface-cli/apps/
for (const appName of backendApps) {
  const srcAppDir = path.join(rootDir, 'dist/apps', appName);
  const destAppDir = path.join(targetAppsDir, appName);

  if (fs.existsSync(srcAppDir)) {
    console.log(`  └─ Copying ${appName} from ${srcAppDir} -> ${destAppDir}`);
    fs.cpSync(srcAppDir, destAppDir, { recursive: true });
  } else {
    console.warn(`  ⚠️ Warning: Built folder for "${appName}" not found at ${srcAppDir}. Skipping copy.`);
  }
}

// Copy package.json to dist/apps/interface-cli/package.json
const srcPackageJson = path.join(rootDir, 'apps/interface-cli/package.json');
const destPackageJson = path.join(distCliDir, 'package.json');
if (fs.existsSync(srcPackageJson)) {
  fs.copyFileSync(srcPackageJson, destPackageJson);
  console.log(`  └─ Copied package.json to ${destPackageJson}`);
}

// Copy mcp-config.sample.json to dist/apps/interface-cli/mcp-config.sample.json
const srcMcpSample = path.join(rootDir, 'mcp-config.sample.json');
const destMcpSample = path.join(distCliDir, 'mcp-config.sample.json');
if (fs.existsSync(srcMcpSample)) {
  fs.copyFileSync(srcMcpSample, destMcpSample);
  console.log(`  └─ Copied mcp-config.sample.json to ${destMcpSample}`);
}

// Copy README.md to dist/apps/interface-cli/README.md (prefer apps/interface-cli/README.md)
const cliReadme = path.join(rootDir, 'apps/interface-cli/README.md');
const rootReadme = path.join(rootDir, 'README.md');
const destReadme = path.join(distCliDir, 'README.md');

if (fs.existsSync(cliReadme)) {
  fs.copyFileSync(cliReadme, destReadme);
  console.log(`  └─ Copied CLI README.md from ${cliReadme} to ${destReadme}`);
} else if (fs.existsSync(rootReadme)) {
  fs.copyFileSync(rootReadme, destReadme);
  console.log(`  └─ Copied root README.md to ${destReadme}`);
}

// Copy docs directory to dist/apps/interface-cli/docs
const srcDocs = path.join(rootDir, 'docs');
const destDocs = path.join(distCliDir, 'docs');
if (fs.existsSync(srcDocs)) {
  fs.cpSync(srcDocs, destDocs, { recursive: true });
  console.log(`  └─ Copied docs directory to ${destDocs}`);
}

// Set executable permission on main.js
const mainJsPath = path.join(distCliDir, 'main.js');
if (fs.existsSync(mainJsPath)) {
  try {
    fs.chmodSync(mainJsPath, '755');
    console.log(`  └─ Set executable permissions (+x) on ${mainJsPath}`);
  } catch (err) {
    console.warn(`  ⚠️ Warning: Could not set executable permission on ${mainJsPath}:`, err.message);
  }
}

console.log('✅ CLI package preparation complete! Ready to publish via:');
console.log('   cd dist/apps/interface-cli && npm publish\n');
