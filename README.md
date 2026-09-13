# Azure Storage UI Manager

<img width="2880" height="1622" alt="image" src="https://github.com/user-attachments/assets/f068c15f-f548-455c-a697-98dbd15b125f" />

[![Docker Pulls](https://img.shields.io/docker/pulls/opsutility/storage-ui)](https://hub.docker.com/r/opsutility/storage-ui)
[![Docker Image Version](https://img.shields.io/docker/v/opsutility/storage-ui?sort=semver)](https://hub.docker.com/r/opsutility/storage-ui)
[![Docker Image Size](https://img.shields.io/docker/image-size/opsutility/storage-ui/latest)](https://hub.docker.com/r/opsutility/storage-ui)
[![Multi-Arch](https://img.shields.io/badge/arch-amd64%20%7C%20arm64-blue)](https://hub.docker.com/r/opsutility/storage-ui)

A lightweight, modern, and high-performance web interface for managing Azure Storage Accounts. This tool provides a unified, beautiful glassmorphic explorer to inspect and execute CRUD operations on **Blob Containers**, **File Shares**, **Message Queues**, and **NoSQL Tables**, featuring **Authentication & RBAC**, **Portal User Management**, **Activity & Audit Logging**, **Date Range Filters**, and a robust **Bulk Creator Studio** via CSV/Excel uploads.

---

## Use Cases

This application is designed to solve common challenges when working with secure, enterprise Azure Storage environments:

1. **Accessing Private Production Data:**
   Production Azure Storage Accounts are routinely secured behind private Virtual Networks (VNets), Service Endpoints, or strict firewall rules, completely blocking access from external developer workstations or the public Azure Portal. By deploying this lightweight container directly inside your Azure Kubernetes Service (AKS) cluster or an Azure Container App in the same VNet, you can securely inspect files, manage queues, and query tables directly from within your private network without exposing storage credentials or endpoints to the public internet.

2. **Enterprise Governance & RBAC:**
   Control access through granular roles (**Admin**, **Contributor**, **Reader**) with one-way salted password hashing (`scrypt`). Restrict non-admin users from viewing or modifying internal system tables and track all operations through a comprehensive **Activity & Audit Log**.

3. **Bulk Resource Provisioning (Containers, Shares, Queues, Tables):**
   When preparing Dev, Test, or Staging environments, setting up multiple storage structures manually is slow and error-prone. This tool features a dedicated **Bulk Resource Creator** that accepts a simple CSV or Excel (`.xlsx`) upload to instantly batch-create dozens of storage structures in seconds.

4. **Unified Multi-Format Storage Console:**
   Instead of jumping between multiple portals or heavy client tools, developers and operations teams get a single, responsive portal that handles four distinct Azure storage architectures (unstructured Blobs, SMB File Shares, Message Queues, and NoSQL Tables) simultaneously.

---

## Features

### 🔐 Authentication, RBAC & Audit Logging
- **Day-0 Initial Admin Setup Wizard**: Automatically bootstraps the master `Admin` account when connecting to storage for the first time.
- **Role-Based Access Control (RBAC)**:
  - **`Admin`**: Full access to all 4 storage services, resource creation/deletion, User Management (`/users`), and Activity Log Explorer (`/activity-logs`).
  - **`Contributor`**: Read, upload, edit, rename, move, and delete files/messages/entities within resources; blocked from User Management and destructive root deletions.
  - **`Reader`**: Read-only viewer mode across Blobs, File Shares, Message Queues, and Tables (all mutating actions hidden and backend-rejected).
- **Portal User Management (`/users`)**: Create, edit, disable/enable, reset passwords, or delete accounts, plus bulk user import via CSV/XLSX (`username,email,password,enforcepasswordreset,role`).
- **Enforce Password Reset**: Mandatory password change upon first login for newly provisioned or imported users.
- **Activity & Audit Logs Explorer (`/activity-logs`)**: Complete audit trail tracking user, role, client IP, action, target, timestamp, and status with filterable explorer and one-click CSV / JSON export.
- **System Table Privacy**: System tables (`StorageUIUsers`, `StorageUIActivityLogs`) are automatically filtered out from sidebar and browser for non-admin accounts.

### 📦 Storage Services
- **Blob Storage Explorer**:
  - Multi-select bulk deletion and bulk downloading as a single file or compressed ZIP archive.
  - In-browser file editor for text, JSON, YAML, Markdown, CSV, XML, and code files.
  - Download all container blobs as ZIP or clean-wipe with the "Empty Container" action.
  - Asynchronous multi-file uploads with real-time percentage and byte-level progress bar.
  - Date Range filtering (`From` / `To` modified date) and instant search.
- **File Share Manager**:
  - SMB file share browser with directory navigation, multi-file uploads, file downloads, editing, renaming, moving, and deletion.
  - Date Range filtering and instant search.
- **Message Queue Studio**:
  - Multi-select bulk dequeue and delete messages in batch.
  - In-place message payload editor with live queue updates.
  - Cross-queue routing (Move or Copy messages between queues).
  - Native Base64 auto-encoding/decoding for Azure Functions / Logic Apps triggers, plus Plain Text mode.
  - Date Range filtering and instant search.
- **NoSQL Table Browser**:
  - Schema-less entity browser with JSON viewing, entity editing, duplication, copying across tables, and deletion.
  - Date Range filtering and instant search.
- **Bulk Resource Creator Studio**:
  - Batch provision Containers, Shares, Queues, or Tables from CSV or Excel (`.xlsx`) files.

---

## Docker Deployment (Recommended)

Official multi-architecture Docker images are published on Docker Hub for both **`linux/amd64`** and **`linux/arm64`** (Apple Silicon, AWS Graviton, Azure ARM VMs).

Docker Hub Repository: **[`opsutility/storage-ui`](https://hub.docker.com/r/opsutility/storage-ui)**

### 1. Pull the Image
```bash
docker pull opsutility/storage-ui:latest
```

### 2. Run the Container
```bash
docker run -d \
  --name storage-ui \
  -p 8000:8000 \
  opsutility/storage-ui:latest
```
Access the application in your browser at `http://localhost:8000/storage-ui/`.

---

## Environment Variables (Optional)

You can pass environment variables to customize table names or pre-configure storage connections:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `USER_TABLE` | `StorageUIUsers` | Azure Table name used for user authentication and credentials. |
| `LOGS_TABLE` | `StorageUIActivityLogs` | Azure Table name used for activity audit logging. |
| `SECRET_KEY` | *(Random UUID)* | Flask session encryption key. |
| `AZURE_STORAGE_CONNECTION_STRING` | *(None)* | Pre-configures storage connection using an Azure Connection String. |
| `AZURE_STORAGE_ACCOUNT_NAME` | *(None)* | Azure Storage Account name (used with Account Key or Entra ID). |
| `AZURE_STORAGE_ACCOUNT_KEY` | *(None)* | Azure Storage Account Shared Key. |
| `AZURE_TENANT_ID` | *(None)* | Microsoft Entra ID Tenant ID for Service Principal authentication. |
| `AZURE_CLIENT_ID` | *(None)* | Microsoft Entra ID Client ID (App ID). |
| `AZURE_CLIENT_SECRET` | *(None)* | Microsoft Entra ID Client Secret. |

---

## Deploying to Kubernetes / AKS

Deploy directly to your Azure Kubernetes Service cluster using the public image:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storage-ui
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: storage-ui
  template:
    metadata:
      labels:
        app: storage-ui
    spec:
      containers:
      - name: storage-ui
        image: opsutility/storage-ui:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 8000
        env:
        - name: USER_TABLE
          value: "StorageUIUsers"
        - name: LOGS_TABLE
          value: "StorageUIActivityLogs"
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: storage-ui
  namespace: default
spec:
  type: ClusterIP
  ports:
  - port: 8000
    targetPort: 8000
  selector:
    app: storage-ui
```

Map `/storage-ui` in your AKS Ingress controller (e.g. NGINX or Application Gateway Ingress). The built-in `ProxyFix` middleware and `/storage-ui` prefix ensure all assets, URLs, and redirects resolve properly behind reverse proxies.

---

## Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/raj-sh-git/custom-storage-ui.git
   cd custom-storage-ui
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Launch the ASGI application:**
   ```bash
   uvicorn asgi:app --host 0.0.0.0 --port 8000 --reload
   ```
   Open `http://localhost:8000/storage-ui/` in your browser.
