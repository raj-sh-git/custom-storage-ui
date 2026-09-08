# Azure Storage UI Manager (v2.1)

<img width="2880" height="1622" alt="image" src="https://github.com/user-attachments/assets/f068c15f-f548-455c-a697-98dbd15b125f" />


A lightweight, modern, and high-performance web interface for managing Azure Storage Accounts. This tool provides a unified, beautiful glassmorphic explorer to inspect and execute CRUD operations on **Blob Containers**, **File Shares**, **Message Queues**, and **NoSQL Tables**, featuring a robust **Bulk Creator Studio** via CSV/Excel uploads.

## Use Cases

This application is designed to solve common challenges when working with secure, enterprise Azure Storage environments:

1. **Accessing Private Production Data:**
   Production Azure Storage Accounts are routinely secured behind private Virtual Networks (VNets), Service Endpoints, or strict firewall rules, completely blocking access from external developer workstations or the public Azure Portal. By deploying this lightweight Python application directly inside your Azure Kubernetes Service (AKS) cluster or an Azure Container App in the same VNet, you can securely inspect files, manage queues, and query tables directly from within your private network without exposing storage credentials or endpoints to the public internet.

2. **Bulk Resource Provisioning (Containers, Shares, Queues, Tables):**
   When preparing Dev, Test, or Staging environments, setting up multiple storage structures manually (e.g. 10 blob containers for logs, 5 file shares for application state, 20 message queues, and multiple tables) is slow and error-prone. This tool features a dedicated **Bulk Resource Creator** that accepts a simple CSV or Excel (`.xlsx`) upload to instantly batch-create dozens of storage structures in seconds, streamlining environments bootstrapping.

3. **Unified Multi-Format Storage Console:**
   Instead of jumping between multiple portals or heavy client tools, developers and operations teams get a single, responsive portal that handles four distinct Azure storage architectures (unstructured Blobs, SMB File Shares, Message Queues, and NoSQL Tables) simultaneously, authenticated securely using Connection Strings, Account Keys, or AAD Service Principal credentials.

## Features & What's New in v2.1

- **✨ Queue Multi-Select & Bulk Dequeue**: Select single or multiple queue messages via checkboxes. Pull off and permanently delete selected messages in batch with confirmation dialogs.
- **✨ In-Place Queue Message Editor**: Inspect, view, and live-edit message payloads in a monospace editor and update them directly back to the Azure Queue with immediate visibility reset.
- **✨ Cross-Queue Routing & Re-enqueue (Move / Copy)**: Send single or multiple messages to another queue in the storage account. Select target queue from a dynamic dropdown, choose between **Move** (enqueue to target + delete from source) or **Copy** (keep in source), and select encoding format.
- **✨ Native Base64 & Plain Text Enqueueing**:
  - **Base64 Encoding (Recommended)**: Auto-encodes message payloads into Base64 UTF-8 strings before enqueuing. Essential for **Azure Functions, Azure WebJobs, and Logic Apps** queue triggers to prevent messages from failing deserialization and being routed directly into the poison queue (`{queue}-poison`).
  - **Plain Text (Raw UTF-8)**: Supports raw unencoded text payloads for custom non-Azure-Function consumers.
  - **Smart Decoding**: Automatically detects Base64 payloads, renders decoded human-readable previews, and provides quick toggles to view raw payloads.
- **✨ Multi-Select Bulk Blob Deletion & Download**: Select individual or all blobs across pages with checkboxes. Batch-delete or download selected files as a single file or compressed ZIP archive.
- **✨ Download All as ZIP & Empty Container**: One-click download of all blobs in a container as a ZIP file, or purge all files with the "Empty Container" action.
- **✨ In-Browser Blob File Editor**: View, edit, and save text, JSON, YAML, Markdown, XML, CSV, shell scripts, and code files directly back to Azure Storage with character/size feedback in a centered modal.
- **✨ Instant Search & Path Filter**: Real-time client-side and backend search bar with one-click clear button to quickly filter large volumes of blobs and queue messages.
- **✨ Scalable Pagination & Page Size Selector**: Configurable page sizes (`10`, `15`, `20`, `50`, `100` rows per page) with fast slicing, Last Modified timestamps, and page navigation.
- **✨ Live Upload Progress & Timeout Protection**: Asynchronous multi-file uploads with percentage and byte-level progress bar, 180s timeout, and 502/504 gateway timeout protection with retry options.
- **✨ Version 2.1 Changelog Popover**: Interactive version badge displaying changelog details on hover or focus.
- **Bulk Creator Studio**: Dropdown selector to choose your target service type and upload a CSV or Excel (`.xlsx`) list of names to provision them in bulk with full error-reporting.
- **Blob Storage Explorer**:
  - Simulative nested folder structure creation.
  - Multi-file drag-drop or click uploads.
  - High-performance blob downloading and deleting.
  - **Top-Level Container Deletion**: Fast container teardowns protected with JavaScript confirmation prompts.
- **File Share Manager**: Directory browser supporting bulk files uploads, file downloads, and file deletions.
- **Message Queue Studio**: Inspect, peek, enqueue new messages, dequeue individually, or clean-wipe queues (dequeue-all) with automatic Base64 parsing.
- **NoSQL Table Browser**: Query and view entities, insert new records (partition key, row key, and optional property-value pairs), and delete selected entities.
- **3-Tab Secure Auth**: Securely connect and cache details locally via Connection Strings, Access Keys, or Entra ID Service Principals (Tenant ID, Client ID, Client Secret).
- **Premium Glassmorphic UI**: Beautiful dark/light theme switching with custom Outfit and Inter typography and fluent animations.

---

## Deployment & Setup

### Local Installation

1. **Clone and navigate to the project directory:**
   ```bash
   cd storage-ui
   ```

2. **Create and activate a Python virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install the dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Launch the ASGI server using Uvicorn:**
   ```bash
   uvicorn asgi:app --host 0.0.0.0 --port 8000
   ```
   The application will be accessible locally at `http://localhost:8000/storage-ui/`.

---

## Docker Deployment

This project includes a multi-stage, highly optimized `Dockerfile` based on `python:3.12-alpine` to produce extremely small, secure container footprints suitable for AKS deployments.

### 1. Build the Docker Image
```bash
docker build -t storage-ui:latest .
```

### 2. Run the Container Locally
```bash
docker run -p 8000:8000 storage-ui:latest
```
Access the dashboard in your browser at `http://localhost:8000/storage-ui/`.

### 3. Deploying to AKS (Azure Kubernetes Service)
For secure VNet deployments:
1. Push the built image to your internal **Azure Container Registry (ACR)** or You can pull it from dockerhub `https://hub.docker.com/r/dockercustom/cosmos-ui`
2. Define a Kubernetes Deployment exposing port `8000`.
3. Add a Service and map the path `/storage-ui` in your AKS Ingress controller. The application's ProxyFix middleware and `/storage-ui` blueprint prefix ensure that all static assets and redirects resolve perfectly behind reverse proxies.
4. Ensure your AKS subnets have the required VNet peerings or private link endpoints configured to access the private storage endpoints.
