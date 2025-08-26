#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔨 Building ArgoCD Azure DevOps Extension...');

// Step 1: Clean previous build
console.log('\n🧹 Cleaning previous build...');
try {
    // Clean compiled JS files in tasks
    if (fs.existsSync('tasks/ArgocdSync/index.js')) {
        fs.unlinkSync('tasks/ArgocdSync/index.js');
        console.log('  ✅ Removed old task index.js');
    }
    
    // Clean compiled common files in tasks
    if (fs.existsSync('tasks/ArgocdSync/common')) {
        execSync('rm -rf tasks/ArgocdSync/common');
        console.log('  ✅ Removed old common files');
    }
    
    // Clean dist directory
    if (fs.existsSync('dist')) {
        execSync('rm -rf dist');
        console.log('  ✅ Removed dist directory');
    }
} catch (error) {
    console.log('  ℹ️  No previous build to clean');
}

// Step 2: Compile TypeScript
console.log('\n📝 Compiling TypeScript...');
try {
    execSync('npx tsc', { stdio: 'inherit' });
    console.log('  ✅ TypeScript compilation successful');
} catch (error) {
    console.error('  ❌ TypeScript compilation failed');
    process.exit(1);
}

// Step 3: Copy compiled files to task directories
console.log('\n📋 Copying compiled files to distribution...');

// Ensure tasks directory structure exists
const taskDir = 'tasks/ArgocdSync';
if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
    console.log('  ✅ Created task directory structure');
}

// Service endpoint files are now in root directory (no copying needed)
console.log('  ✅ Service endpoint files already in correct location');

// Copy compiled task file
const taskSource = 'dist/tasks/ArgocdSync/index.js';
const taskDest = 'tasks/ArgocdSync/index.js';

if (fs.existsSync(taskSource)) {
    fs.copyFileSync(taskSource, taskDest);
    console.log('  ✅ Copied task index.js');
} else {
    console.error('  ❌ Task source not found:', taskSource);
    console.log('  💡 Make sure your TypeScript compiles to dist/tasks/ArgocdSync/');
    process.exit(1);
}

// Copy common files
const commonSourceDir = 'dist/common';
const commonDestDir = 'tasks/ArgocdSync/common';

if (fs.existsSync(commonSourceDir)) {
    if (!fs.existsSync(commonDestDir)) {
        fs.mkdirSync(commonDestDir, { recursive: true });
    }
    
    execSync(`cp -r ${commonSourceDir}/* ${commonDestDir}/`);
    console.log('  ✅ Copied common files');
} else {
    console.error('  ❌ Common source directory not found:', commonSourceDir);
    process.exit(1);
}

// Step 4: Ensure task dependencies are installed
console.log('\n📦 Managing task dependencies...');

// Create/update task package.json if needed
const taskPackageJsonPath = 'tasks/ArgocdSync/package.json';
const taskPackageJson = {
    "name": "argocd-sync-task",
    "version": "1.0.21",
    "description": "ArgoCD Application Sync Task Runtime",
    "main": "index.js",
    "dependencies": {
        "azure-pipelines-task-lib": "^4.1.0",
        "axios": "^1.6.0"
    }
};

let needsInstall = false;

if (!fs.existsSync(taskPackageJsonPath)) {
    fs.writeFileSync(taskPackageJsonPath, JSON.stringify(taskPackageJson, null, 2));
    console.log('  ✅ Created task package.json');
    needsInstall = true;
} else {
    // Check if node_modules exists and is recent
    const nodeModulesPath = 'tasks/ArgocdSync/node_modules';
    if (!fs.existsSync(nodeModulesPath)) {
        needsInstall = true;
    } else {
        // Check if package.json is newer than node_modules
        const packageStat = fs.statSync(taskPackageJsonPath);
        const nodeModulesStat = fs.statSync(nodeModulesPath);
        if (packageStat.mtime > nodeModulesStat.mtime) {
            needsInstall = true;
        }
    }
}

if (needsInstall) {
    console.log('  📦 Installing task dependencies...');
    try {
        execSync('npm install --production --silent', { 
            cwd: 'tasks/ArgocdSync',
            stdio: 'pipe'
        });
        console.log('  ✅ Task dependencies installed');
    } catch (error) {
        console.error('  ❌ Failed to install task dependencies');
        console.error(error.message);
        process.exit(1);
    }
} else {
    console.log('  ✅ Task dependencies up to date');
}

// Step 5: Validate build
console.log('\n🔍 Validating build...');
const requiredFiles = [
    'tasks/ArgocdSync/index.js',
    'tasks/ArgocdSync/task.json', 
    'tasks/ArgocdSync/package.json',
    'tasks/ArgocdSync/common/argocd-service-provider.js',
    'service-endpoint/argocd-connection.html',
    'vss-extension.json'
];

let valid = true;
for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - MISSING`);
        valid = false;
    }
}

if (!valid) {
    console.error('\n❌ Build validation failed - missing required files');
    process.exit(1);
}

console.log('\n🎉 Build completed successfully!');
console.log('\n📁 Distribution structure:');
console.log('   tasks/ArgocdSync/           # Task runtime files');
console.log('   ├── index.js               # Compiled task');
console.log('   ├── task.json              # Task definition'); 
console.log('   ├── package.json           # Runtime dependencies');
console.log('   ├── node_modules/          # Installed dependencies');
console.log('   └── common/                # Compiled shared code');
console.log('   service-endpoint/          # Service connection UI');
console.log('   vss-extension.json         # Extension manifest');

console.log('\n🚀 Ready for packaging!');
console.log('   npm run package            # Package the extension');
console.log('   npm run clean              # Clean build files');