# ArgoCD Integration for Azure DevOps

[![Version](https://img.shields.io/badge/version-1.4.1-blue.svg)](https://github.com/vburca/argocd-azure-devops-integration-extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Azure DevOps](https://img.shields.io/badge/Azure%20DevOps-Extension-blue.svg)](https://marketplace.visualstudio.com/)

A comprehensive Azure DevOps extension that enables seamless GitOps continuous delivery by integrating Azure Pipelines with ArgoCD. Deploy applications to Kubernetes clusters using ArgoCD's powerful GitOps workflow directly from your Azure DevOps pipelines.

## 🚀 Features

### Core Functionality
- **🔗 Service Connection**: Secure connection management with JWT token authentication
- **🔄 Application Sync**: Deploy applications with comprehensive sync operations
- **🔍 Application Refresh**: Monitor and validate application state changes
- **📊 Status Monitoring**: Real-time sync progress tracking with detailed logging
- **🛡️ Health Validation**: Comprehensive application health and condition checking
- **🔒 Security**: TLS certificate validation with configurable skip options

### Advanced Capabilities
- **⚡ Multi-Strategy Sync**: Support for apply, hook, and force sync strategies
- **🎯 Selective Operations**: Project-based application filtering
- **⏱️ Timeout Management**: Configurable sync timeouts with intelligent handling
- **🚨 Error Handling**: Comprehensive error detection and reporting
- **🔧 Dry Run Support**: Preview changes before deployment
- **🗑️ Resource Pruning**: Automatic cleanup of obsolete resources

## 📦 Installation

### From Azure DevOps Marketplace
1. Visit the [Azure DevOps Marketplace](https://marketplace.visualstudio.com/)
2. Search for "ArgoCD Integration"
3. Click "Get it free" and install to your organization

### Manual Installation
1. Download the latest `.vsix` file from [releases](https://github.com/vburca/argocd-azure-devops-integration-extension/releases)
2. Upload to your Azure DevOps organization:
   - Go to **Organization Settings** → **Extensions**
   - Click **Browse marketplace** → **Upload extension**
   - Select the downloaded `.vsix` file

## 🛠️ Configuration

### 1. Create ArgoCD Service Connection

Before using the tasks, configure an ArgoCD service connection:

1. Navigate to **Project Settings** → **Service connections**
2. Click **New service connection**
3. Select **ArgoCD** from the list
4. Fill in the connection details:

| Field | Description | Example |
|-------|-------------|---------|
| **Connection Name** | Friendly name for the connection | `Production ArgoCD` |
| **Server URL** | ArgoCD server endpoint | `https://argocd.example.com` |
| **API Token** | JWT token from ArgoCD | Generate using ArgoCD CLI |
| **Skip Certificate Validation** | For self-signed certificates | ☐ Unchecked (recommended) |

#### Generating ArgoCD API Token

```bash
# Login to ArgoCD
argocd login argocd.example.com --username admin

# Generate a token (replace 'azure-devops' with your preferred account name)
argocd account generate-token --account azure-devops
```

### 2. Configure Pipeline Permissions

Ensure your build service account has access to the service connection:
- Go to the service connection → **Security**
- Add your build service account with **User** permissions

## 📖 Usage

### ArgoCD Application Sync Task

The sync task triggers deployment of your applications to Kubernetes clusters.

#### YAML Pipeline Example

```yaml
steps:
- task: ArgocdSync@1
  displayName: 'Deploy to Production'
  inputs:
    argoCDConnection: 'Production ArgoCD'
    project: 'production'
    applicationName: 'web-app'
    syncPolicy: 'sync'
    waitForSync: true
    syncTimeout: '600'
    revision: '$(Build.SourceVersion)'
    prune: true
    dryRun: false
```

#### Classic Pipeline Configuration

1. Add **ArgoCD Application Sync** task to your pipeline
2. Configure the required parameters:
   - **ArgoCD Service Connection**: Select your configured connection
   - **Project**: (Optional) ArgoCD project name
   - **Application Name**: Select from dropdown or enter manually
   - **Sync Policy**: Choose sync operation type

#### Task Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `argoCDConnection` | ✅ | - | ArgoCD service connection |
| `project` | ❌ | - | ArgoCD project filter |
| `applicationName` | ✅ | - | Target application name |
| `syncPolicy` | ✅ | `sync` | Sync operation type |
| `waitForSync` | ❌ | `true` | Wait for completion |
| `syncTimeout` | ❌ | `300` | Timeout in seconds |
| `terminateRunningSync` | ❌ | `false` | Stop existing operations |
| `failOnTimeout` | ❌ | `false` | Fail task on timeout |
| `revision` | ❌ | - | Specific git revision |
| `strategy` | ❌ | `apply` | Sync strategy |
| `prune` | ❌ | `false` | Remove obsolete resources |
| `dryRun` | ❌ | `false` | Preview changes only |

### ArgoCD Application Refresh Task

The refresh task updates application status and monitors for changes.

#### YAML Pipeline Example

```yaml
steps:
- task: ArgocdRefresh@1
  displayName: 'Refresh Application Status'
  inputs:
    argoCDConnection: 'Production ArgoCD'
    applicationName: 'web-app'
    hardRefresh: false
    waitForChanges: true
    syncTimeout: '300'
    failOnWarnings: false
```

#### Task Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `argoCDConnection` | ✅ | - | ArgoCD service connection |
| `project` | ❌ | - | ArgoCD project filter |
| `applicationName` | ✅ | - | Target application name |
| `hardRefresh` | ❌ | `false` | Force cache refresh |
| `waitForChanges` | ❌ | `true` | Monitor for changes |
| `syncTimeout` | ❌ | `300` | Monitoring timeout |
| `failOnWarnings` | ❌ | `false` | Fail on warning conditions |
| `failOnDegraded` | ❌ | `true` | Fail on degraded health |
| `failOnUnknown` | ❌ | `false` | Fail on unknown status |

## 🏗️ Pipeline Patterns

### Basic Deployment Pipeline

```yaml
trigger:
  branches:
    include:
    - main

pool:
  vmImage: 'ubuntu-latest'

stages:
- stage: Deploy
  displayName: 'Deploy to Production'
  jobs:
  - job: ArgoCD_Sync
    displayName: 'Sync ArgoCD Application'
    steps:
    - task: ArgocdSync@1
      displayName: 'Deploy Application'
      inputs:
        argoCDConnection: 'Production ArgoCD'
        applicationName: 'my-application'
        waitForSync: true
        syncTimeout: '600'
```

### Multi-Environment Pipeline

```yaml
stages:
- stage: DeployStaging
  displayName: 'Deploy to Staging'
  jobs:
  - job: Staging_Deploy
    steps:
    - task: ArgocdSync@1
      inputs:
        argoCDConnection: 'Staging ArgoCD'
        project: 'staging'
        applicationName: 'web-app'
        dryRun: false

- stage: DeployProduction
  displayName: 'Deploy to Production'
  dependsOn: DeployStaging
  condition: succeeded()
  jobs:
  - job: Production_Deploy
    steps:
    - task: ArgocdRefresh@1
      displayName: 'Check Current State'
      inputs:
        argoCDConnection: 'Production ArgoCD'
        project: 'production'
        applicationName: 'web-app'
        hardRefresh: true
        
    - task: ArgocdSync@1
      displayName: 'Deploy to Production'
      inputs:
        argoCDConnection: 'Production ArgoCD'
        project: 'production'
        applicationName: 'web-app'
        waitForSync: true
        syncTimeout: '900'
        prune: true
```

### Rollback Pipeline

```yaml
parameters:
- name: targetRevision
  displayName: 'Target Revision (commit SHA, tag, or branch)'
  type: string
  default: 'HEAD~1'

steps:
- task: ArgocdSync@1
  displayName: 'Rollback Application'
  inputs:
    argoCDConnection: 'Production ArgoCD'
    applicationName: 'web-app'
    revision: '${{ parameters.targetRevision }}'
    waitForSync: true
    syncTimeout: '600'
    strategy: 'force'
```

## 🔧 Advanced Configuration

### Error Handling and Retries

```yaml
- task: ArgocdSync@1
  displayName: 'Deploy with Retry Logic'
  inputs:
    argoCDConnection: 'Production ArgoCD'
    applicationName: 'web-app'
    waitForSync: true
    syncTimeout: '300'
    failOnTimeout: true
  retryCountOnTaskFailure: 3
  continueOnError: false
```

### Conditional Deployment

```yaml
- task: ArgocdRefresh@1
  displayName: 'Check Application Status'
  inputs:
    argoCDConnection: 'Production ArgoCD'
    applicationName: 'web-app'
    waitForChanges: false

- task: ArgocdSync@1
  displayName: 'Deploy if Out of Sync'
  condition: and(succeeded(), eq(variables['Agent.JobStatus'], 'Succeeded'))
  inputs:
    argoCDConnection: 'Production ArgoCD'
    applicationName: 'web-app'
```

### Notification Integration

```yaml
- task: ArgocdSync@1
  displayName: 'Deploy Application'
  inputs:
    argoCDConnection: 'Production ArgoCD'
    applicationName: 'web-app'

- task: PowerShell@2
  displayName: 'Send Deployment Notification'
  condition: always()
  inputs:
    targetType: 'inline'
    script: |
      if ("$(Agent.JobStatus)" -eq "Succeeded") {
        Write-Host "✅ Deployment successful for $(applicationName)"
        # Send success notification
      } else {
        Write-Host "❌ Deployment failed for $(applicationName)"
        # Send failure notification
      }
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Connection Authentication Errors

**Error**: `Authentication failed - check your credentials`

**Solutions**:
- Verify the ArgoCD server URL is correct and accessible
- Ensure the API token is valid and not expired
- Check if the service connection has proper permissions
- Regenerate the ArgoCD API token if needed

```bash
# Test connection manually
curl -H "Authorization: Bearer YOUR_TOKEN" https://argocd.example.com/api/version
```

#### 2. Application Not Found

**Error**: `Application 'app-name' not found`

**Solutions**:
- Verify the application exists in ArgoCD
- Check if the project parameter is correct
- Ensure the service account has access to the application
- Confirm the application name spelling

#### 3. Sync Timeout Issues

**Error**: `Sync timeout reached after 300 seconds`

**Solutions**:
- Increase the `syncTimeout` parameter
- Check ArgoCD server performance and connectivity
- Review application complexity and resource requirements
- Enable `failOnTimeout: false` for non-critical deployments

#### 4. Certificate Validation Errors

**Error**: `Certificate validation failed`

**Solutions**:
- Enable "Skip Certificate Validation" in service connection
- Install proper CA certificates on build agents
- Use proper TLS certificates for ArgoCD server

### Debug Mode

Enable verbose logging by setting the system debug variable:

```yaml
variables:
  system.debug: true
```

### Log Analysis

The tasks provide comprehensive logging with emojis for easy scanning:

- 🚀 **Task startup**
- 🔗 **Connection establishment**
- 📋 **Configuration details**
- 🔄 **Sync operations**
- ⏳ **Progress monitoring**
- ✅ **Success states**
- ❌ **Error conditions**
- ⚠️ **Warnings**

## 🔒 Security Considerations

### Best Practices

1. **Token Management**
   - Use dedicated service accounts for CI/CD
   - Rotate API tokens regularly
   - Store tokens in Azure Key Vault when possible
   - Limit token permissions to minimum required

2. **Network Security**
   - Use HTTPS for all ArgoCD connections
   - Implement proper firewall rules
   - Consider VPN or private endpoints for production

3. **Access Control**
   - Follow least privilege principle
   - Use ArgoCD RBAC for fine-grained permissions
   - Regular audit of service connections and permissions

### ArgoCD RBAC Configuration

Example RBAC policy for CI/CD service account:

```yaml
# argocd-rbac-cm ConfigMap
policy.default: role:readonly
policy.csv: |
  p, role:ci-cd, applications, sync, */*, allow
  p, role:ci-cd, applications, get, */*, allow
  p, role:ci-cd, applications, action/*, */*, allow
  g, ci-cd-service-account, role:ci-cd
```

## 🏢 Enterprise Features

### Multi-Cluster Support

Configure different service connections for various environments:

```yaml
- task: ArgocdSync@1
  inputs:
    argoCDConnection: 'Production-US-East'
    applicationName: 'web-app-us'

- task: ArgocdSync@1
  inputs:
    argoCDConnection: 'Production-EU-West'
    applicationName: 'web-app-eu'
```

### Integration with Azure Key Vault

Store ArgoCD tokens securely:

```yaml
- task: AzureKeyVault@2
  displayName: 'Get ArgoCD Token'
  inputs:
    azureSubscription: 'Azure Service Connection'
    KeyVaultName: 'production-keyvault'
    SecretsFilter: 'argocd-api-token'
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/vburca/argocd-azure-devops-integration-extension.git
cd argocd-azure-devops-integration-extension

# Install dependencies
npm install

# Build the extension
npm run build

# Package for testing
npm run package
```

### Building from Source

```bash
# Compile TypeScript
npm run compile

# Build distribution files
npm run build

# Create VSIX package
npm run package

# Clean build artifacts
npm run clean
```

## 📈 Roadmap

- [ ] **App of Apps Support**: Enhanced support for ArgoCD App of Apps pattern
- [ ] **Webhook Integration**: Real-time status updates via webhooks
- [ ] **Metrics Integration**: Prometheus metrics collection
- [ ] **Blue-Green Deployments**: Native support for blue-green deployment patterns
- [ ] **Multi-Source Applications**: Support for applications with multiple sources
- [ ] **Resource Health Details**: Detailed Kubernetes resource health reporting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

### Documentation
- [ArgoCD Official Documentation](https://argo-cd.readthedocs.io/)
- [Azure DevOps Extensions Guide](https://docs.microsoft.com/en-us/azure/devops/extend/)

### Community Support
- [GitHub Issues](https://github.com/vburca/argocd-azure-devops-integration-extension/issues)
- [GitHub Discussions](https://github.com/vburca/argocd-azure-devops-integration-extension/discussions)

### Commercial Support
For enterprise support and consulting services, please contact [support@example.com](mailto:support@example.com).

---

**Made with ❤️ for the GitOps community**

*This extension bridges the gap between Azure DevOps and ArgoCD, enabling true GitOps workflows in enterprise environments.*