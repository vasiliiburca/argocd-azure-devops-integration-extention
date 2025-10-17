import { AxiosInstance } from 'axios';
export interface ArgoCDConnectionConfig {
    serverUrl: string;
    authHeaders: {
        [key: string]: string;
    };
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
export declare class ArgoCDServiceProvider {
    private credentials;
    private httpClient;
    private connectionName;
    constructor(serviceConnectionName: string);
    /**
     * Initialize the service provider with credentials from the service connection
     */
    initialize(): Promise<void>;
    /**
     * Get connection configuration for external use
     */
    getConnectionConfig(): ArgoCDConnectionConfig;
    /**
     * Get server version information
     */
    getVersion(): Promise<ArgoCDVersion>;
    /**
     * Test connection to ArgoCD server by getting version and listing projects
     */
    testConnection(): Promise<{
        success: boolean;
        message: string;
        version?: string;
    }>;
    /**
     * Get all applications accessible to the authenticated user
     */
    getApplications(project?: string): Promise<ArgoCDApplication[]>;
    /**
     * Get all projects accessible to the authenticated user
     */
    getProjects(): Promise<ArgoCDProject[]>;
    /**
     * Get detailed information about a specific application
     *
     * Supports CLI-style namespace/name format (e.g., "development/crm-backend")
     * or plain name format (e.g., "crm-backend")
     */
    getApplication(applicationName: string, project?: string): Promise<ArgoCDApplication>;
    /**
     * Check if an application exists
     */
    applicationExists(applicationName: string, project?: string): Promise<boolean>;
    /**
     * Create a pre-configured HTTP client for ArgoCD API calls
     * This can be used by tasks that need direct API access
     */
    createHttpClient(): AxiosInstance;
    /**
     * Get application names for use in task input dropdowns
     */
    getApplicationNames(project?: string): Promise<string[]>;
    /**
     * Get project names for use in task input dropdowns
     */
    getProjectNames(): Promise<string[]>;
    /**
     * Get service connection credentials from Azure DevOps
     */
    private getServiceConnectionCredentials;
    /**
     * Get certificate validation setting from endpoint configuration
     */
    private getCertificateValidationSetting;
    /**
     * Validate that we have the required credentials
     */
    private validateCredentials;
    /**
     * Get authentication headers based on the auth scheme
     */
    private getAuthenticationHeaders;
    /**
     * Initialize the internal HTTP client
     */
    private initializeHttpClient;
    /**
     * Extract a user-friendly error message from an error object
     */
    private getErrorMessage;
}
/**
 * Factory function to create and initialize an ArgoCD service provider
 */
export declare function createArgoCDServiceProvider(serviceConnectionName: string): Promise<ArgoCDServiceProvider>;
//# sourceMappingURL=argocd-service-provider.d.ts.map