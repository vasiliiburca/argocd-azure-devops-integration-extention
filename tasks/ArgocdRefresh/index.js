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
        console.log('🔄 Starting ArgoCD Application Refresh...');
        // Get task inputs
        const argoCDConnection = tl.getInput('argoCDConnection', true);
        const applicationName = tl.getInput('applicationName', true);
        const project = tl.getInput('project', false);
        const hardRefresh = tl.getBoolInput('hardRefresh', false);
        const waitForChanges = tl.getBoolInput('waitForChanges', false);
        const syncTimeout = parseInt(tl.getInput('syncTimeout', false) || '300');
        const failOnWarnings = tl.getBoolInput('failOnWarnings', false);
        const failOnDegraded = tl.getBoolInput('failOnDegraded', true);
        const failOnUnknown = tl.getBoolInput('failOnUnknown', false);
        const terminateRunningSync = tl.getBoolInput('terminateRunningSync', false);
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
        console.log(`   Hard Refresh: ${hardRefresh}`);
        console.log(`   Wait for Changes: ${waitForChanges}`);
        console.log(`   Sync Timeout: ${syncTimeout}s`);
        console.log(`   Fail on Warnings: ${failOnWarnings}`);
        console.log(`   Fail on Degraded Health: ${failOnDegraded}`);
        console.log(`   Fail on Unknown Status: ${failOnUnknown}`);
        console.log(`   Terminate Running Sync: ${terminateRunningSync}`);
        // Import the ArgoCD service provider
        const commonPath = path.resolve(__dirname, 'common');
        const { createArgoCDServiceProvider } = await (_a = path.join(commonPath, 'argocd-service-provider'), Promise.resolve().then(() => __importStar(require(_a))));
        // Initialize ArgoCD service provider
        const argoCDService = await createArgoCDServiceProvider(argoCDConnection);
        // Verify application exists
        const appExists = await argoCDService.applicationExists(applicationName, project);
        if (!appExists) {
            const message = project
                ? `Application '${applicationName}' not found in project '${project}'`
                : `Application '${applicationName}' not found`;
            tl.setResult(tl.TaskResult.Failed, message);
            return;
        }
        console.log(`✅ Application '${applicationName}' found`);
        // Get initial application status before refresh
        console.log('📊 Getting current application status...');
        const appBefore = await argoCDService.getApplication(applicationName, project);
        console.log(`   Sync status before refresh: ${appBefore.syncStatus}`);
        console.log(`   Health status before refresh: ${appBefore.healthStatus}`);
        console.log(`   Current revision: ${appBefore.revision || 'unknown'}`);
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
                console.log('   Current sync status:', appBefore.syncStatus);
                console.log('   Set "Terminate running sync before refresh" to automatically stop the current operation');
                tl.setResult(tl.TaskResult.Failed, 'Another operation is already in progress. Enable termination option or wait for completion.');
                return;
            }
        }
        // Perform refresh operation
        console.log(`🔄 Starting ${hardRefresh ? 'hard ' : ''}refresh operation...`);
        await performRefresh(argoCDService, applicationName, project, hardRefresh);
        console.log('✅ Refresh completed successfully');
        // Wait a moment for ArgoCD to process the refresh
        console.log('⏳ Waiting for refresh to process...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Get application status after refresh
        console.log('📊 Checking for changes after refresh...');
        const appAfter = await argoCDService.getApplication(applicationName, project);
        console.log(`   Sync status after refresh: ${appAfter.syncStatus}`);
        console.log(`   Health status after refresh: ${appAfter.healthStatus}`);
        console.log(`   New revision: ${appAfter.revision || 'unknown'}`);
        // Debug: Log all conditions found
        if (appAfter.conditions && appAfter.conditions.length > 0) {
            console.log(`   Found ${appAfter.conditions.length} condition(s):`);
            appAfter.conditions.forEach((condition, index) => {
                console.log(`     ${index + 1}. Type: ${condition.type || 'Unknown'}`);
                console.log(`        Status: ${condition.status || 'Unknown'}`);
                console.log(`        Severity: ${condition.severity || 'Not specified'}`);
                console.log(`        Message: ${condition.message || 'No message'}`);
                if (condition.reason)
                    console.log(`        Reason: ${condition.reason}`);
            });
        }
        else {
            console.log('   No conditions found');
        }
        // Enhanced comprehensive status monitoring
        console.log('\n🔍 Analyzing application state after refresh...');
        const analysisResult = await comprehensiveStatusAnalysis(argoCDService, applicationName, project, appBefore, appAfter, {
            waitForChanges,
            syncTimeout,
            failOnWarnings,
            failOnDegraded,
            failOnUnknown
        });
        if (!analysisResult.success) {
            tl.setResult(tl.TaskResult.Failed, analysisResult.message);
            return;
        }
        // Final status report
        const finalApp = await argoCDService.getApplication(applicationName, project);
        console.log('\n📊 Final Application Status:');
        console.log(`   Sync Status: ${finalApp.syncStatus}`);
        console.log(`   Health Status: ${finalApp.healthStatus}`);
        console.log(`   Revision: ${finalApp.revision || 'unknown'}`);
        // Final validation
        const finalValidation = await validateFinalApplicationState(finalApp, { failOnWarnings, failOnDegraded, failOnUnknown });
        if (!finalValidation.success) {
            tl.setResult(tl.TaskResult.Failed, finalValidation.message);
            return;
        }
        // Analyze final state to provide comprehensive messaging
        let successMessage = 'ArgoCD refresh operation completed successfully';
        if (finalApp.syncStatus === 'OutOfSync') {
            console.log('\n⚠️  Refresh completed successfully but application remains out of sync');
            console.log('   This could indicate:');
            console.log('   - Auto-sync is disabled for this application');
            console.log('   - Manual sync may be required');
            console.log('   - Sync policy restrictions may be in place');
            successMessage = 'Refresh completed successfully - application is out of sync (manual sync may be needed)';
        }
        else if (finalApp.syncStatus === 'Unknown') {
            if (failOnUnknown) {
                // This would have been caught by validation above, but adding for completeness
                console.log('\n❌ Refresh completed but application sync status is Unknown');
            }
            else {
                console.log('\n⚠️  Refresh completed but application sync status is Unknown');
                console.log('   Consider investigating potential manifest or configuration errors');
                successMessage = 'Refresh completed successfully - sync status is Unknown (investigation may be needed)';
            }
        }
        else if (finalApp.syncStatus === 'Synced') {
            console.log('\n✅ Refresh and sync completed successfully - application is fully synchronized');
            successMessage = 'Refresh and sync completed successfully - application is synchronized';
        }
        console.log('\n🎉 ArgoCD refresh operation completed!');
        tl.setResult(tl.TaskResult.Succeeded, successMessage);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('💥 ArgoCD refresh failed:', errorMessage);
        tl.setResult(tl.TaskResult.Failed, `ArgoCD refresh failed: ${errorMessage}`);
    }
}
async function performRefresh(argoCDService, applicationName, _project, hard = false) {
    var _a, _b;
    console.log(`🔄 Triggering ${hard ? 'hard ' : ''}refresh operation...`);
    const httpClient = argoCDService.createHttpClient();
    // ArgoCD API format is always /api/v1/applications/{appName}
    // Project validation is handled by the service provider
    // Encode the application name to handle special characters like '/'
    const encodedAppName = encodeURIComponent(applicationName);
    const url = `/api/v1/applications/${encodedAppName}?refresh=${hard ? 'hard' : 'normal'}`;
    console.log(`   Original app name: '${applicationName}'`);
    console.log(`   Encoded app name: '${encodedAppName}'`);
    console.log(`   Request URL: ${url}`);
    try {
        const response = await httpClient.get(url);
        if (response.status === 200) {
            console.log('✅ Refresh request completed');
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
async function comprehensiveStatusAnalysis(argoCDService, applicationName, project, appBefore, appAfter, options) {
    // Phase 1: Change Detection
    const hasChanges = appAfter.syncStatus === 'OutOfSync' ||
        (appBefore.revision !== appAfter.revision && appAfter.revision);
    if (!hasChanges) {
        console.log('ℹ️  No changes detected after refresh');
        console.log('   Application is up to date with the Git repository');
        return { success: true, message: 'No changes detected, application is up to date' };
    }
    console.log('🔍 Changes detected after refresh!');
    console.log(`   Previous revision: ${appBefore.revision || 'unknown'}`);
    console.log(`   Current revision: ${appAfter.revision || 'unknown'}`);
    // Phase 2: Handle Unknown Sync Status with Intelligence
    let currentApp = appAfter;
    const unknownHandlingResult = await handleUnknownSyncStatus(argoCDService, applicationName, project, currentApp, options);
    if (!unknownHandlingResult.success) {
        return unknownHandlingResult;
    }
    currentApp = unknownHandlingResult.app || currentApp;
    // Phase 3: Sync Status Monitoring
    if (currentApp.syncStatus === 'OutOfSync' && options.waitForChanges) {
        console.log('⏳ Application is out of sync. Monitoring for sync completion...');
        const syncResult = await comprehensiveSyncMonitoring(argoCDService, applicationName, project, options.syncTimeout, options);
        if (!syncResult.success) {
            return syncResult;
        }
        currentApp = syncResult.app || currentApp;
    }
    // Phase 4: Final Health and Condition Validation
    return await validateApplicationHealthAndConditions(currentApp, options);
}
async function handleUnknownSyncStatus(argoCDService, applicationName, project, app, options) {
    if (app.syncStatus !== 'Unknown') {
        return { success: true, message: 'Sync status is valid', app };
    }
    console.log('⚠️  Sync status is Unknown - investigating cause...');
    // Check application conditions for specific errors
    const conditions = app.conditions || [];
    console.log(`🔍 Found ${conditions.length} application conditions:`);
    conditions.forEach((c, index) => {
        console.log(`   ${index + 1}. Type: ${c.type}, Status: ${c.status}, Severity: ${c.severity || 'None'}`);
        console.log(`      Message: ${c.message}`);
        if (c.reason)
            console.log(`      Reason: ${c.reason}`);
    });
    const errorConditions = conditions.filter((c) => c.severity === 'Error');
    const warningConditions = conditions.filter((c) => c.severity === 'Warning');
    if (errorConditions.length > 0) {
        console.log('❌ Found error conditions:');
        errorConditions.forEach((c) => {
            console.log(`   - ${c.type}: ${c.message}`);
        });
        return {
            success: false,
            message: `Sync failed with errors: ${errorConditions[0].message}`
        };
    }
    if (warningConditions.length > 0) {
        console.log('⚠️  Found warning conditions:');
        warningConditions.forEach((c) => {
            console.log(`   - ${c.type}: ${c.message}`);
        });
        if (options.failOnWarnings) {
            return {
                success: false,
                message: `Sync has warnings: ${warningConditions[0].message}`
            };
        }
        else {
            tl.warning(`Application has warnings: ${warningConditions[0].message}`);
        }
    }
    // If no conditions explain the Unknown status, wait and retry
    console.log('🔍 No error conditions found, retrying status check...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
        const retryApp = await argoCDService.getApplication(applicationName, project);
        if (retryApp.syncStatus === 'Unknown') {
            return {
                success: false,
                message: 'Application sync status remains Unknown after retry - check ArgoCD server health and manifest validity'
            };
        }
        console.log(`✅ Status resolved to: ${retryApp.syncStatus}`);
        return { success: true, message: 'Status resolved after retry', app: retryApp };
    }
    catch (error) {
        return {
            success: false,
            message: `Failed to retry status check: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
async function comprehensiveSyncMonitoring(argoCDService, applicationName, _project, timeoutSeconds, options) {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    let lastStatus = '';
    let lastHealth = '';
    let syncStarted = false;
    let initialCheck = true;
    console.log('⏳ Monitoring comprehensive application state...');
    while (Date.now() - startTime < timeoutMs) {
        try {
            const app = await argoCDService.getApplication(applicationName, _project);
            // Log status and health changes
            if (app.syncStatus !== lastStatus || app.healthStatus !== lastHealth) {
                console.log(`   Sync: ${app.syncStatus} | Health: ${app.healthStatus}`);
                lastStatus = app.syncStatus;
                lastHealth = app.healthStatus;
            }
            // Handle Unknown status during monitoring
            if (app.syncStatus === 'Unknown') {
                console.log('⚠️  Sync status became Unknown during monitoring');
                const unknownResult = await handleUnknownSyncStatus(argoCDService, applicationName, _project, app, options);
                if (!unknownResult.success) {
                    return unknownResult;
                }
                continue;
            }
            // Check if sync has started
            if (!syncStarted && (app.syncStatus === 'Syncing' || app.syncStatus === 'Progressing')) {
                console.log('🚀 Sync operation has started!');
                syncStarted = true;
            }
            // Check for sync completion
            if (app.syncStatus === 'Synced') {
                if (syncStarted || !initialCheck) {
                    console.log('✅ Sync completed successfully');
                    // Validate health and conditions after sync
                    const healthValidation = await validateApplicationHealthAndConditions(app, options);
                    if (!healthValidation.success) {
                        return { success: false, message: healthValidation.message, app };
                    }
                    return { success: true, message: 'Sync completed with healthy application', app };
                }
            }
            // Check if sync failed
            if (app.syncStatus === 'Failed' || app.syncStatus === 'Error') {
                console.log(`❌ Sync operation failed with status: ${app.syncStatus}`);
                // Check conditions for specific error details
                const errorConditions = (app.conditions || []).filter((c) => c.severity === 'Error');
                const errorMessage = errorConditions.length > 0
                    ? errorConditions[0].message
                    : `Sync failed with status: ${app.syncStatus}`;
                return { success: false, message: errorMessage, app };
            }
            // Check if still out of sync after initial wait period
            if (initialCheck && Date.now() - startTime > 10000 && app.syncStatus === 'OutOfSync') {
                console.log('ℹ️  Application remains out of sync after 10 seconds');
                console.log('   Auto-sync may not be enabled for this application');
                // If waiting is not required, this might be acceptable
                if (!options.waitForChanges) {
                    return { success: true, message: 'Changes detected but not waiting for sync', app };
                }
            }
            initialCheck = false;
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        catch (error) {
            console.error('❌ Error checking application status:', error instanceof Error ? error.message : error);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    // Timeout reached
    console.log(`⏰ Timeout reached after ${timeoutSeconds}s`);
    // Get final state
    try {
        const finalApp = await argoCDService.getApplication(applicationName, _project);
        if (syncStarted && finalApp.syncStatus !== 'Synced') {
            return {
                success: false,
                message: `Sync started but did not complete within ${timeoutSeconds}s. Current status: ${finalApp.syncStatus}`,
                app: finalApp
            };
        }
        else if (!syncStarted) {
            return {
                success: false,
                message: 'No sync activity detected within timeout period. Auto-sync may not be enabled.',
                app: finalApp
            };
        }
        return { success: true, message: 'Monitoring completed', app: finalApp };
    }
    catch (error) {
        return {
            success: false,
            message: `Failed to get final application state: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
async function validateApplicationHealthAndConditions(app, options) {
    console.log('🏥 Validating application health and conditions...');
    console.log(`   Current sync status: ${app.syncStatus}`);
    console.log(`   Current health status: ${app.healthStatus}`);
    // Check application conditions first
    const conditions = app.conditions || [];
    console.log(`🔍 Final validation - found ${conditions.length} application conditions:`);
    conditions.forEach((c, index) => {
        console.log(`   ${index + 1}. Type: ${c.type}, Status: ${c.status}, Severity: ${c.severity || 'None'}`);
        console.log(`      Message: ${c.message}`);
        if (c.reason)
            console.log(`      Reason: ${c.reason}`);
    });
    // Classify conditions - some critical conditions may not have explicit severity
    const errorConditions = conditions.filter(c => {
        var _a, _b;
        return c.severity === 'Error' ||
            c.type === 'ComparisonError' ||
            c.type === 'SyncError' ||
            ((_a = c.message) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('error')) ||
            ((_b = c.message) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('failed'));
    });
    const warningConditions = conditions.filter(c => c.severity === 'Warning');
    if (errorConditions.length > 0) {
        console.log('❌ Application has error conditions:');
        errorConditions.forEach(c => {
            console.log(`   - ${c.type}: ${c.message} [Severity: ${c.severity || 'Detected'}]`);
        });
        return {
            success: false,
            message: `Application has error conditions: ${errorConditions[0].message}`
        };
    }
    if (warningConditions.length > 0 && options.failOnWarnings) {
        console.log('⚠️  Application has warning conditions:');
        warningConditions.forEach(c => {
            console.log(`   - ${c.type}: ${c.message}`);
        });
        return {
            success: false,
            message: `Application has warning conditions: ${warningConditions[0].message}`
        };
    }
    // Check sync status for Unknown
    if (app.syncStatus === 'Unknown' && options.failOnUnknown) {
        return {
            success: false,
            message: 'Application sync status is Unknown - indicates potential configuration or manifest errors'
        };
    }
    // Check health status
    console.log(`   Health Status: ${app.healthStatus}`);
    if (app.healthStatus === 'Degraded' && options.failOnDegraded) {
        return {
            success: false,
            message: 'Application health is Degraded'
        };
    }
    if (app.healthStatus === 'Missing') {
        return {
            success: false,
            message: 'Application resources are missing'
        };
    }
    if (app.healthStatus === 'Unknown') {
        console.log('⚠️  Application health is Unknown');
        tl.warning('Application health status is Unknown');
    }
    // Check sync status
    if (app.syncStatus === 'OutOfSync') {
        console.log('⚠️  Application is still out of sync');
        tl.warning('Application remains out of sync with Git repository');
    }
    console.log('✅ Application validation completed');
    return {
        success: true,
        message: `Application is in acceptable state: Sync=${app.syncStatus}, Health=${app.healthStatus}`
    };
}
async function validateFinalApplicationState(app, options) {
    return await validateApplicationHealthAndConditions(app, {
        waitForChanges: false,
        syncTimeout: 0,
        failOnWarnings: options.failOnWarnings,
        failOnDegraded: options.failOnDegraded,
        failOnUnknown: options.failOnUnknown
    });
}
async function checkForRunningOperation(argoCDService, applicationName) {
    var _a, _b;
    console.log('🔍 Checking for running operations...');
    const httpClient = argoCDService.createHttpClient();
    // Encode the application name to handle special characters like '/'
    const encodedAppName = encodeURIComponent(applicationName);
    const url = `/api/v1/applications/${encodedAppName}`;
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
    // Encode the application name to handle special characters like '/'
    const encodedAppName = encodeURIComponent(applicationName);
    const url = `/api/v1/applications/${encodedAppName}/operation`;
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