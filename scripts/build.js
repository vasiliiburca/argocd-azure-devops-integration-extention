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
const taskDirs = ['tasks/ArgocdSync', 'tasks/ArgocdRefresh'];
for (const taskDir of taskDirs) {
    if (!fs.existsSync(taskDir)) {
        fs.mkdirSync(taskDir, { recursive: true });
        console.log(`  ✅ Created ${taskDir} directory`);
    }
}

// Service endpoint files are now in root directory (no copying needed)
console.log('  ✅ Service endpoint files already in correct location');

// Copy compiled ArgocdSync task
const syncTaskSource = 'dist/tasks/ArgocdSync/index.js';
const syncTaskDest = 'tasks/ArgocdSync/index.js';

if (fs.existsSync(syncTaskSource)) {
    fs.copyFileSync(syncTaskSource, syncTaskDest);
    console.log('  ✅ Copied ArgocdSync task');
} else {
    console.error('  ❌ ArgocdSync source not found:', syncTaskSource);
    process.exit(1);
}

// Copy compiled ArgocdRefresh task
const refreshTaskSource = 'dist/tasks/ArgocdRefresh/index.js';
const refreshTaskDest = 'tasks/ArgocdRefresh/index.js';

if (fs.existsSync(refreshTaskSource)) {
    fs.copyFileSync(refreshTaskSource, refreshTaskDest);
    console.log('  ✅ Copied ArgocdRefresh task');
} else {
    console.error('  ❌ ArgocdRefresh source not found:', refreshTaskSource);
    process.exit(1);
}

// Copy common files to both task directories
const commonSourceDir = 'dist/common';
const commonDestDirs = ['tasks/ArgocdSync/common', 'tasks/ArgocdRefresh/common'];

if (fs.existsSync(commonSourceDir)) {
    for (const commonDestDir of commonDestDirs) {
        if (!fs.existsSync(commonDestDir)) {
            fs.mkdirSync(commonDestDir, { recursive: true });
        }
        
        execSync(`cp -r ${commonSourceDir}/* ${commonDestDir}/`);
        console.log(`  ✅ Copied common files to ${commonDestDir}`);
    }
} else {
    console.error('  ❌ Common source directory not found:', commonSourceDir);
    process.exit(1);
}

// Step 4: Ensure task dependencies are installed
console.log('\n📦 Managing task dependencies...');

// Define package.json for both tasks
const taskPackageConfigs = [
    {
        path: 'tasks/ArgocdSync/package.json',
        dir: 'tasks/ArgocdSync',
        name: 'ArgocdSync',
        content: {
            "name": "argocd-sync-task",
            "version": "1.2.0",
            "description": "ArgoCD Application Sync Task Runtime",
            "main": "index.js",
            "dependencies": {
                "azure-pipelines-task-lib": "^4.1.0",
                "axios": "^1.6.0"
            }
        }
    },
    {
        path: 'tasks/ArgocdRefresh/package.json',
        dir: 'tasks/ArgocdRefresh',
        name: 'ArgocdRefresh',
        content: {
            "name": "argocd-refresh-task",
            "version": "1.2.0",
            "description": "ArgoCD Application Refresh Task Runtime",
            "main": "index.js",
            "dependencies": {
                "azure-pipelines-task-lib": "^4.1.0",
                "axios": "^1.6.0"
            }
        }
    }
];

// Process each task
for (const taskConfig of taskPackageConfigs) {
    let needsInstall = false;
    
    if (!fs.existsSync(taskConfig.path)) {
        fs.writeFileSync(taskConfig.path, JSON.stringify(taskConfig.content, null, 2));
        console.log(`  ✅ Created ${taskConfig.name} package.json`);
        needsInstall = true;
    } else {
        // Check if node_modules exists and is recent
        const nodeModulesPath = `${taskConfig.dir}/node_modules`;
        if (!fs.existsSync(nodeModulesPath)) {
            needsInstall = true;
        } else {
            // Check if package.json is newer than node_modules
            const packageStat = fs.statSync(taskConfig.path);
            const nodeModulesStat = fs.statSync(nodeModulesPath);
            if (packageStat.mtime > nodeModulesStat.mtime) {
                needsInstall = true;
            }
        }
    }
    
    if (needsInstall) {
        console.log(`  📦 Installing ${taskConfig.name} dependencies...`);
        try {
            execSync('npm install --production --silent', { 
                cwd: taskConfig.dir,
                stdio: 'pipe'
            });
            console.log(`  ✅ ${taskConfig.name} dependencies installed`);
        } catch (error) {
            console.error(`  ❌ Failed to install ${taskConfig.name} dependencies`);
            console.error(error.message);
            process.exit(1);
        }
    } else {
        console.log(`  ✅ ${taskConfig.name} dependencies up to date`);
    }
}

// Step 5: Validate build
console.log('\n🔍 Validating build...');
const requiredFiles = [
    'tasks/ArgocdSync/index.js',
    'tasks/ArgocdSync/task.json', 
    'tasks/ArgocdSync/package.json',
    'tasks/ArgocdSync/common/argocd-service-provider.js',
    'tasks/ArgocdRefresh/index.js',
    'tasks/ArgocdRefresh/task.json', 
    'tasks/ArgocdRefresh/package.json',
    'tasks/ArgocdRefresh/common/argocd-service-provider.js',
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
console.log('   tasks/');
console.log('   ├── ArgocdSync/            # Sync task runtime files');
console.log('   │   ├── index.js           # Compiled task');
console.log('   │   ├── task.json          # Task definition'); 
console.log('   │   ├── package.json       # Runtime dependencies');
console.log('   │   ├── node_modules/      # Installed dependencies');
console.log('   │   └── common/            # Compiled shared code');
console.log('   ├── ArgocdRefresh/         # Refresh task runtime files');
console.log('   │   ├── index.js           # Compiled task');
console.log('   │   ├── task.json          # Task definition'); 
console.log('   │   ├── package.json       # Runtime dependencies');
console.log('   │   ├── node_modules/      # Installed dependencies');
console.log('   │   └── common/            # Compiled shared code');
console.log('   service-endpoint/          # Service connection UI');
console.log('   vss-extension.json         # Extension manifest');

console.log('\n🚀 Ready for packaging!');
console.log('   npm run package            # Package the extension');
console.log('   npm run clean              # Clean build files');