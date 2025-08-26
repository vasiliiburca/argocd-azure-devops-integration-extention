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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createArgoCDServiceProvider = exports.ArgoCDServiceProvider = void 0;
const tl = __importStar(require("azure-pipelines-task-lib/task"));
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
/**
 * Service provider that handles ArgoCD service connection operations
 * and provides a unified interface for all ArgoCD interactions
 */
class ArgoCDServiceProvider {
    constructor(serviceConnectionName) {
        this.credentials = null;
        this.httpClient = null;
        this.connectionName = serviceConnectionName;
    }
    /**
     * Initialize the service provider with credentials from the service connection
     */
    async initialize() {
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
        }
        catch (error) {
            throw new Error(`Failed to initialize ArgoCD service provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Get connection configuration for external use
     */
    getConnectionConfig() {
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
    async getVersion() {
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
        }
        catch (error) {
            throw new Error(`Failed to get ArgoCD version: ${this.getErrorMessage(error)}`);
        }
    }
    /**
     * Test connection to ArgoCD server by getting version and listing projects
     */
    async testConnection() {
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
        }
        catch (error) {
            return {
                success: false,
                message: `Connection failed: ${this.getErrorMessage(error)}`
            };
        }
    }
    /**
     * Get all applications accessible to the authenticated user
     */
    async getApplications(project) {
        if (!this.httpClient) {
            throw new Error('Service provider not initialized');
        }
        try {
            const url = project ? `/api/v1/applications?projects=${project}` : '/api/v1/applications';
            const response = await this.httpClient.get(url);
            if (!response.data || !response.data.items) {
                return [];
            }
            return response.data.items.map((app) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
                return ({
                    name: ((_a = app.metadata) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown',
                    project: ((_b = app.spec) === null || _b === void 0 ? void 0 : _b.project) || 'default',
                    namespace: (_d = (_c = app.spec) === null || _c === void 0 ? void 0 : _c.destination) === null || _d === void 0 ? void 0 : _d.namespace,
                    server: (_f = (_e = app.spec) === null || _e === void 0 ? void 0 : _e.destination) === null || _f === void 0 ? void 0 : _f.server,
                    syncStatus: ((_h = (_g = app.status) === null || _g === void 0 ? void 0 : _g.sync) === null || _h === void 0 ? void 0 : _h.status) || 'Unknown',
                    lastSyncStatus: ((_k = (_j = app.status) === null || _j === void 0 ? void 0 : _j.operationState) === null || _k === void 0 ? void 0 : _k.phase) === 'Succeeded' ? 'Synced' :
                        ((_m = (_l = app.status) === null || _l === void 0 ? void 0 : _l.operationState) === null || _m === void 0 ? void 0 : _m.phase) === 'Failed' ? 'Failed' :
                            ((_p = (_o = app.status) === null || _o === void 0 ? void 0 : _o.operationState) === null || _p === void 0 ? void 0 : _p.phase) === 'Error' ? 'Error' :
                                ((_s = (_r = (_q = app.status) === null || _q === void 0 ? void 0 : _q.operationState) === null || _r === void 0 ? void 0 : _r.syncResult) === null || _s === void 0 ? void 0 : _s.status) ||
                                    ((_u = (_t = app.status) === null || _t === void 0 ? void 0 : _t.sync) === null || _u === void 0 ? void 0 : _u.status) || 'Unknown',
                    healthStatus: ((_w = (_v = app.status) === null || _v === void 0 ? void 0 : _v.health) === null || _w === void 0 ? void 0 : _w.status) || 'Unknown',
                    revision: (_y = (_x = app.status) === null || _x === void 0 ? void 0 : _x.sync) === null || _y === void 0 ? void 0 : _y.revision,
                    operationState: (_z = app.status) === null || _z === void 0 ? void 0 : _z.operationState,
                    conditions: ((_0 = app.status) === null || _0 === void 0 ? void 0 : _0.conditions) || []
                });
            });
        }
        catch (error) {
            throw new Error(`Failed to get applications: ${this.getErrorMessage(error)}`);
        }
    }
    /**
     * Get all projects accessible to the authenticated user
     */
    async getProjects() {
        if (!this.httpClient) {
            throw new Error('Service provider not initialized');
        }
        try {
            const response = await this.httpClient.get('/api/v1/projects');
            if (!response.data || !response.data.items) {
                return [];
            }
            return response.data.items.map((project) => {
                var _a, _b, _c, _d;
                return ({
                    name: ((_a = project.metadata) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown',
                    description: (_b = project.spec) === null || _b === void 0 ? void 0 : _b.description,
                    sourceRepos: ((_c = project.spec) === null || _c === void 0 ? void 0 : _c.sourceRepos) || [],
                    destinations: ((_d = project.spec) === null || _d === void 0 ? void 0 : _d.destinations) || []
                });
            });
        }
        catch (error) {
            throw new Error(`Failed to get projects: ${this.getErrorMessage(error)}`);
        }
    }
    /**
     * Get detailed information about a specific application
     */
    async getApplication(applicationName, project) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2;
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
            if (project && ((_a = app.spec) === null || _a === void 0 ? void 0 : _a.project) !== project) {
                throw new Error(`Application '${applicationName}' not found in project '${project}'`);
            }
            return {
                name: ((_b = app.metadata) === null || _b === void 0 ? void 0 : _b.name) || applicationName,
                project: ((_c = app.spec) === null || _c === void 0 ? void 0 : _c.project) || 'default',
                namespace: (_e = (_d = app.spec) === null || _d === void 0 ? void 0 : _d.destination) === null || _e === void 0 ? void 0 : _e.namespace,
                server: (_g = (_f = app.spec) === null || _f === void 0 ? void 0 : _f.destination) === null || _g === void 0 ? void 0 : _g.server,
                syncStatus: ((_j = (_h = app.status) === null || _h === void 0 ? void 0 : _h.sync) === null || _j === void 0 ? void 0 : _j.status) || 'Unknown',
                lastSyncStatus: ((_l = (_k = app.status) === null || _k === void 0 ? void 0 : _k.operationState) === null || _l === void 0 ? void 0 : _l.phase) === 'Succeeded' ? 'Synced' :
                    ((_o = (_m = app.status) === null || _m === void 0 ? void 0 : _m.operationState) === null || _o === void 0 ? void 0 : _o.phase) === 'Failed' ? 'Failed' :
                        ((_q = (_p = app.status) === null || _p === void 0 ? void 0 : _p.operationState) === null || _q === void 0 ? void 0 : _q.phase) === 'Error' ? 'Error' :
                            ((_t = (_s = (_r = app.status) === null || _r === void 0 ? void 0 : _r.operationState) === null || _s === void 0 ? void 0 : _s.syncResult) === null || _t === void 0 ? void 0 : _t.status) ||
                                ((_v = (_u = app.status) === null || _u === void 0 ? void 0 : _u.sync) === null || _v === void 0 ? void 0 : _v.status) || 'Unknown',
                healthStatus: ((_x = (_w = app.status) === null || _w === void 0 ? void 0 : _w.health) === null || _x === void 0 ? void 0 : _x.status) || 'Unknown',
                revision: (_z = (_y = app.status) === null || _y === void 0 ? void 0 : _y.sync) === null || _z === void 0 ? void 0 : _z.revision,
                operationState: (_0 = app.status) === null || _0 === void 0 ? void 0 : _0.operationState,
                conditions: ((_1 = app.status) === null || _1 === void 0 ? void 0 : _1.conditions) || []
            };
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && ((_2 = error.response) === null || _2 === void 0 ? void 0 : _2.status) === 404) {
                throw new Error(`Application '${applicationName}' not found`);
            }
            throw new Error(`Failed to get application '${applicationName}': ${this.getErrorMessage(error)}`);
        }
    }
    /**
     * Check if an application exists
     */
    async applicationExists(applicationName, project) {
        try {
            await this.getApplication(applicationName, project);
            return true;
        }
        catch (error) {
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
    createHttpClient() {
        if (!this.credentials) {
            throw new Error('Service provider not initialized');
        }
        const authHeaders = this.getAuthenticationHeaders();
        const config = {
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
        return axios_1.default.create(config);
    }
    /**
     * Get application names for use in task input dropdowns
     */
    async getApplicationNames(project) {
        try {
            const applications = await this.getApplications(project);
            return applications.map(app => app.name).sort((a, b) => a.localeCompare(b));
        }
        catch (error) {
            console.warn(`Failed to get application names: ${this.getErrorMessage(error)}`);
            return [];
        }
    }
    /**
     * Get project names for use in task input dropdowns
     */
    async getProjectNames() {
        try {
            const projects = await this.getProjects();
            return projects.map(project => project.name).sort((a, b) => a.localeCompare(b));
        }
        catch (error) {
            console.warn(`Failed to get project names: ${this.getErrorMessage(error)}`);
            return [];
        }
    }
    /**
     * Get service connection credentials from Azure DevOps
     */
    getServiceConnectionCredentials() {
        var _a, _b, _c;
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
        let credentials = {
            serverUrl: serverUrl,
            authScheme: authScheme,
            skipCertificateValidation: skipCertValidation
        };
        if (authScheme === 'Token') {
            credentials.apiToken = (_a = endpointAuth.parameters) === null || _a === void 0 ? void 0 : _a['apitoken'];
        }
        else if (authScheme === 'UsernamePassword') {
            credentials.username = (_b = endpointAuth.parameters) === null || _b === void 0 ? void 0 : _b['username'];
            credentials.password = (_c = endpointAuth.parameters) === null || _c === void 0 ? void 0 : _c['password'];
        }
        console.log(`📋 Authentication configured with scheme: ${credentials.authScheme}`);
        return credentials;
    }
    /**
     * Get certificate validation setting from endpoint configuration
     */
    getCertificateValidationSetting(endpointAuth) {
        var _a;
        // First, try to get it from endpoint data parameters
        try {
            const certParam = tl.getEndpointDataParameter(this.connectionName, 'skipCertificateValidation', false);
            if (certParam !== null && certParam !== undefined) {
                return certParam === 'true';
            }
        }
        catch (_b) {
            // Try to get it from auth parameters as fallback
            const authCertParam = (_a = endpointAuth.parameters) === null || _a === void 0 ? void 0 : _a['skipCertificateValidation'];
            if (authCertParam !== undefined && authCertParam !== null) {
                return authCertParam === 'true';
            }
        }
        return false;
    }
    /**
     * Validate that we have the required credentials
     */
    validateCredentials(credentials) {
        if (!credentials.serverUrl) {
            return false;
        }
        if (credentials.authScheme === 'Token') {
            return !!credentials.apiToken;
        }
        else if (credentials.authScheme === 'UsernamePassword') {
            return !!(credentials.username && credentials.password);
        }
        return false;
    }
    /**
     * Get authentication headers based on the auth scheme
     */
    getAuthenticationHeaders() {
        if (!this.credentials) {
            throw new Error('Credentials not initialized');
        }
        if (this.credentials.authScheme === 'Token' && this.credentials.apiToken) {
            return {
                'Authorization': `Bearer ${this.credentials.apiToken}`
            };
        }
        else if (this.credentials.authScheme === 'UsernamePassword' && this.credentials.username && this.credentials.password) {
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
    initializeHttpClient() {
        if (!this.credentials) {
            throw new Error('Credentials not initialized');
        }
        this.httpClient = this.createHttpClient();
    }
    /**
     * Extract a user-friendly error message from an error object
     */
    getErrorMessage(error) {
        var _a, _b, _c, _d;
        if (axios_1.default.isAxiosError(error)) {
            if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 401) {
                return 'Authentication failed - check your credentials';
            }
            else if (((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 403) {
                return 'Access forbidden - check your permissions';
            }
            else if ((_d = (_c = error.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.message) {
                return error.response.data.message;
            }
            else if (error.code === 'ECONNREFUSED') {
                return 'Connection refused - check server URL and network connectivity';
            }
            else if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
                return 'Certificate validation failed - consider enabling "Skip Certificate Validation"';
            }
            return error.message || 'HTTP request failed';
        }
        return error instanceof Error ? error.message : 'Unknown error';
    }
}
exports.ArgoCDServiceProvider = ArgoCDServiceProvider;
/**
 * Factory function to create and initialize an ArgoCD service provider
 */
async function createArgoCDServiceProvider(serviceConnectionName) {
    const provider = new ArgoCDServiceProvider(serviceConnectionName);
    await provider.initialize();
    return provider;
}
exports.createArgoCDServiceProvider = createArgoCDServiceProvider;
//# sourceMappingURL=argocd-service-provider.js.map