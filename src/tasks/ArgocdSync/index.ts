import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import { ArgoCDServiceProvider } from '../../common/argocd-service-provider';

async function run() {
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
        const { createArgoCDServiceProvider } = await import(path.join(commonPath, 'argocd-service-provider'));

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
                } else {
                    console.log('✅ Operation successfully terminated');
                }
            } else {
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

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('💥 ArgoCD sync failed:', errorMessage);
        tl.setResult(tl.TaskResult.Failed, `ArgoCD sync failed: ${errorMessage}`);
    }
}

async function performSync(
    argoCDService: ArgoCDServiceProvider, 
    applicationName: string, 
    _project: string | undefined, 
    options: {
        revision?: string;
        strategy?: string;
        prune?: boolean;
        dryRun?: boolean;
    } = {}
) {
    console.log('🔄 Triggering sync operation...');
    
    const httpClient = argoCDService.createHttpClient();
    
    const syncRequest: { prune: boolean; dryRun: boolean; strategy?: { [key: string]: unknown }; revision?: string } = {
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
    } else if (options.strategy === 'force') {
        syncRequest.strategy = { force: true };
    }

    // Parse namespace/name format (CLI-style) if present
    let appName = applicationName;
    let appNamespace: string | undefined;

    if (applicationName.includes('/')) {
        const parts = applicationName.split('/');
        if (parts.length === 2) {
            appNamespace = parts[0];
            appName = parts[1];
            console.log(`📝 Parsed CLI-style format: namespace='${appNamespace}', name='${appName}'`);
        }
    }

    // Build URL with appNamespace query parameter if needed
    let url = `/api/v1/applications/${appName}/sync`;
    if (appNamespace) {
        url += `?appNamespace=${appNamespace}`;
    }

    console.log(`   Original input: '${applicationName}'`);
    console.log(`   App name: '${appName}'`);
    if (appNamespace) {
        console.log(`   App namespace: '${appNamespace}'`);
    }
    console.log(`   Request URL: ${url}`);
    console.log(`   Sync options: ${options.strategy} strategy, prune=${options.prune}, dryRun=${options.dryRun}`);

    try {
        const response = await httpClient.post(url, syncRequest);
        
        if (response.status === 200 || response.status === 202) {
            console.log('✅ Sync request accepted');
            return response.data;
        } else {
            throw new Error(`Sync failed with status ${response.status}: ${response.statusText}`);
        }
    } catch (error: any) {
        if (error.response?.data?.message) {
            throw new Error(`Sync failed: ${error.response.data.message}`);
        }
        throw error;
    }
}

async function performRefresh(
    argoCDService: ArgoCDServiceProvider,
    applicationName: string,
    _project: string | undefined,
    hard: boolean = false
) {
    console.log(`🔄 Triggering ${hard ? 'hard ' : ''}refresh operation...`);

    const httpClient = argoCDService.createHttpClient();

    // Parse namespace/name format (CLI-style) if present
    let appName = applicationName;
    let appNamespace: string | undefined;

    if (applicationName.includes('/')) {
        const parts = applicationName.split('/');
        if (parts.length === 2) {
            appNamespace = parts[0];
            appName = parts[1];
        }
    }

    // Build URL with appNamespace query parameter if needed
    let url = `/api/v1/applications/${appName}?refresh=${hard ? 'hard' : 'normal'}`;
    if (appNamespace) {
        url += `&appNamespace=${appNamespace}`;
    }

    console.log(`   Request URL: ${url}`);

    try {
        const response = await httpClient.get(url);
        
        if (response.status === 200) {
            console.log('✅ Refresh completed');
            return response.data;
        } else {
            throw new Error(`Refresh failed with status ${response.status}: ${response.statusText}`);
        }
    } catch (error: any) {
        if (error.response?.data?.message) {
            throw new Error(`Refresh failed: ${error.response.data.message}`);
        }
        throw error;
    }
}

