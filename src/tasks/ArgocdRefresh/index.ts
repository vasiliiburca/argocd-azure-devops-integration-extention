import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';

async function run() {
    try {
        console.log('🔄 Starting ArgoCD Application Refresh...');

        // Get task inputs
        const argoCDConnection = tl.getInput('argoCDConnection', true);
        const applicationName = tl.getInput('applicationName', true);
        const project = tl.getInput('project', false);
        const hardRefresh = tl.getBoolInput('hardRefresh', false);
        const waitForChanges = tl.getBoolInput('waitForChanges', false);
        const syncTimeout = parseInt(tl.getInput('syncTimeout', false) || '300');

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

        // Get initial application status before refresh
        console.log('📊 Getting current application status...');
        const appBefore = await argoCDService.getApplication(applicationName, project);
        console.log(`   Sync status before refresh: ${appBefore.syncStatus}`);
        console.log(`   Health status before refresh: ${appBefore.healthStatus}`);
        console.log(`   Current revision: ${appBefore.revision || 'unknown'}`);

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

        // Check if there are changes
        const hasChanges = appAfter.syncStatus === 'OutOfSync' || 
                          (appBefore.revision !== appAfter.revision && appAfter.revision);

        if (hasChanges) {
            console.log('🔍 Changes detected after refresh!');
            console.log(`   Previous revision: ${appBefore.revision || 'unknown'}`);
            console.log(`   Current revision: ${appAfter.revision || 'unknown'}`);
            console.log(`   Sync status: ${appAfter.syncStatus}`);

            if (waitForChanges && appAfter.syncStatus === 'OutOfSync') {
                console.log('⏳ Application is out of sync. Waiting for auto-sync to complete...');
                
                // Check if auto-sync is enabled by monitoring for sync operation
                const syncCompleted = await waitForAutoSync(argoCDService, applicationName, project, syncTimeout);
                
                if (syncCompleted) {
                    console.log('✅ Auto-sync completed successfully');
                } else {
                    console.log('ℹ️  Auto-sync not triggered or timed out');
                    console.log('   The application may not have auto-sync enabled');
                    console.log('   Current sync status: OutOfSync');
                    tl.warning('Application remains out of sync. Manual sync may be required.');
                }
            } else if (appAfter.syncStatus === 'Synced') {
                console.log('✅ Application is already synced with the latest changes');
            }
        } else {
            console.log('ℹ️  No changes detected after refresh');
            console.log('   Application is up to date with the Git repository');
        }

        // Final status report
        const finalApp = await argoCDService.getApplication(applicationName, project);
        console.log('\n📊 Final Application Status:');
        console.log(`   Sync Status: ${finalApp.syncStatus}`);
        console.log(`   Health Status: ${finalApp.healthStatus}`);
        console.log(`   Revision: ${finalApp.revision || 'unknown'}`);

        console.log('\n🎉 ArgoCD refresh operation completed successfully!');
        tl.setResult(tl.TaskResult.Succeeded, 'ArgoCD refresh completed successfully');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('💥 ArgoCD refresh failed:', errorMessage);
        tl.setResult(tl.TaskResult.Failed, `ArgoCD refresh failed: ${errorMessage}`);
    }
}

async function performRefresh(argoCDService: any, applicationName: string, project?: string, hard: boolean = false): Promise<any> {
    console.log(`🔄 Triggering ${hard ? 'hard ' : ''}refresh operation...`);
    
    const httpClient = argoCDService.createHttpClient();
    const url = project 
        ? `/api/v1/applications/${project}/${applicationName}?refresh=${hard ? 'hard' : 'normal'}`
        : `/api/v1/applications/${applicationName}?refresh=${hard ? 'hard' : 'normal'}`;
    
    console.log(`   Request URL: ${url}`);
    
    try {
        const response = await httpClient.get(url);
        if (response.status === 200) {
            console.log('✅ Refresh request completed');
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

async function waitForAutoSync(argoCDService: any, applicationName: string, project: string | undefined, timeoutSeconds: number = 300): Promise<boolean> {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    let lastStatus = '';
    let syncStarted = false;
    let initialCheck = true;
    
    console.log('⏳ Monitoring for auto-sync activity...');
    
    while (Date.now() - startTime < timeoutMs) {
        try {
            const app = await argoCDService.getApplication(applicationName, project);
            
            // Log status changes
            if (app.syncStatus !== lastStatus) {
                console.log(`   Status: ${app.syncStatus} | Health: ${app.healthStatus}`);
                lastStatus = app.syncStatus;
            }
            
            // Check if sync has started (status changes from OutOfSync to Syncing/Progressing)
            if (!syncStarted && (app.syncStatus === 'Syncing' || app.syncStatus === 'Progressing')) {
                console.log('🚀 Auto-sync has started!');
                syncStarted = true;
            }
            
            // If sync completed
            if (app.syncStatus === 'Synced') {
                if (syncStarted || !initialCheck) {
                    console.log('✅ Sync completed successfully');
                    if (app.healthStatus === 'Healthy') {
                        console.log('   Application is healthy');
                    } else {
                        console.log(`   Application health: ${app.healthStatus}`);
                    }
                    return true;
                }
            }
            
            // If still out of sync after initial wait, auto-sync might not be enabled
            if (initialCheck && Date.now() - startTime > 10000 && app.syncStatus === 'OutOfSync') {
                console.log('ℹ️  Application remains out of sync after 10 seconds');
                console.log('   Auto-sync may not be enabled for this application');
                return false;
            }
            
            initialCheck = false;
            
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            console.error('❌ Error checking sync status:', error instanceof Error ? error.message : error);
            // Continue checking - temporary errors shouldn't fail the wait
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // Timeout reached
    console.log(`⏰ Timeout reached after ${timeoutSeconds}s`);
    
    if (syncStarted) {
        console.log('⚠️  Auto-sync started but did not complete within timeout');
        return false;
    } else {
        console.log('ℹ️  No auto-sync activity detected');
        return false;
    }
}

// Run the task
run();