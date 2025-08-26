# ArgoCD Integration for Azure DevOps

**Seamless GitOps continuous delivery from Azure Pipelines to Kubernetes clusters**

## 🚀 Key Features

- **🔗 Secure Service Connection** - JWT token authentication with ArgoCD servers
- **🔄 Application Sync** - Deploy applications with comprehensive sync operations  
- **🔍 Application Refresh** - Monitor and validate application state changes
- **📊 Real-time Monitoring** - Track sync progress with detailed logging
- **🛡️ Health Validation** - Comprehensive application health checking
- **🎯 Project-based Filtering** - Selective operations by ArgoCD project
- **⏱️ Timeout Management** - Configurable sync timeouts with intelligent handling
- **🔧 Dry Run Support** - Preview changes before deployment

## 📦 What's Included

### ArgoCD Application Sync Task
Trigger synchronization of ArgoCD applications to deploy the latest changes from Git repositories to Kubernetes clusters.

**Key Capabilities:**
- Multiple sync strategies (apply, hook, force)
- Resource pruning for cleanup
- Revision-specific deployments  
- Comprehensive error handling

### ArgoCD Application Refresh Task  
Refresh application status and monitor for changes with intelligent health validation.

**Key Capabilities:**
- Hard refresh for cache clearing
- Comprehensive status monitoring
- Error/warning condition detection
- Unknown status handling

### ArgoCD Service Connection
Secure connection management with support for:
- JWT token authentication
- Self-signed certificate handling
- Connection testing and validation
- Dynamic application/project discovery

## 🏗️ Perfect for GitOps Workflows

This extension enables true GitOps continuous delivery by seamlessly integrating Azure DevOps Pipelines with ArgoCD:

1. **Code changes** pushed to Git repositories
2. **Azure Pipelines** build and test your applications  
3. **ArgoCD Integration** deploys to Kubernetes clusters
4. **Real-time monitoring** ensures successful deployment

## 🛠️ Quick Start

1. **Install the extension** from the marketplace
2. **Create an ArgoCD service connection** in Project Settings
3. **Add ArgoCD tasks** to your Azure Pipelines
4. **Deploy with confidence** using GitOps best practices

```yaml
- task: ArgocdSync@1
  displayName: 'Deploy to Production'
  inputs:
    argoCDConnection: 'Production ArgoCD'
    applicationName: 'my-app'
    waitForSync: true
    syncTimeout: '600'
```

## 🔒 Enterprise Ready

- **Security first** with proper token management and RBAC
- **Multi-cluster support** for complex environments
- **Comprehensive logging** for audit and debugging
- **Error handling** with retry capabilities
- **Integration ready** with Azure Key Vault and notification systems

## 📋 Requirements

- Azure DevOps Services or Server 2019+
- ArgoCD server with API access
- Kubernetes cluster managed by ArgoCD
- JWT API token for authentication

---

**Transform your deployment pipeline with GitOps excellence!**