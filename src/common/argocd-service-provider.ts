import * as tl from 'azure-pipelines-task-lib/task';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

export interface ArgoCDConnectionConfig {
    serverUrl: string;
    authHeaders: { [key: string]: string };
    skipCertificateValidation: boolean;
}

export interface ArgoCDApplication {
    name: string;
    project: string;
    namespace?: string;
    server?: string;
    syncStatus: string;
    lastSyncStatus?: string;
    healthStatus: string;
    revision?: string;
    operationState?: object;
    conditions?: Array<{
        type: string;
        status: string;
        severity?: string;
        message: string;
        reason?: string;
        lastTransitionTime?: string;
    }>;
}

export interface ArgoCDProject {
    name: string;
    description?: string;
    sourceRepos: string[];
    destinations: Array<{
        namespace: string;
        server: string;
    }>;
}

export interface ArgoCDVersion {
    version: string;
    buildDate?: string;
    gitCommit?: string;
    gitTag?: string;
    goVersion?: string;
    compiler?: string;
    platform?: string;
}

export interface ArgoCDCredentials {
    serverUrl: string;
    authScheme: 'Token' | 'UsernamePassword';
    apiToken?: string;
    username?: string;
    password?: string;
    skipCertificateValidation: boolean;
}

/**
 * Service provider that handles ArgoCD service connection operations
 * and provides a unified interface for all ArgoCD interactions
 */
export class ArgoCDServiceProvider {
    private credentials: ArgoCDCredentials | null = null;
    private httpClient: AxiosInstance | null = null;
    private connectionName: string;

    constructor(serviceConnectionName: string) {
        this.connectionName = serviceConnectionName;
    }