async function waitForSyncCompletion(
    argoCDService: ArgoCDServiceProvider, 
    applicationName: string, 
    project: string | undefined, 
    timeoutSeconds: number = 300,
    failOnTimeout: boolean = false
) {
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
            } else if (app.lastSyncStatus === 'Failed' || app.lastSyncStatus === 'Error') {
                // Check if there's a new operation running that might fix the error
                if (hasRunningOp) {
                    console.log(`⚠️  Last sync failed (${app.lastSyncStatus}) but new operation is running, continuing to monitor...`);
                } else {
                    console.log(`❌ Sync failed with last sync status: ${app.lastSyncStatus} and no operation is running`);
                    tl.setResult(tl.TaskResult.Failed, `Sync failed with last sync status: ${app.lastSyncStatus}`);
                    return;
                }
            } else if (app.syncStatus === 'OutOfSync') {
                // Only treat as final if no operation is running
                if (!hasRunningOp) {
                    console.log('⚠️  Application is out of sync and no operation is running');
                    tl.warning('Application appears to be out of sync after sync operation');
                    return;
                } else {
                    console.log('   ℹ️  Application shows OutOfSync but operation is still running, continuing...');
                }
            } else {
                console.log(`   ⏳ Current status: ${app.syncStatus}, continuing to monitor...`);
            }

            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, 5000));

        } catch (error) {
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
    } else if (finalApp.lastSyncStatus === 'Failed' || finalApp.lastSyncStatus === 'Error') {
        console.log(`❌ Sync failed with final last sync status: ${finalApp.lastSyncStatus}`);
        tl.setResult(tl.TaskResult.Failed, `Sync failed with last sync status: ${finalApp.lastSyncStatus}`);
    } else {
        console.log(`⚠️  Sync timeout - final last sync status: ${finalApp.lastSyncStatus}`);
        if (failOnTimeout) {
            console.log('❌ Failing task due to timeout (failOnTimeout=true)');
            tl.setResult(tl.TaskResult.Failed, `Sync operation timed out after ${timeoutSeconds}s. Final last sync status: ${finalApp.lastSyncStatus}`);
        } else {
            console.log('⚠️  Task will complete with warning (failOnTimeout=false)');
            tl.warning(`Sync operation timed out. Final last sync status: ${finalApp.lastSyncStatus}`);
        }
    }
}

async function checkForRunningOperation(argoCDService: ArgoCDServiceProvider, applicationName: string): Promise<boolean> {
    console.log('🔍 Checking for running operations...');

    const httpClient = argoCDService.createHttpClient();

    // Parse namespace/name format (CLI-style) if present
    let appName = applicationName;
    let appNamespace: string | undefined;

    if (applicationName.includes('/')) {
        const parts = applicationName.split('/');
        if (parts.length === 2) {
            appNamespace = parts[0];
            appName = parts[1];
        }
    }

    // Build URL with appNamespace query parameter if needed
    let url = `/api/v1/applications/${appName}`;
    if (appNamespace) {
        url += `?appNamespace=${appNamespace}`;
    }

    try {
        const response = await httpClient.get(url);
        const app = response.data;
        
        // Check if there's a running operation
        const operation = app.status?.operation;
        const operationState = app.status?.operationState;
        
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
        } else {
            console.log('   ℹ️  No running operations found');
            if (operationState) {
                console.log(`   Last operation state: ${operationState.phase} (${operationState.message || 'no message'})`);
            }
            return false;
        }
    } catch (error: any) {
        console.log(`   ⚠️  Error checking for operations: ${error instanceof Error ? error.message : error}`);
        return false; // Assume no operation if we can't check
    }
}

async function terminateSync(argoCDService: ArgoCDServiceProvider, applicationName: string, _project?: string): Promise<void> {
    console.log('🛑 Terminating running sync operation...');

    const httpClient = argoCDService.createHttpClient();

    // Parse namespace/name format (CLI-style) if present
    let appName = applicationName;
    let appNamespace: string | undefined;

    if (applicationName.includes('/')) {
        const parts = applicationName.split('/');
        if (parts.length === 2) {
            appNamespace = parts[0];
            appName = parts[1];
        }
    }

    // Build URL with appNamespace query parameter if needed
    let url = `/api/v1/applications/${appName}/operation`;
    if (appNamespace) {
        url += `?appNamespace=${appNamespace}`;
    }

    console.log(`   Request URL: ${url}`);
    
    try {
        const response = await httpClient.delete(url);
        if (response.status === 200 || response.status === 202) {
            console.log('✅ Sync termination request sent');
        } else {
            console.log(`⚠️  Sync termination returned status: ${response.status}`);
        }
    } catch (error: any) {
        if (error.response?.status === 404) {
            console.log('ℹ️  No running sync operation found to terminate');
        } else if (error.response?.data?.message) {
            console.log(`⚠️  Sync termination failed: ${error.response.data.message}`);
        } else {
            console.log(`⚠️  Sync termination error: ${error instanceof Error ? error.message : error}`);
        }
    }
}

// Run the task
run();