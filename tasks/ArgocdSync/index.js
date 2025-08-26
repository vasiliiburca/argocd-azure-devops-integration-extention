"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const tl = __importStar(require("azure-pipelines-task-lib/task"));
const path = __importStar(require("path"));
async function run() {
    var _a;
    try {
        console.log('🚀 Starting ArgoCD Application Sync...');
        // Get task inputs
        const argoCDConnection = tl.getInput('argoCDConnection', true);
        const applicationName = tl.getInput('applicationName', true);
        const project = tl.getInput('project', false);
        const syncPolicy = tl.getInput('syncPolicy', true) || 'sync';
        const waitForSync = tl.getBoolInput('waitForSync', false);
        const syncTimeout = parseInt(tl.getInput('syncTimeout', false) || '300');
        const revision = tl.getInput('revision', false);
        const strategy = tl.getInput('strategy', false) || 'apply';
        const prune = tl.getBoolInput('prune', false);
        const dryRun = tl.getBoolInput('dryRun', false);
        const terminateRunningSync = tl.getBoolInput('terminateRunningSync', false);
        const failOnTimeout = tl.getBoolInput('failOnTimeout', false);
        if (!argoCDConnection) {
            tl.setResult(tl.TaskResult.Failed, 'ArgoCD service connection is required');
            return;
        }
        if (!applicationName) {
            tl.setResult(tl.TaskResult.Failed, 'Application name is required');
            return;
        }
        console.log(`📋 Configuration:`);
        console.log(`   Application: ${applicationName}`);
        console.log(`   Project: ${project || 'default'}`);
        console.log(`   Sync Policy: ${syncPolicy}`);
        console.log(`   Wait for completion: ${waitForSync}`);
        console.log(`   Timeout: ${syncTimeout}s`);
        console.log(`   Revision: ${revision || 'HEAD'}`);
        console.log(`   Strategy: ${strategy}`);
        console.log(`   Prune: ${prune}`);
        console.log(`   Dry Run: ${dryRun}`);
        console.log(`   Terminate Running Sync: ${terminateRunningSync}`);
        console.log(`   Fail on Timeout: ${failOnTimeout}`);
        // Import the ArgoCD service provider
        const commonPath = path.resolve(__dirname, 'common');
        const { createArgoCDServiceProvider } = await (_a = path.join(commonPath, 'argocd-service-provider'), Promise.resolve().then(() => __importStar(require(_a))));
        // Initialize ArgoCD service provider
        console.log('🔗 Initializing ArgoCD connection...');
        const argoCDService = await createArgoCDServiceProvider(argoCDConnection);
        // Verify application exists
        console.log(`🔍 Verifying application '${applicationName}' exists...`);
        const appExists = await argoCDService.applicationExists(applicationName, project);
        if (!appExists) {
            const message = project
                ? `Application '${applicationName}' not found in project '${project}'`
                : `Application '${applicationName}' not found`;
            tl.setResult(tl.TaskResult.Failed, message);
            return;
        }
        console.log(`✅ Application '${applicationName}' found`);
        // Get current application status
        console.log('📊 Getting current application status...');
        const currentApp = await argoCDService.getApplication(applicationName, project);
        console.log(`   Current sync status: ${currentApp.syncStatus}`);
        console.log(`   Current health status: ${currentApp.healthStatus}`);
        console.log(`   Current revision: ${currentApp.revision || 'unknown'}`);
        // Check for running operations using ArgoCD API
        const hasRunningOperation = await checkForRunningOperation(argoCDService, applicationName);
        if (hasRunningOperation) {
            if (terminateRunningSync) {
                console.log('⚠️  Operation already in progress, terminating...');
                await terminateSync(argoCDService, applicationName, project);
                // Wait a moment for termination to complete
                console.log('⏳ Waiting for operation termination to complete...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                // Verify termination was successful
                const stillRunning = await checkForRunningOperation(argoCDService, applicationName);
                if (stillRunning) {
                    console.log('⚠️  Operation is still running after termination attempt');
                    tl.setResult(tl.TaskResult.Failed, 'Failed to terminate running operation. Please wait for it to complete or try again.');
                    return;
                }
                else {
                    console.log('✅ Operation successfully terminated');
                }
            }
            else {
                console.log('⚠️  Another operation is already in progress!');
                console.log('   Current sync status:', currentApp.syncStatus);
                console.log('   Set "Terminate running sync before starting" to automatically stop the current operation');
                tl.setResult(tl.TaskResult.Failed, 'Another operation is already in progress. Enable termination option or wait for completion.');
                return;
            }
        }
        // Perform the sync operation
        console.log(`🔄 Starting ${syncPolicy} operation...`);
        switch (syncPolicy) {
            case 'sync':
                await performSync(argoCDService, applicationName, project, {
                    revision,
                    strategy,
                    prune,
                    dryRun
                });
                break;
            case 'refresh':
                await performRefresh(argoCDService, applicationName, project, false);
                break;
            case 'hard-refresh':
                await performRefresh(argoCDService, applicationName, project, true);
                break;
            default:
                tl.setResult(tl.TaskResult.Failed, `Unknown sync policy: ${syncPolicy}`);
                return;
        }
        console.log(`✅ ${syncPolicy} operation initiated successfully`);
        if (waitForSync && syncPolicy === 'sync') {
            console.log(`⏳ Waiting for sync completion (timeout: ${syncTimeout}s)...`);
            await waitForSyncCompletion(argoCDService, applicationName, project, syncTimeout, failOnTimeout);
        }
        console.log('🎉 ArgoCD sync operation completed successfully!');
        tl.setResult(tl.TaskResult.Succeeded, 'ArgoCD sync completed successfully');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('💥 ArgoCD sync failed:', errorMessage);
        tl.setResult(tl.TaskResult.Failed, `ArgoCD sync failed: ${errorMessage}`);
    }
}
async function performSync(argoCDService, applicationName, _project, options = {}) {
    var _a, _b;
    console.log('🔄 Triggering sync operation...');
    const httpClient = argoCDService.createHttpClient();
    const syncRequest = {
        prune: options.prune || false,
        dryRun: options.dryRun || false,
        strategy: {
            apply: {}
        }
    };
    if (options.revision) {
        syncRequest.revision = options.revision;
    }
    if (options.strategy === 'hook') {
        syncRequest.strategy = { hook: {} };
    }
    else if (options.strategy === 'force') {
        syncRequest.strategy = { force: true };
    }
    // ArgoCD API format is always /api/v1/applications/{appName}/sync
    // Project validation is handled by the service provider
    const url = `/api/v1/applications/${applicationName}/sync`;
    console.log(`   Request URL: ${url}`);
    console.log(`   Sync options: ${options.strategy} strategy, prune=${options.prune}, dryRun=${options.dryRun}`);
    try {
        const response = await httpClient.post(url, syncRequest);
        if (response.status === 200 || response.status === 202) {
            console.log('✅ Sync request accepted');
            return response.data;
        }
        else {
            throw new Error(`Sync failed with status ${response.status}: ${response.statusText}`);
        }
    }
    catch (error) {
        if ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) {
            throw new Error(`Sync failed: ${error.response.data.message}`);
        }
        throw error;
    }
}
async function performRefresh(argoCDService, applicationName, _project, hard = false) {
    var _a, _b;
    console.log(`🔄 Triggering ${hard ? 'hard ' : ''}refresh operation...`);
    const httpClient = argoCDService.createHttpClient();
    // ArgoCD API format is always /api/v1/applications/{appName}
    // Project validation is handled by the service provider  
    const url = `/api/v1/applications/${applicationName}?refresh=${hard ? 'hard' : 'normal'}`;
    console.log(`   Request URL: ${url}`);
    try {
        const response = await httpClient.get(url);
        if (response.status === 200) {
            console.log('✅ Refresh completed');
            return response.data;
        }
        else {
            throw new Error(`Refresh failed with status ${response.status}: ${response.statusText}`);
        }
    }
    catch (error) {
        if ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) {
            throw new Error(`Refresh failed: ${error.response.data.message}`);
        }
        throw error;
    }
}
async function waitForSyncCompletion(argoCDService, applicationName, project, timeoutSeconds = 300, failOnTimeout = false) {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    console.log('⏳ Monitoring sync progress...');
    console.log(`   Timeout: ${timeoutSeconds} seconds`);
    let checkCount = 0;
    while (Date.now() - startTime < timeoutMs) {
        checkCount++;
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        try {
            const app = await argoCDService.getApplication(applicationName, project);
            // Always log the current status for visibility
            console.log(`   Check ${checkCount} (${elapsedSeconds}s): Status=${app.syncStatus}, LastSync=${app.lastSyncStatus}, Health=${app.healthStatus}`);
            // Check for running operations to see if sync is still in progress
            const hasRunningOp = await checkForRunningOperation(argoCDService, applicationName);
            if (hasRunningOp) {
                console.log(`   🔄 Sync operation still in progress...`);
                // Continue monitoring
            }
            // Check if sync is complete - focus on last sync status
            if (app.lastSyncStatus === 'Synced') {
                console.log(`✅ Sync completed successfully - LastSyncStatus: ${app.lastSyncStatus}, Health: ${app.healthStatus}`);
                return;
            }
            else if (app.lastSyncStatus === 'Failed' || app.lastSyncStatus === 'Error') {
                // Check if there's a new operation running that might fix the error
                if (hasRunningOp) {
                    console.log(`⚠️  Last sync failed (${app.lastSyncStatus}) but new operation is running, continuing to monitor...`);
                }
                else {
                    console.log(`❌ Sync failed with last sync status: ${app.lastSyncStatus} and no operation is running`);
                    tl.setResult(tl.TaskResult.Failed, `Sync failed with last sync status: ${app.lastSyncStatus}`);
                    return;
                }
            }
            else if (app.syncStatus === 'OutOfSync') {
                // Only treat as final if no operation is running
                if (!hasRunningOp) {
                    console.log('⚠️  Application is out of sync and no operation is running');
                    tl.warning('Application appears to be out of sync after sync operation');
                    return;
                }
                else {
                    console.log('   ℹ️  Application shows OutOfSync but operation is still running, continuing...');
                }
            }
            else {
                console.log(`   ⏳ Current status: ${app.syncStatus}, continuing to monitor...`);
            }
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        catch (error) {
            console.error('❌ Error checking sync status:', error instanceof Error ? error.message : error);
            console.log('   🔄 Continuing to monitor despite error...');
            // Continue checking - temporary errors shouldn't fail the wait
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    // Timeout reached - check final status
    const finalApp = await argoCDService.getApplication(applicationName, project);
    console.log(`⏰ Timeout reached after ${timeoutSeconds}s`);
    console.log(`   Final sync status: ${finalApp.syncStatus}`);
    console.log(`   Final last sync status: ${finalApp.lastSyncStatus}`);
    console.log(`   Final health status: ${finalApp.healthStatus}`);
    if (finalApp.lastSyncStatus === 'Synced') {
        console.log('✅ Sync completed successfully despite timeout');
    }
    else if (finalApp.lastSyncStatus === 'Failed' || finalApp.lastSyncStatus === 'Error') {
        console.log(`❌ Sync failed with final last sync status: ${finalApp.lastSyncStatus}`);
        tl.setResult(tl.TaskResult.Failed, `Sync failed with last sync status: ${finalApp.lastSyncStatus}`);
    }
    else {
        console.log(`⚠️  Sync timeout - final last sync status: ${finalApp.lastSyncStatus}`);
        if (failOnTimeout) {
            console.log('❌ Failing task due to timeout (failOnTimeout=true)');
            tl.setResult(tl.TaskResult.Failed, `Sync operation timed out after ${timeoutSeconds}s. Final last sync status: ${finalApp.lastSyncStatus}`);
        }
        else {
            console.log('⚠️  Task will complete with warning (failOnTimeout=false)');
            tl.warning(`Sync operation timed out. Final last sync status: ${finalApp.lastSyncStatus}`);
        }
    }
}
async function checkForRunningOperation(argoCDService, applicationName) {
    var _a, _b;
    console.log('🔍 Checking for running operations...');
    const httpClient = argoCDService.createHttpClient();
    const url = `/api/v1/applications/${applicationName}`;
    try {
        const response = await httpClient.get(url);
        const app = response.data;
        // Check if there's a running operation
        const operation = (_a = app.status) === null || _a === void 0 ? void 0 : _a.operation;
        const operationState = (_b = app.status) === null || _b === void 0 ? void 0 : _b.operationState;
        if (operation || (operationState && operationState.phase === 'Running')) {
            console.log('   ✅ Running operation detected');
            if (operation) {
                console.log(`   Operation: ${operation.sync ? 'sync' : operation.operation || 'unknown'}`);
            }
            if (operationState) {
                console.log(`   Operation state: ${operationState.phase} (${operationState.message || 'no message'})`);
                if (operationState.syncResult) {
                    console.log(`   Sync result: ${operationState.syncResult.status || 'unknown'}`);
                }
            }
            return true;
        }
        else {
            console.log('   ℹ️  No running operations found');
            if (operationState) {
                console.log(`   Last operation state: ${operationState.phase} (${operationState.message || 'no message'})`);
            }
            return false;
        }
    }
    catch (error) {
        console.log(`   ⚠️  Error checking for operations: ${error instanceof Error ? error.message : error}`);
        return false; // Assume no operation if we can't check
    }
}
async function terminateSync(argoCDService, applicationName, _project) {
    var _a, _b, _c;
    console.log('🛑 Terminating running sync operation...');
    const httpClient = argoCDService.createHttpClient();
    const url = `/api/v1/applications/${applicationName}/operation`;
    console.log(`   Request URL: ${url}`);
    try {
        const response = await httpClient.delete(url);
        if (response.status === 200 || response.status === 202) {
            console.log('✅ Sync termination request sent');
        }
        else {
            console.log(`⚠️  Sync termination returned status: ${response.status}`);
        }
    }
    catch (error) {
        if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 404) {
            console.log('ℹ️  No running sync operation found to terminate');
        }
        else if ((_c = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.message) {
            console.log(`⚠️  Sync termination failed: ${error.response.data.message}`);
        }
        else {
            console.log(`⚠️  Sync termination error: ${error instanceof Error ? error.message : error}`);
        }
    }
}
// Run the task
run();
//# sourceMappingURL=index.js.map