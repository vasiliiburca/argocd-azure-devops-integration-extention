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
        // Perform the sync operation
        console.log(`🔄 Starting ${syncPolicy} operation...`);
        let syncResult;
        switch (syncPolicy) {
            case 'sync':
                syncResult = await performSync(argoCDService, applicationName, project, {
                    revision,
                    strategy,
                    prune,
                    dryRun
                });
                break;
            case 'refresh':
                syncResult = await performRefresh(argoCDService, applicationName, project, false);
                break;
            case 'hard-refresh':
                syncResult = await performRefresh(argoCDService, applicationName, project, true);
                break;
            default:
                tl.setResult(tl.TaskResult.Failed, `Unknown sync policy: ${syncPolicy}`);
                return;
        }
        console.log(`✅ ${syncPolicy} operation initiated successfully`);
        if (waitForSync && syncPolicy === 'sync') {
            console.log(`⏳ Waiting for sync completion (timeout: ${syncTimeout}s)...`);
            await waitForSyncCompletion(argoCDService, applicationName, project, syncTimeout);
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
async function performSync(argoCDService, applicationName, project, options = {}) {
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
    const url = project
        ? `/api/v1/applications/${project}/${applicationName}/sync`
        : `/api/v1/applications/${applicationName}/sync`;
    console.log(`   Request URL: ${url}`);
    console.log(`   Sync options:`, JSON.stringify(syncRequest, null, 2));
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
async function performRefresh(argoCDService, applicationName, project, hard = false) {
    var _a, _b;
    console.log(`🔄 Triggering ${hard ? 'hard ' : ''}refresh operation...`);
    const httpClient = argoCDService.createHttpClient();
    const url = project
        ? `/api/v1/applications/${project}/${applicationName}?refresh=${hard ? 'hard' : 'normal'}`
        : `/api/v1/applications/${applicationName}?refresh=${hard ? 'hard' : 'normal'}`;
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
async function waitForSyncCompletion(argoCDService, applicationName, project, timeoutSeconds = 300) {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    let lastStatus = '';
    console.log('⏳ Monitoring sync progress...');
    while (Date.now() - startTime < timeoutMs) {
        try {
            const app = await argoCDService.getApplication(applicationName, project);
            if (app.syncStatus !== lastStatus) {
                console.log(`   Status: ${app.syncStatus} | Health: ${app.healthStatus}`);
                lastStatus = app.syncStatus;
            }
            // Check if sync is complete
            if (app.syncStatus === 'Synced') {
                if (app.healthStatus === 'Healthy') {
                    console.log('✅ Sync completed successfully - application is healthy');
                    return;
                }
                else if (app.healthStatus === 'Degraded' || app.healthStatus === 'Unknown') {
                    console.log(`⚠️  Sync completed but application health is: ${app.healthStatus}`);
                    tl.warning(`Application synced but health status is: ${app.healthStatus}`);
                    return;
                }
            }
            else if (app.syncStatus === 'OutOfSync') {
                console.log('⚠️  Application is out of sync after sync operation');
                tl.warning('Application appears to be out of sync after sync operation');
                return;
            }
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        catch (error) {
            console.error('❌ Error checking sync status:', error instanceof Error ? error.message : error);
            // Continue checking - temporary errors shouldn't fail the wait
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    // Timeout reached
    const finalApp = await argoCDService.getApplication(applicationName, project);
    console.log(`⏰ Timeout reached after ${timeoutSeconds}s`);
    console.log(`   Final status: ${finalApp.syncStatus} | Health: ${finalApp.healthStatus}`);
    if (finalApp.syncStatus === 'Synced' && finalApp.healthStatus === 'Healthy') {
        console.log('✅ Sync appears to have completed despite timeout');
    }
    else {
        tl.warning(`Sync may still be in progress. Final status: ${finalApp.syncStatus}`);
    }
}
// Run the task
run();
//# sourceMappingURL=index.js.map