    /**
     * Initialize the service provider with credentials from the service connection
     */
    public async initialize(): Promise<void> {
        try {
            // Get credentials from service connection
            this.credentials = this.getServiceConnectionCredentials();
            
            // Validate credentials
            if (!this.validateCredentials(this.credentials)) {
                throw new Error('Invalid or incomplete credentials in service connection');
            }

            // Initialize HTTP client
            this.initializeHttpClient();
            
            console.log(`🔗 ArgoCD Service Provider initialized for: ${this.credentials.serverUrl}`);
        } catch (error) {
            throw new Error(`Failed to initialize ArgoCD service provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get connection configuration for external use
     */
    public getConnectionConfig(): ArgoCDConnectionConfig {
        if (!this.credentials) {
            throw new Error('Service provider not initialized');
        }
        
        return {
            serverUrl: this.credentials.serverUrl,
            authHeaders: this.getAuthenticationHeaders(),
            skipCertificateValidation: this.credentials.skipCertificateValidation
        };
    }

    /**
     * Get server version information
     */
    public async getVersion(): Promise<ArgoCDVersion> {
        if (!this.httpClient) {
            throw new Error('Service provider not initialized');
        }

        try {
            const response = await this.httpClient.get('/api/version');
            return {
                version: response.data.Version || 'Unknown',
                buildDate: response.data.BuildDate,
                gitCommit: response.data.GitCommit,
                gitTag: response.data.GitTag,
                goVersion: response.data.GoVersion,
                compiler: response.data.Compiler,
                platform: response.data.Platform
            };
        } catch (error) {
            throw new Error(`Failed to get ArgoCD version: ${this.getErrorMessage(error)}`);
        }
    }

    /**
     * Test connection to ArgoCD server by getting version and listing projects
     */
    public async testConnection(): Promise<{ success: boolean; message: string; version?: string }> {
        try {
            // First get version to verify URL
            const version = await this.getVersion();
            
            // Then test authentication by listing projects
            const projects = await this.getProjects();
            const projectCount = projects.length;
            
            return {
                success: true,
                message: `Successfully authenticated! Found ${projectCount} project${projectCount !== 1 ? 's' : ''}`,
                version: version.version
            };
        } catch (error) {
            return {
                success: false,
                message: `Connection failed: ${this.getErrorMessage(error)}`
            };
        }
    }

    /**
     * Get all applications accessible to the authenticated user
     */
    public async getApplications(project?: string): Promise<ArgoCDApplication[]> {
        if (!this.httpClient) {
            throw new Error('Service provider not initialized');
        }

        try {
            const url = project ? `/api/v1/applications?projects=${project}` : '/api/v1/applications';
            const response = await this.httpClient.get(url);
            
            if (!response.data || !response.data.items) {
                return [];
            }

            return response.data.items.map((app: any) => ({
                name: app.metadata?.name || 'Unknown',
                project: app.spec?.project || 'default',
                namespace: app.spec?.destination?.namespace,
                server: app.spec?.destination?.server,
                syncStatus: app.status?.sync?.status || 'Unknown',
                lastSyncStatus: app.status?.operationState?.phase === 'Succeeded' ? 'Synced' : 
                              app.status?.operationState?.phase === 'Failed' ? 'Failed' :
                              app.status?.operationState?.phase === 'Error' ? 'Error' :
                              app.status?.operationState?.syncResult?.status || 
                              app.status?.sync?.status || 'Unknown',
                healthStatus: app.status?.health?.status || 'Unknown',
                revision: app.status?.sync?.revision,
                operationState: app.status?.operationState,
                conditions: app.status?.conditions || []
            }));
        } catch (error) {
            throw new Error(`Failed to get applications: ${this.getErrorMessage(error)}`);
        }
    }

    /**
     * Get all projects accessible to the authenticated user
     */
    public async getProjects(): Promise<ArgoCDProject[]> {
        if (!this.httpClient) {
            throw new Error('Service provider not initialized');
        }

        try {
            const response = await this.httpClient.get('/api/v1/projects');
            
            if (!response.data || !response.data.items) {
                return [];
            }

            return response.data.items.map((project: any) => ({
                name: project.metadata?.name || 'Unknown',
                description: project.spec?.description,
                sourceRepos: project.spec?.sourceRepos || [],
                destinations: project.spec?.destinations || []
            }));
        } catch (error) {
            throw new Error(`Failed to get projects: ${this.getErrorMessage(error)}`);
        }
    }

    /**
     * Get detailed information about a specific application
     */
    public async getApplication(applicationName: string, project?: string): Promise<ArgoCDApplication> {
        if (!this.httpClient) {
            throw new Error('Service provider not initialized');
        }

        try {
            // ArgoCD API format is always /api/v1/applications/{appName}
            // Project filtering is done by checking the application spec
            const url = `/api/v1/applications/${applicationName}`;
            
            const response = await this.httpClient.get(url);
            const app = response.data;
            
            // If project is specified, verify the application belongs to that project
            if (project && app.spec?.project !== project) {
                throw new Error(`Application '${applicationName}' not found in project '${project}'`);
            }
            
            return {
                name: app.metadata?.name || applicationName,
                project: app.spec?.project || 'default',
                namespace: app.spec?.destination?.namespace,
                server: app.spec?.destination?.server,
                syncStatus: app.status?.sync?.status || 'Unknown',
                lastSyncStatus: app.status?.operationState?.phase === 'Succeeded' ? 'Synced' : 
                              app.status?.operationState?.phase === 'Failed' ? 'Failed' :
                              app.status?.operationState?.phase === 'Error' ? 'Error' :
                              app.status?.operationState?.syncResult?.status || 
                              app.status?.sync?.status || 'Unknown',
                healthStatus: app.status?.health?.status || 'Unknown',
                revision: app.status?.sync?.revision,
                operationState: app.status?.operationState,
                conditions: app.status?.conditions || []
            };
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                throw new Error(`Application '${applicationName}' not found`);
            }
            throw new Error(`Failed to get application '${applicationName}': ${this.getErrorMessage(error)}`);
        }
    }

    /**
     * Check if an application exists
     */
    public async applicationExists(applicationName: string, project?: string): Promise<boolean> {
        try {
            await this.getApplication(applicationName, project);
            return true;
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Create a pre-configured HTTP client for ArgoCD API calls
     * This can be used by tasks that need direct API access
     */
    public createHttpClient(): AxiosInstance {
        if (!this.credentials) {
            throw new Error('Service provider not initialized');
        }

        const authHeaders = this.getAuthenticationHeaders();
        const config: any = {
            baseURL: this.credentials.serverUrl,
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000
        };

        // Configure certificate validation
        if (this.credentials.skipCertificateValidation) {
            config.httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });
        }

        return axios.create(config);
    }

    /**
     * Get application names for use in task input dropdowns
     */
    public async getApplicationNames(project?: string): Promise<string[]> {
        try {
            const applications = await this.getApplications(project);
            return applications.map(app => app.name).sort((a, b) => a.localeCompare(b));
        } catch (error) {
            console.warn(`Failed to get application names: ${this.getErrorMessage(error)}`);
            return [];
        }
    }

    /**
     * Get project names for use in task input dropdowns
     */
    public async getProjectNames(): Promise<string[]> {
        try {
            const projects = await this.getProjects();
            return projects.map(project => project.name).sort((a, b) => a.localeCompare(b));
        } catch (error) {
            console.warn(`Failed to get project names: ${this.getErrorMessage(error)}`);
            return [];
        }
    }

    /**
     * Get service connection credentials from Azure DevOps
     */
    private getServiceConnectionCredentials(): ArgoCDCredentials {
        console.log(`📋 Configuring service connection: ${this.connectionName}`);
        
        const endpointAuth = tl.getEndpointAuthorization(this.connectionName, false);
        const serverUrl = tl.getEndpointUrl(this.connectionName, false);

        if (!serverUrl) {
            throw new Error('ArgoCD server URL not found in service connection');
        }

        if (!endpointAuth) {
            throw new Error('Authentication information not found in service connection');
        }

        const authScheme = endpointAuth.scheme;
        const skipCertValidation = this.getCertificateValidationSetting(endpointAuth);

        let credentials: ArgoCDCredentials = {
            serverUrl: serverUrl,
            authScheme: authScheme as 'Token' | 'UsernamePassword',
            skipCertificateValidation: skipCertValidation
        };

        if (authScheme === 'Token') {
            credentials.apiToken = endpointAuth.parameters?.['apitoken'];
        } else if (authScheme === 'UsernamePassword') {
            credentials.username = endpointAuth.parameters?.['username'];
            credentials.password = endpointAuth.parameters?.['password'];
        }

        console.log(`📋 Authentication configured with scheme: ${credentials.authScheme}`);
        return credentials;
    }

    /**
     * Get certificate validation setting from endpoint configuration
     */
    private getCertificateValidationSetting(endpointAuth: any): boolean {
        // First, try to get it from endpoint data parameters
        try {
            const certParam = tl.getEndpointDataParameter(this.connectionName, 'skipCertificateValidation', false);
            if (certParam !== null && certParam !== undefined) {
                return certParam === 'true';
            }
        } catch {
            // Try to get it from auth parameters as fallback
            const authCertParam = endpointAuth.parameters?.['skipCertificateValidation'];
            if (authCertParam !== undefined && authCertParam !== null) {
                return authCertParam === 'true';
            }
        }
        return false;
    }

    /**
     * Validate that we have the required credentials
     */
    private validateCredentials(credentials: ArgoCDCredentials): boolean {
        if (!credentials.serverUrl) {
            return false;
        }

        if (credentials.authScheme === 'Token') {
            return !!credentials.apiToken;
        } else if (credentials.authScheme === 'UsernamePassword') {
            return !!(credentials.username && credentials.password);
        }

        return false;
    }

    /**
     * Get authentication headers based on the auth scheme
     */
    private getAuthenticationHeaders(): { [key: string]: string } {
        if (!this.credentials) {
            throw new Error('Credentials not initialized');
        }

        if (this.credentials.authScheme === 'Token' && this.credentials.apiToken) {
            return {
                'Authorization': `Bearer ${this.credentials.apiToken}`
            };
        } else if (this.credentials.authScheme === 'UsernamePassword' && this.credentials.username && this.credentials.password) {
            const token = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
            return {
                'Authorization': `Basic ${token}`
            };
        }

        throw new Error('No valid authentication credentials available');
    }

    /**
     * Initialize the internal HTTP client
     */
    private initializeHttpClient(): void {
        if (!this.credentials) {
            throw new Error('Credentials not initialized');
        }
        this.httpClient = this.createHttpClient();
    }

    /**
     * Extract a user-friendly error message from an error object
     */
    private getErrorMessage(error: any): string {
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 401) {
                return 'Authentication failed - check your credentials';
            } else if (error.response?.status === 403) {
                return 'Access forbidden - check your permissions';
            } else if (error.response?.data?.message) {
                return error.response.data.message;
            } else if (error.code === 'ECONNREFUSED') {
                return 'Connection refused - check server URL and network connectivity';
            } else if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
                return 'Certificate validation failed - consider enabling "Skip Certificate Validation"';
            }
            return error.message || 'HTTP request failed';
        }
        return error instanceof Error ? error.message : 'Unknown error';
    }
}

/**
 * Factory function to create and initialize an ArgoCD service provider
 */
export async function createArgoCDServiceProvider(serviceConnectionName: string): Promise<ArgoCDServiceProvider> {
    const provider = new ArgoCDServiceProvider(serviceConnectionName);
    await provider.initialize();
    return provider;
}