import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';

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

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('💥 ArgoCD sync failed:', errorMessage);
        tl.setResult(tl.TaskResult.Failed, `ArgoCD sync failed: ${errorMessage}`);
    }
}

async function performSync(
    argoCDService: any, 
    applicationName: string, 
    project?: string, 
    options: {
        revision?: string;
        strategy?: string;
        prune?: boolean;
        dryRun?: boolean;
    } = {}
) {
    console.log('🔄 Triggering sync operation...');
    
    const httpClient = argoCDService.createHttpClient();
    
    const syncRequest: any = {
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
    argoCDService: any, 
    applicationName: string, 
    project?: string, 
    hard: boolean = false
) {
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
    argoCDService: any, 
    applicationName: string, 
    project?: string, 
    timeoutSeconds: number = 300
) {
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
                } else if (app.healthStatus === 'Degraded' || app.healthStatus === 'Unknown') {
                    console.log(`⚠️  Sync completed but application health is: ${app.healthStatus}`);
                    tl.warning(`Application synced but health status is: ${app.healthStatus}`);
                    return;
                }
            } else if (app.syncStatus === 'OutOfSync') {
                console.log('⚠️  Application is out of sync after sync operation');
                tl.warning('Application appears to be out of sync after sync operation');
                return;
            }

            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, 5000));

        } catch (error) {
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
    } else {
        tl.warning(`Sync may still be in progress. Final status: ${finalApp.syncStatus}`);
    }
}

// Run the task
run();