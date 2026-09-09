import os
import io
import re
import math
import base64
import json
import uuid
import mimetypes
import csv
import openpyxl
import zipfile
from datetime import datetime, timezone
from flask import Flask, render_template, request, redirect, url_for, session, send_file, flash, Blueprint, jsonify
from flask_session import Session
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
from azure.storage.blob import BlobServiceClient, ContentSettings
from azure.storage.fileshare import ShareServiceClient
from azure.storage.queue import QueueServiceClient
from azure.data.tables import TableServiceClient, TableEntity, UpdateMode
from azure.core.exceptions import ResourceNotFoundError, HttpResponseError

# -----------------------
# Simple config
# -----------------------
app = Flask(__name__, static_url_path="/storage-ui/static")
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Server-side Session Configuration
SESSION_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "flask_sessions")
os.makedirs(SESSION_DIR, exist_ok=True)

app.secret_key = os.environ.get('SECRET_KEY', str(uuid.uuid4()))
app.config.update(
    SESSION_TYPE='filesystem',
    SESSION_FILE_DIR=SESSION_DIR,
    SESSION_PERMANENT=True,
    PERMANENT_SESSION_LIFETIME=86400, # 24 hours
)
Session(app)

# ---------- Blueprint ----------
ui = Blueprint("ui", __name__, url_prefix="/storage-ui")

# -----------------------
# Helpers & Client Providers
# -----------------------
def parse_account_name(conn_str):
    for part in conn_str.split(";"):
        if part.strip().startswith("AccountName="):
            return part.split("=", 1)[1]
    return "Storage Account"

def require_auth():
    return 'account_name' in session

def get_blob_service():
    method = session.get('auth_method')
    if method == 'Connection String':
        return BlobServiceClient.from_connection_string(session['conn_string'])
    elif method == 'Access Key':
        conn_str = f"DefaultEndpointsProtocol=https;AccountName={session['account_name']};AccountKey={session['account_key']};EndpointSuffix=core.windows.net"
        return BlobServiceClient.from_connection_string(conn_str)
    elif method == 'Service Principal':
        from azure.identity import ClientSecretCredential
        credential = ClientSecretCredential(session['tenant_id'], session['client_id'], session['client_secret'])
        return BlobServiceClient(account_url=f"https://{session['account_name']}.blob.core.windows.net", credential=credential)
    raise ValueError("Not authenticated")

def get_share_service():
    method = session.get('auth_method')
    if method == 'Connection String':
        return ShareServiceClient.from_connection_string(session['conn_string'])
    elif method == 'Access Key':
        conn_str = f"DefaultEndpointsProtocol=https;AccountName={session['account_name']};AccountKey={session['account_key']};EndpointSuffix=core.windows.net"
        return ShareServiceClient.from_connection_string(conn_str)
    elif method == 'Service Principal':
        from azure.identity import ClientSecretCredential
        credential = ClientSecretCredential(session['tenant_id'], session['client_id'], session['client_secret'])
        return ShareServiceClient(account_url=f"https://{session['account_name']}.file.core.windows.net", credential=credential)
    raise ValueError("Not authenticated")

def get_queue_service():
    method = session.get('auth_method')
    if method == 'Connection String':
        return QueueServiceClient.from_connection_string(session['conn_string'])
    elif method == 'Access Key':
        conn_str = f"DefaultEndpointsProtocol=https;AccountName={session['account_name']};AccountKey={session['account_key']};EndpointSuffix=core.windows.net"
        return QueueServiceClient.from_connection_string(conn_str)
    elif method == 'Service Principal':
        from azure.identity import ClientSecretCredential
        credential = ClientSecretCredential(session['tenant_id'], session['client_id'], session['client_secret'])
        return QueueServiceClient(account_url=f"https://{session['account_name']}.queue.core.windows.net", credential=credential)
    raise ValueError("Not authenticated")

def get_table_service():
    method = session.get('auth_method')
    if method == 'Connection String':
        return TableServiceClient.from_connection_string(session['conn_string'])
    elif method == 'Access Key':
        conn_str = f"DefaultEndpointsProtocol=https;AccountName={session['account_name']};AccountKey={session['account_key']};EndpointSuffix=core.windows.net"
        return TableServiceClient.from_connection_string(conn_str)
    elif method == 'Service Principal':
        from azure.identity import ClientSecretCredential
        credential = ClientSecretCredential(session['tenant_id'], session['client_id'], session['client_secret'])
        return TableServiceClient(endpoint=f"https://{session['account_name']}.table.core.windows.net", credential=credential)
    raise ValueError("Not authenticated")

def load_sidebar_tree():
    if not require_auth():
        return {}
    
    tree = {
        'containers': [],
        'shares': [],
        'queues': [],
        'tables': []
    }
    
    # 1. Containers
    try:
        blob_svc = get_blob_service()
        tree['containers'] = [c.name for c in blob_svc.list_containers(results_per_page=100)]
    except Exception as e:
        print(f"Error loading containers for sidebar: {e}")
        
    # 2. File Shares
    try:
        share_svc = get_share_service()
        tree['shares'] = [s.name for s in share_svc.list_shares(results_per_page=100)]
    except Exception as e:
        print(f"Error loading shares for sidebar: {e}")
        
    # 3. Queues
    try:
        queue_svc = get_queue_service()
        tree['queues'] = [q.name for q in queue_svc.list_queues(results_per_page=100)]
    except Exception as e:
        print(f"Error loading queues for sidebar: {e}")
        
    # 4. Tables
    try:
        table_svc = get_table_service()
        tables = list(table_svc.list_tables(results_per_page=100))
        tree['tables'] = [t.name if hasattr(t, "name") else str(t) for t in tables]
    except Exception as e:
        print(f"Error loading tables for sidebar: {e}")
        
    return tree

# -----------------------
# Auth Routes
# -----------------------
@ui.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        auth_method = request.form.get('auth_method')
        
        try:
            if auth_method == 'conn_str':
                conn_str = request.form.get('conn_string', '').strip()
                if not conn_str:
                    raise ValueError("Connection string required")
                # Test connection by listing containers
                client = BlobServiceClient.from_connection_string(conn_str)
                _ = list(client.list_containers(results_per_page=1))
                
                account_name = parse_account_name(conn_str)
                session['auth_method'] = 'Connection String'
                session['account_name'] = account_name
                session['conn_string'] = conn_str
                
            elif auth_method == 'key':
                account_name = request.form.get('account_name', '').strip()
                account_key = request.form.get('account_key', '').strip()
                if not account_name or not account_key:
                    raise ValueError("Account name and key required")
                
                conn_str = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={account_key};EndpointSuffix=core.windows.net"
                client = BlobServiceClient.from_connection_string(conn_str)
                _ = list(client.list_containers(results_per_page=1))
                
                session['auth_method'] = 'Access Key'
                session['account_name'] = account_name
                session['account_key'] = account_key
                
            elif auth_method == 'sp':
                account_name = request.form.get('account_name_sp', '').strip()
                tenant_id = request.form.get('tenant_id', '').strip()
                client_id = request.form.get('client_id', '').strip()
                client_secret = request.form.get('client_secret', '').strip()
                if not all([account_name, tenant_id, client_id, client_secret]):
                    raise ValueError("All Service Principal fields are required")
                
                from azure.identity import ClientSecretCredential
                credential = ClientSecretCredential(tenant_id, client_id, client_secret)
                client = BlobServiceClient(account_url=f"https://{account_name}.blob.core.windows.net", credential=credential)
                _ = list(client.list_containers(results_per_page=1))
                
                session['auth_method'] = 'Service Principal'
                session['account_name'] = account_name
                session['tenant_id'] = tenant_id
                session['client_id'] = client_id
                session['client_secret'] = client_secret
            else:
                raise ValueError("Invalid authentication method")
                
            flash("Connected successfully")
            return redirect(url_for('ui.home'))
            
        except Exception as e:
            flash(f"Connection failed: {e}")
            return redirect(url_for('ui.login'))
            
    if require_auth():
        return redirect(url_for('ui.home'))
    return render_template('login.html')

@ui.route('/logout')
def logout():
    session.clear()
    flash("Logged out")
    return redirect(url_for('ui.login'))

@ui.route('/home')
def home():
    if not require_auth():
        return redirect(url_for('ui.login'))
    tree = load_sidebar_tree()
    return render_template('dashboard.html', sidebar_tree=tree, active_service=None, active_item=None)

@ui.route('/bulk-create', methods=['POST'])
def bulk_create():
    if not require_auth():
        return redirect(url_for('ui.login'))
        
    resource_type = request.form.get('resource_type')
    uploaded_file = request.files.get('file')
    
    if not uploaded_file or not uploaded_file.filename:
        flash("No file was uploaded.")
        return redirect(url_for('ui.home'))
        
    filename = uploaded_file.filename.lower()
    names = []
    
    try:
        if filename.endswith('.csv'):
            stream = io.StringIO(uploaded_file.stream.read().decode("utf-8-sig"))
            reader = csv.reader(stream)
            for row in reader:
                if row:
                    name = row[0].strip()
                    if name:
                        names.append(name)
        elif filename.endswith('.xlsx'):
            wb = openpyxl.load_workbook(io.BytesIO(uploaded_file.read()), data_only=True)
            sheet = wb.active
            for row in sheet.iter_rows(min_row=1, max_col=1, values_only=True):
                if row and row[0] is not None:
                    name = str(row[0]).strip()
                    if name:
                        names.append(name)
        else:
            flash("Unsupported file format. Please upload a .csv or .xlsx file.")
            return redirect(url_for('ui.home'))
    except Exception as e:
        flash(f"Error parsing file: {e}")
        return redirect(url_for('ui.home'))
        
    header_keywords = {"name", "names", "container", "containers", "share", "shares", "table", "tables", "queue", "queues"}
    filtered_names = []
    for n in names:
        if n.lower() not in header_keywords:
            filtered_names.append(n)
            
    if not filtered_names:
        flash("No valid resource names found in the uploaded file.")
        return redirect(url_for('ui.home'))
        
    success_count = 0
    errors = []
    
    try:
        if resource_type == 'container':
            svc = get_blob_service()
            for name in filtered_names:
                try:
                    svc.create_container(name)
                    success_count += 1
                except Exception as ex:
                    errors.append(f"'{name}': {ex}")
                    
        elif resource_type == 'share':
            svc = get_share_service()
            for name in filtered_names:
                try:
                    svc.create_share(name)
                    success_count += 1
                except Exception as ex:
                    errors.append(f"'{name}': {ex}")
                    
        elif resource_type == 'queue':
            svc = get_queue_service()
            for name in filtered_names:
                try:
                    svc.create_queue(name)
                    success_count += 1
                except Exception as ex:
                    errors.append(f"'{name}': {ex}")
                    
        elif resource_type == 'table':
            svc = get_table_service()
            for name in filtered_names:
                try:
                    svc.create_table(name)
                    success_count += 1
                except Exception as ex:
                    errors.append(f"'{name}': {ex}")
        else:
            flash(f"Invalid resource type: {resource_type}")
            return redirect(url_for('ui.home'))
            
    except Exception as e:
        flash(f"Service connection error: {e}")
        return redirect(url_for('ui.home'))
        
    resource_type_display = {
        'container': 'Blob Container(s)',
        'share': 'File Share(s)',
        'queue': 'Message Queue(s)',
        'table': 'NoSQL Table(s)'
    }.get(resource_type, 'Resource(s)')
    
    summary = f"Bulk creation completed. Successfully created {success_count} of {len(filtered_names)} {resource_type_display}."
    if errors:
        summary += f" Errors: {'; '.join(errors)}"
    flash(summary)
    
    return redirect(url_for('ui.home'))

# -----------------------
# Blob Routes
# -----------------------
@ui.route('/blobs')
def blobs():
    if not require_auth():
        return redirect(url_for('ui.login'))

    try:
        blob_service = get_blob_service()
        containers = list(blob_service.list_containers())
    except Exception as e:
        flash(f"Error loading containers: {e}")
        containers = []
        
    tree = load_sidebar_tree()
    return render_template('blobs.html', containers=containers, container_name=None, sidebar_tree=tree, active_service='blobs', active_item=None)

@ui.route('/blobs/create', methods=['POST'])
def create_container():
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.form.get('name') or request.form.get('container_name')
    try:
        get_blob_service().create_container(name)
        flash(f"Container '{name}' created.")
    except Exception as e:
        flash(f"Error creating container: {e}")
    return redirect(url_for('ui.blobs'))

@ui.route('/blobs/delete', methods=['POST'])
def delete_container():
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.form.get('container_name')
    try:
        get_blob_service().delete_container(name)
        flash(f"Container '{name}' deleted.")
    except Exception as e:
        flash(f"Error deleting container: {e}")
    return redirect(url_for('ui.blobs'))

@ui.route('/blobs/<container_name>', methods=['GET', 'POST'])
def view_blobs(container_name):
    if not require_auth():
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
            return jsonify({"success": False, "error": "Not authenticated"}), 401
        return redirect(url_for('ui.login'))

    service = get_blob_service()
    container_client = service.get_container_client(container_name)

    # Handle multiple files upload (regular form or AJAX with progress)
    if request.method == 'POST' and 'files' in request.files:
        folder = request.form.get('folder', '').strip()
        files = request.files.getlist('files')

        uploaded = []
        failed = []
        for file in files:
            if not file or not file.filename:
                continue
            
            blob_name = file.filename
            if folder:
                blob_name = f"{folder.rstrip('/')}/{file.filename}"

            try:
                guessed_type = mimetypes.guess_type(blob_name)[0] or 'application/octet-stream'
                container_client.upload_blob(
                    name=blob_name,
                    data=file,
                    overwrite=True,
                    content_settings=ContentSettings(content_type=guessed_type)
                )
                uploaded.append(file.filename)
            except Exception as e:
                failed.append(f"{file.filename} ({e})")
                
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.headers.get('Accept') == 'application/json'
        if is_ajax:
            return jsonify({
                "success": len(uploaded) > 0 or len(failed) == 0,
                "uploaded_count": len(uploaded),
                "uploaded": uploaded,
                "failed": failed
            })

        if uploaded:
            flash(f"Successfully uploaded {len(uploaded)} file(s).")
        if failed:
            flash(f"Failed to upload: {', '.join(failed)}")

        return redirect(url_for('ui.view_blobs', container_name=container_name))

    # Pagination & Search & Sort parameters
    search_query = request.args.get('q', '').strip()
    try:
        page = max(1, int(request.args.get('page', 1)))
    except ValueError:
        page = 1
    try:
        limit = int(request.args.get('limit', 20))
        if limit not in [10, 15, 20, 50, 100]:
            limit = 20
    except ValueError:
        limit = 20

    sort_by = request.args.get('sort', 'name').strip().lower()
    if sort_by not in ['name', 'size', 'last_modified']:
        sort_by = 'name'
    sort_order = request.args.get('order', 'asc').strip().lower()
    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc'

    # Date range filter parameters (YYYY-MM-DD)
    from_date_str = request.args.get('from_date', '').strip()
    to_date_str = request.args.get('to_date', '').strip()

    from_dt = None
    to_dt = None
    if from_date_str:
        try:
            from_dt = datetime.strptime(from_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except Exception:
            from_dt = None
    if to_date_str:
        try:
            to_dt = datetime.strptime(to_date_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
        except Exception:
            to_dt = None

    # List blobs
    try:
        raw_blobs = list(container_client.list_blobs())
    except Exception as e:
        flash(f"Error listing blobs: {e}")
        raw_blobs = []

    # Filter by search query if provided
    if search_query:
        filtered_blobs = [b for b in raw_blobs if search_query.lower() in b.name.lower()]
    else:
        filtered_blobs = raw_blobs

    # Filter by date range if provided
    if from_dt or to_dt:
        date_filtered = []
        for b in filtered_blobs:
            lm = getattr(b, 'last_modified', None)
            if not lm:
                continue
            if lm.tzinfo is None:
                lm = lm.replace(tzinfo=timezone.utc)
            if from_dt and lm < from_dt:
                continue
            if to_dt and lm > to_dt:
                continue
            date_filtered.append(b)
        filtered_blobs = date_filtered

    # Global Sort before pagination
    reverse = (sort_order == 'desc')
    if sort_by == 'last_modified':
        def get_blob_last_modified_ts(b):
            lm = getattr(b, 'last_modified', None)
            if lm:
                try:
                    return lm.timestamp()
                except Exception:
                    return 0
            return 0
        filtered_blobs.sort(key=get_blob_last_modified_ts, reverse=reverse)
    elif sort_by == 'size':
        filtered_blobs.sort(key=lambda b: getattr(b, 'size', 0) or 0, reverse=reverse)
    else:
        filtered_blobs.sort(key=lambda b: (getattr(b, 'name', '') or '').lower(), reverse=reverse)

    total_items = len(filtered_blobs)
    total_pages = max(1, math.ceil(total_items / limit))
    if page > total_pages:
        page = total_pages

    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_blobs = filtered_blobs[start_idx:end_idx]
    page_start = start_idx + 1 if total_items > 0 else 0
    page_end = min(end_idx, total_items)

    tree = load_sidebar_tree()
    try:
        all_containers = [c.name for c in get_blob_service().list_containers()]
    except Exception:
        all_containers = [container_name]

    return render_template(
        'blobs.html',
        blobs=page_blobs,
        all_blobs_count=len(raw_blobs),
        container_name=container_name,
        all_containers=all_containers,
        sidebar_tree=tree,
        active_service='blobs',
        active_item=container_name,
        page=page,
        limit=limit,
        total_pages=total_pages,
        total_items=total_items,
        page_start=page_start,
        page_end=page_end,
        search_query=search_query,
        sort_by=sort_by,
        sort_order=sort_order,
        from_date=from_date_str,
        to_date=to_date_str
    )

@ui.route('/blobs/<container_name>/delete-multiple', methods=['POST'])
def delete_multiple_blobs(container_name):
    if not require_auth():
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    data = request.get_json(silent=True) or request.form
    blob_names = data.get('blob_names', [])
    if isinstance(blob_names, str):
        try:
            blob_names = json.loads(blob_names)
        except Exception:
            blob_names = [blob_names]
            
    if not blob_names:
        return jsonify({"success": False, "error": "No blobs selected for deletion"}), 400
        
    service = get_blob_service()
    container_client = service.get_container_client(container_name)
    
    deleted = []
    errors = []
    for name in blob_names:
        try:
            client = container_client.get_blob_client(name)
            client.delete_blob()
            deleted.append(name)
        except Exception as e:
            errors.append(f"{name}: {str(e)}")
            
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
        return jsonify({
            "success": len(deleted) > 0 or len(errors) == 0,
            "deleted_count": len(deleted),
            "deleted": deleted,
            "errors": errors
        })
        
    if deleted:
        flash(f"Successfully deleted {len(deleted)} blob(s).")
    if errors:
        flash(f"Failed to delete: {', '.join(errors)}")
    return redirect(url_for('ui.view_blobs', container_name=container_name))

@ui.route('/blobs/<container_name>/content', methods=['GET'])
def get_blob_content(container_name):
    if not require_auth():
        return jsonify({"success": False, "error": "Not authenticated"}), 401
        
    blob_name = request.args.get('blob_name')
    if not blob_name:
        return jsonify({"success": False, "error": "Blob name required"}), 400
        
    try:
        client = get_blob_service().get_blob_client(container_name, blob_name)
        props = client.get_blob_properties()
        size = props.size
        content_type = props.content_settings.content_type or mimetypes.guess_type(blob_name)[0] or 'text/plain'
        
        # Check size limitation for in-browser editing (10MB limit)
        if size > 10 * 1024 * 1024:
            return jsonify({
                "success": False,
                "error": f"File size ({size / (1024*1024):.1f} MB) exceeds in-browser editor limit of 10MB. Please download the file to edit."
            }), 400
            
        stream = client.download_blob()
        raw_bytes = stream.readall()
        
        try:
            content = raw_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                content = raw_bytes.decode('latin-1')
            except Exception:
                return jsonify({
                    "success": False,
                    "error": "This file appears to be in a binary format (e.g., image, executable, archive) and cannot be edited in-browser. Please download it directly."
                }), 400
                
        return jsonify({
            "success": True,
            "name": blob_name,
            "content": content,
            "size": size,
            "content_type": content_type
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@ui.route('/blobs/<container_name>/save-content', methods=['POST'])
def save_blob_content(container_name):
    if not require_auth():
        return jsonify({"success": False, "error": "Not authenticated"}), 401
        
    data = request.get_json(silent=True) or request.form
    blob_name = data.get('blob_name')
    content = data.get('content')
    
    if not blob_name or content is None:
        return jsonify({"success": False, "error": "Blob name and content are required"}), 400
        
    try:
        client = get_blob_service().get_blob_client(container_name, blob_name)
        guessed_type = mimetypes.guess_type(blob_name)[0] or 'text/plain'
        client.upload_blob(
            data=content.encode('utf-8'),
            overwrite=True,
            content_settings=ContentSettings(content_type=guessed_type)
        )
        return jsonify({"success": True, "message": f"Blob '{blob_name}' saved successfully!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@ui.route('/blobs/<container_name>/create-folder', methods=['POST'])
def create_blob_folder(container_name):
    if not require_auth():
        return redirect(url_for('ui.login'))
    folder = request.form.get('folder', '').strip().rstrip('/') + '/'
    if not folder or folder == '/':
        flash("Folder name cannot be empty.")
        return redirect(url_for('ui.view_blobs', container_name=container_name))

    client = get_blob_service().get_container_client(container_name)
    try:
        client.upload_blob(name=folder, data=b'', overwrite=False)
        flash(f"Folder '{folder}' created.")
    except Exception as e:
        flash(f"Failed to create folder: {e}")
    return redirect(url_for('ui.view_blobs', container_name=container_name))

@ui.route('/blobs/<container_name>/download')
def download_blob(container_name):
    if not require_auth():
        return redirect(url_for('ui.login'))
    blob_name = request.args.get('blob_name')
    client = get_blob_service().get_blob_client(container_name, blob_name)
    stream = client.download_blob()
    data = stream.readall()
    mime_type = mimetypes.guess_type(blob_name)[0] or 'application/octet-stream'
    return send_file(io.BytesIO(data), as_attachment=True, download_name=blob_name.split('/')[-1], mimetype=mime_type)

@ui.route('/blobs/<container_name>/delete', methods=['POST'])
def delete_blob(container_name):
    if not require_auth():
        return redirect(url_for('ui.login'))
    blob_name = request.form.get('blob_name')
    client = get_blob_service().get_blob_client(container_name, blob_name)
    try:
        client.delete_blob()
        flash(f"Deleted '{blob_name}'")
    except Exception as e:
        flash(f"Delete failed: {e}")
    return redirect(url_for('ui.view_blobs', container_name=container_name))

@ui.route('/blobs/<container_name>/download-selected', methods=['POST'])
def download_selected_blobs(container_name):
    if not require_auth():
        return redirect(url_for('ui.login'))
        
    blob_names = request.form.getlist('blob_names')
    if not blob_names:
        raw = request.form.get('blob_names_json')
        if raw:
            try:
                blob_names = json.loads(raw)
            except Exception:
                blob_names = [b.strip() for b in raw.split(',') if b.strip()]
                
    if not blob_names:
        flash("No blobs selected for download.")
        return redirect(url_for('ui.view_blobs', container_name=container_name))
        
    service = get_blob_service()
    container_client = service.get_container_client(container_name)
    
    # If single blob selected, download file directly
    if len(blob_names) == 1:
        blob_name = blob_names[0]
        try:
            client = container_client.get_blob_client(blob_name)
            stream = client.download_blob()
            data = stream.readall()
            mime_type = mimetypes.guess_type(blob_name)[0] or 'application/octet-stream'
            return send_file(io.BytesIO(data), as_attachment=True, download_name=blob_name.split('/')[-1], mimetype=mime_type)
        except Exception as e:
            flash(f"Download failed: {e}")
            return redirect(url_for('ui.view_blobs', container_name=container_name))
        
    # If multiple blobs, package into in-memory ZIP
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for name in blob_names:
            try:
                client = container_client.get_blob_client(name)
                blob_data = client.download_blob().readall()
                zip_file.writestr(name, blob_data)
            except Exception as e:
                print(f"Error adding {name} to zip: {e}")
                
    zip_buffer.seek(0)
    return send_file(
        zip_buffer,
        as_attachment=True,
        download_name=f"{container_name}-selected.zip",
        mimetype='application/zip'
    )

@ui.route('/blobs/<container_name>/download-all')
def download_all_blobs(container_name):
    if not require_auth():
        return redirect(url_for('ui.login'))
        
    service = get_blob_service()
    container_client = service.get_container_client(container_name)
    
    try:
        blobs = list(container_client.list_blobs())
    except Exception as e:
        flash(f"Error listing blobs for download: {e}")
        return redirect(url_for('ui.view_blobs', container_name=container_name))
        
    if not blobs:
        flash("Container is empty. Nothing to download.")
        return redirect(url_for('ui.view_blobs', container_name=container_name))
        
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for b in blobs:
            if b.name.endswith('/'):
                continue
            try:
                client = container_client.get_blob_client(b.name)
                blob_data = client.download_blob().readall()
                zip_file.writestr(b.name, blob_data)
            except Exception as e:
                print(f"Error zipping {b.name}: {e}")
                
    zip_buffer.seek(0)
    return send_file(
        zip_buffer,
        as_attachment=True,
        download_name=f"{container_name}-all.zip",
        mimetype='application/zip'
    )

@ui.route('/blobs/<container_name>/empty', methods=['POST'])
def empty_container(container_name):
    if not require_auth():
        return redirect(url_for('ui.login'))
        
    service = get_blob_service()
    container_client = service.get_container_client(container_name)
    
    try:
        blobs = list(container_client.list_blobs())
        deleted = 0
        for b in blobs:
            try:
                container_client.delete_blob(b.name)
                deleted += 1
            except Exception as e:
                print(f"Error deleting {b.name}: {e}")
                
        flash(f"Emptied container '{container_name}'. Deleted {deleted} blob(s).")
    except Exception as e:
        flash(f"Error emptying container: {e}")
        
@ui.route('/blobs/<container_name>/rename', methods=['POST'])
def rename_blob(container_name):
    if not require_auth():
        if request.is_json: return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        return redirect(url_for('ui.login'))
    is_ajax = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    data = request.get_json(silent=True) if request.is_json else request.form
    old_name = data.get('old_name') or ''
    new_name = data.get('new_name') or ''
    if not old_name or not new_name:
        msg = "Source and target blob names are required."
        return jsonify({'success': False, 'error': msg}) if is_ajax else (flash(msg), redirect(url_for('ui.view_blobs', container_name=container_name)))
    try:
        client = get_blob_service().get_container_client(container_name)
        source_blob = client.get_blob_client(old_name)
        dest_blob = client.get_blob_client(new_name)
        dest_blob.start_copy_from_url(source_blob.url)
        source_blob.delete_blob()
        if is_ajax: return jsonify({'success': True})
        flash(f"Blob renamed from '{old_name}' to '{new_name}'")
    except Exception as e:
        if is_ajax: return jsonify({'success': False, 'error': str(e)})
        flash(f"Rename failed: {e}")
    return redirect(url_for('ui.view_blobs', container_name=container_name))

@ui.route('/blobs/<container_name>/move-copy', methods=['POST'])
def move_copy_blob(container_name):
    if not require_auth():
        if request.is_json: return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        return redirect(url_for('ui.login'))
    is_ajax = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    data = request.get_json(silent=True) if request.is_json else request.form
    blob_name = data.get('blob_name') or ''
    dest_container = data.get('dest_container') or container_name
    dest_blob_name = data.get('dest_blob_name') or blob_name
    action_type = data.get('action_type', 'move')
    if not blob_name or not dest_container or not dest_blob_name:
        msg = "Blob name and destination details are required."
        return jsonify({'success': False, 'error': msg}) if is_ajax else (flash(msg), redirect(url_for('ui.view_blobs', container_name=container_name)))
    try:
        svc = get_blob_service()
        source_blob = svc.get_blob_client(container=container_name, blob=blob_name)
        dest_blob = svc.get_blob_client(container=dest_container, blob=dest_blob_name)
        dest_blob.start_copy_from_url(source_blob.url)
        if action_type == 'move':
            source_blob.delete_blob()
        if is_ajax: return jsonify({'success': True})
        flash(f"Blob '{blob_name}' {'moved' if action_type == 'move' else 'copied'} to '{dest_container}/{dest_blob_name}'")
    except Exception as e:
        if is_ajax: return jsonify({'success': False, 'error': str(e)})
        flash(f"Move/Copy failed: {e}")
    return redirect(url_for('ui.view_blobs', container_name=container_name))

# -----------------------
# File Share Routes
# -----------------------
@ui.route('/fileshares')
def fileshares():
    if not require_auth():
        return redirect(url_for('ui.login'))
    
    try:
        svc = get_share_service()
        shares = list(svc.list_shares())
    except Exception as e:
        flash(f"Error loading shares: {e}")
        shares = []
        
    tree = load_sidebar_tree()
    return render_template('fileshares.html', shares=shares, share=None, sidebar_tree=tree, active_service='fileshares', active_item=None)

@ui.route('/fileshares/create', methods=['POST'])
def create_share():
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.form.get('name')
    try:
        get_share_service().create_share(name)
        flash("Share created")
    except Exception as e:
        flash(f"Create failed: {e}")
    return redirect(url_for('ui.fileshares'))

@ui.route('/fileshares/delete', methods=['POST'])
def delete_share():
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.form.get('name')
    try:
        get_share_service().delete_share(name)
        flash("Deleted")
    except Exception as e:
        flash(f"Delete failed: {e}")
    return redirect(url_for('ui.fileshares'))

@ui.route('/fileshares/<share>', methods=['GET', 'POST'])
def list_files(share):
    if not require_auth():
        return redirect(url_for('ui.login'))
    
    client = get_share_service().get_share_client(share)
    
    # Handle multiple files upload
    if request.method == 'POST' and 'files' in request.files:
        files = request.files.getlist('files')
        uploaded = []
        failed = []
        
        for f in files:
            if not f or not f.filename:
                continue
            filename = secure_filename(f.filename)
            file_client = client.get_file_client(filename)
            try:
                data = f.read()
                file_client.create_file(size=len(data))
                file_client.upload_file(data)
                uploaded.append(f.filename)
            except Exception as e:
                failed.append(f"{f.filename} ({e})")
                
        if uploaded:
            flash(f"Successfully uploaded {len(uploaded)} file(s).")
        if failed:
            flash(f"Failed to upload: {', '.join(failed)}")
            
        return redirect(url_for('ui.list_files', share=share))

    from_date_str = request.args.get('from_date', '').strip()
    to_date_str = request.args.get('to_date', '').strip()

    from_dt = None
    to_dt = None
    if from_date_str:
        try:
            from_dt = datetime.strptime(from_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except Exception:
            from_dt = None
    if to_date_str:
        try:
            to_dt = datetime.strptime(to_date_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
        except Exception:
            to_dt = None

    try:
        root = client.get_directory_client('')
        raw_items = list(root.list_directories_and_files())
    except Exception as e:
        flash(f"Error listing files: {e}")
        raw_items = []

    if from_dt or to_dt:
        filtered_items = []
        for item in raw_items:
            lm = getattr(item, 'last_modified', None)
            if lm:
                if getattr(lm, 'tzinfo', None) is None:
                    lm = lm.replace(tzinfo=timezone.utc)
                if from_dt and lm < from_dt:
                    continue
                if to_dt and lm > to_dt:
                    continue
            filtered_items.append(item)
        items = filtered_items
    else:
        items = raw_items

    tree = load_sidebar_tree()
    try:
        all_shares = [s.name for s in get_share_service().list_shares()]
    except Exception:
        all_shares = [share]

    return render_template(
        'fileshares.html',
        share=share,
        items=items,
        all_shares=all_shares,
        sidebar_tree=tree,
        active_service='fileshares',
        active_item=share,
        from_date=from_date_str,
        to_date=to_date_str
    )

@ui.route('/fileshares/<share>/upload', methods=['POST'])
def upload_file(share):
    if not require_auth():
        return redirect(url_for('ui.login'))
    
    files = request.files.getlist('files')
    if not files or all(f.filename == '' for f in files):
        flash("No files selected")
        return redirect(url_for('ui.list_files', share=share))
        
    try:
        client = get_share_service().get_share_client(share)
        uploaded = []
        failed = []
        
        for f in files:
            if not f or not f.filename:
                continue
            filename = secure_filename(f.filename)
            file_client = client.get_file_client(filename)
            try:
                data = f.read()
                file_client.create_file(size=len(data))
                file_client.upload_file(data)
                uploaded.append(f.filename)
            except Exception as e:
                failed.append(f"{f.filename} ({e})")
                
        if uploaded:
            flash(f"Successfully uploaded {len(uploaded)} file(s).")
        if failed:
            flash(f"Failed to upload: {', '.join(failed)}")
            
    except Exception as e:
        flash(f"Upload process failed: {e}")
        
    return redirect(url_for('ui.list_files', share=share))

@ui.route('/fileshares/<share>/download')
def download_file(share):
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.args.get('filename')
    try:
        client = get_share_service().get_share_client(share)
        file_client = client.get_file_client(name)
        stream = file_client.download_file().readall()
        return send_file(io.BytesIO(stream), download_name=name, as_attachment=True)
    except Exception as e:
        flash(f"Download failed: {e}")
        return redirect(url_for('ui.list_files', share=share))

@ui.route('/fileshares/<share>/file-content')
def get_share_file_content(share):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    filename = request.args.get('filename')
    if not filename:
        return jsonify({'success': False, 'error': 'Filename is required'}), 400
    try:
        client = get_share_service().get_share_client(share).get_file_client(filename)
        stream = client.download_file()
        raw_data = stream.readall()
        try:
            text = raw_data.decode('utf-8')
            is_text = True
        except Exception:
            text = str(raw_data[:2000])
            is_text = False
        return jsonify({'success': True, 'content': text, 'is_text': is_text, 'filename': filename})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@ui.route('/fileshares/<share>/save-content', methods=['POST'])
def save_share_file_content(share):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) if request.is_json else request.form
    filename = data.get('filename')
    content = data.get('content', '')
    if not filename:
        return jsonify({'success': False, 'error': 'Filename is required'}), 400
    try:
        client = get_share_service().get_share_client(share).get_file_client(filename)
        raw_bytes = content.encode('utf-8')
        client.create_file(size=len(raw_bytes))
        client.upload_file(raw_bytes)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@ui.route('/fileshares/<share>/rename-file', methods=['POST'])
def rename_share_file(share):
    if not require_auth():
        if request.is_json: return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        return redirect(url_for('ui.login'))
    is_ajax = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    data = request.get_json(silent=True) if request.is_json else request.form
    old_name = data.get('old_name') or ''
    new_name = data.get('new_name') or ''
    if not old_name or not new_name:
        msg = "Old and new filenames are required."
        return jsonify({'success': False, 'error': msg}) if is_ajax else (flash(msg), redirect(url_for('ui.list_files', share=share)))
    try:
        share_client = get_share_service().get_share_client(share)
        source_file = share_client.get_file_client(old_name)
        dest_file = share_client.get_file_client(new_name)
        dest_file.start_copy_from_url(source_file.url)
        source_file.delete_file()
        if is_ajax: return jsonify({'success': True})
        flash(f"File renamed from '{old_name}' to '{new_name}'")
    except Exception as e:
        if is_ajax: return jsonify({'success': False, 'error': str(e)})
        flash(f"Rename failed: {e}")
    return redirect(url_for('ui.list_files', share=share))

@ui.route('/fileshares/<share>/move-copy-file', methods=['POST'])
def move_copy_share_file(share):
    if not require_auth():
        if request.is_json: return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        return redirect(url_for('ui.login'))
    is_ajax = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    data = request.get_json(silent=True) if request.is_json else request.form
    filename = data.get('filename') or ''
    dest_share = data.get('dest_share') or share
    dest_filename = data.get('dest_filename') or filename
    action_type = data.get('action_type', 'move')
    if not filename or not dest_share or not dest_filename:
        msg = "Filename and destination details are required."
        return jsonify({'success': False, 'error': msg}) if is_ajax else (flash(msg), redirect(url_for('ui.list_files', share=share)))
    try:
        svc = get_share_service()
        source_file = svc.get_share_client(share).get_file_client(filename)
        dest_file = svc.get_share_client(dest_share).get_file_client(dest_filename)
        dest_file.start_copy_from_url(source_file.url)
        if action_type == 'move':
            source_file.delete_file()
        if is_ajax: return jsonify({'success': True})
        flash(f"File '{filename}' {'moved' if action_type == 'move' else 'copied'} to '{dest_share}/{dest_filename}'")
    except Exception as e:
        if is_ajax: return jsonify({'success': False, 'error': str(e)})
        flash(f"Move/Copy failed: {e}")
    return redirect(url_for('ui.list_files', share=share))

@ui.route('/fileshares/<share>/delete', methods=['POST'])
def delete_file(share):
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.form.get('name')
    try:
        client = get_share_service().get_share_client(share)
        file_client = client.get_file_client(name)
        file_client.delete_file()
        flash("Deleted")
    except Exception as e:
        flash(f"Delete failed: {e}")
    return redirect(url_for('ui.list_files', share=share))

# -----------------------
# Queue Helper Functions
# -----------------------
def encode_message_payload(text, encoding_mode="base64"):
    """
    Encodes text based on the selected mode:
    - 'base64': Converts UTF-8 string to Base64 (Standard for Azure Functions / WebJobs / Logic Apps)
    - 'plain': Keeps raw UTF-8 string
    """
    if text is None:
        text = ""
    if encoding_mode == "base64":
        return base64.b64encode(text.encode("utf-8")).decode("utf-8")
    return text

def decode_message_payload(raw_content):
    """
    Smart decodes message content.
    Handles standard Base64, multi-line Base64, URL-safe Base64, and unpadded Base64.
    Returns tuple: (decoded_text, is_base64)
    """
    if raw_content is None:
        return "", False
    if isinstance(raw_content, bytes):
        try:
            raw_content = raw_content.decode('utf-8')
        except Exception:
            raw_content = str(raw_content)
    else:
        raw_content = str(raw_content)

    clean_content = raw_content.strip()
    if not clean_content:
        return "", False

    # Remove internal whitespace, newlines, carriage returns from candidate base64
    cleaned = re.sub(r'[\r\n\s\t]', '', clean_content)
    
    # Must be valid length and character set for Base64
    if len(cleaned) < 4 or not re.match(r'^[A-Za-z0-9+/=_-]+$', cleaned):
        return clean_content, False

    # Add missing padding if omitted
    missing_padding = len(cleaned) % 4
    if missing_padding:
        cleaned += '=' * (4 - missing_padding)

    # Try standard Base64 and URL-safe Base64
    for decode_fn in (base64.b64decode, base64.urlsafe_b64decode):
        try:
            decoded_bytes = decode_fn(cleaned)
            decoded_str = decoded_bytes.decode('utf-8')
            
            # Verify decoded string is non-empty, distinct from original, and composed of valid text
            if decoded_str and decoded_str.strip() and decoded_str != clean_content:
                printable_count = sum(1 for c in decoded_str if c.isprintable() or c in '\r\n\t')
                if printable_count / len(decoded_str) >= 0.8:
                    return decoded_str, True
        except Exception:
            pass

    return clean_content, False

def receive_and_find_messages(queue_client, target_ids, max_batches=3):
    """
    Receives messages from queue to find specific message ID(s).
    Returns a dict mapping msg_id -> received QueueMessage (which has .pop_receipt).
    Resets visibility of any unselected messages to 0 immediately.
    """
    target_ids_set = set(target_ids)
    found = {}
    unselected = []
    
    for _ in range(max_batches):
        if len(found) == len(target_ids_set):
            break
        try:
            msgs = list(queue_client.receive_messages(messages_per_page=32, visibility_timeout=30))
        except Exception:
            break
        if not msgs:
            break
        for m in msgs:
            if m.id in target_ids_set:
                found[m.id] = m
            else:
                unselected.append(m)
                
    # Reset visibility for unselected messages so they don't stay hidden
    for m in unselected:
        if m.id not in found:
            try:
                queue_client.update_message(m.id, m.pop_receipt, visibility_timeout=0)
            except Exception:
                pass
            
    return found

def format_queue_msg_time(msg, *attr_names):
    """Safely extracts and formats datetime from a QueueMessage across different SDK versions."""
    for attr in attr_names:
        val = getattr(msg, attr, None)
        if val is not None:
            if hasattr(val, 'strftime'):
                return val.strftime('%Y-%m-%d %H:%M:%S UTC')
            return str(val)
    return '--'

# -----------------------
# Queue Routes
# -----------------------
@ui.route('/queues')
def queues():
    if not require_auth():
        return redirect(url_for('ui.login'))
    
    try:
        svc = get_queue_service()
        queues = list(svc.list_queues())
    except Exception as e:
        flash(f"Error loading queues: {e}")
        queues = []
        
    tree = load_sidebar_tree()
    return render_template('queues.html', queues=queues, queue=None, sidebar_tree=tree, active_service='queues', active_item=None)

@ui.route('/queues/create', methods=['POST'])
def create_queue():
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.form.get('name')
    try:
        get_queue_service().create_queue(name)
        flash(f"Queue '{name}' created")
    except Exception as e:
        flash(f"Create failed: {e}")
    return redirect(url_for('ui.queues'))

@ui.route('/queues/delete', methods=['POST'])
def delete_queue():
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.form.get('name')
    try:
        get_queue_service().delete_queue(name)
        flash(f"Queue '{name}' deleted")
    except Exception as e:
        flash(f"Delete failed: {e}")
    return redirect(url_for('ui.queues'))

@ui.route('/queues/<queue>')
def view_queue(queue):
    if not require_auth():
        return redirect(url_for('ui.login'))
    
    svc = get_queue_service()
    client = svc.get_queue_client(queue)
    try:
        messages = list(client.peek_messages(max_messages=32))
    except Exception as e:
        flash(f"Error peeking queue: {e}")
        return redirect(url_for('ui.queues'))

    from_date_str = request.args.get('from_date', '').strip()
    to_date_str = request.args.get('to_date', '').strip()

    from_dt = None
    to_dt = None
    if from_date_str:
        try:
            from_dt = datetime.strptime(from_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except Exception:
            from_dt = None
    if to_date_str:
        try:
            to_dt = datetime.strptime(to_date_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
        except Exception:
            to_dt = None

    for m in messages:
        decoded_text, is_b64 = decode_message_payload(m.content)
        m.raw_content = m.content
        m.decoded_content = decoded_text
        m.is_base64 = is_b64
        m_content_stripped = (m.content or '').strip()
        decoded_stripped = (decoded_text or '').strip()
        m.raw_preview = (m_content_stripped[:120] + "...") if len(m_content_stripped) > 120 else m_content_stripped
        m.decoded_preview = (decoded_stripped[:120] + "...") if len(decoded_stripped) > 120 else decoded_stripped
        m.preview = m.raw_preview
        m.insertion_time_str = format_queue_msg_time(m, 'inserted_on', 'insertion_time')
        m.expiration_time_str = format_queue_msg_time(m, 'expires_on', 'expiration_time')
        m.dequeue_count = getattr(m, 'dequeue_count', 0)
        m.encoded_json = json.dumps(m.content)

    if from_dt or to_dt:
        filtered_msgs = []
        for m in messages:
            it = getattr(m, 'inserted_on', None) or getattr(m, 'insertion_time', None)
            if it:
                if getattr(it, 'tzinfo', None) is None:
                    it = it.replace(tzinfo=timezone.utc)
                if from_dt and it < from_dt:
                    continue
                if to_dt and it > to_dt:
                    continue
            filtered_msgs.append(m)
        messages = filtered_msgs

    # Get list of all queue names for the Send/Move to Another Queue dropdown
    try:
        all_queues = [q.name for q in svc.list_queues()]
    except Exception:
        all_queues = [queue]

    tree = load_sidebar_tree()
    return render_template(
        'queues.html',
        queue=queue,
        messages=messages,
        all_queues=all_queues,
        sidebar_tree=tree,
        active_service='queues',
        active_item=queue,
        from_date=from_date_str,
        to_date=to_date_str
    )

@ui.route('/queues/<queue>/enqueue', methods=['POST'])
def enqueue(queue):
    if not require_auth():
        if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        return redirect(url_for('ui.login'))
    
    is_ajax = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    data = request.get_json(silent=True) if request.is_json else request.form
    
    msg = data.get('msg') or data.get('content') or ''
    encoding = data.get('encoding', 'base64') # Default to base64 for Azure Functions compatibility
    visibility_timeout = int(data.get('visibility_timeout') or 0)
    time_to_live = data.get('time_to_live')
    time_to_live = int(time_to_live) if time_to_live else None
    
    if not msg:
        if is_ajax:
            return jsonify({'success': False, 'error': 'Message content cannot be empty.'}), 400
        flash("Message body cannot be empty.")
        return redirect(url_for('ui.view_queue', queue=queue))
        
    try:
        payload = encode_message_payload(msg, encoding)
        client = get_queue_service().get_queue_client(queue)
        kwargs = {}
        if visibility_timeout > 0:
            kwargs['visibility_timeout'] = visibility_timeout
        if time_to_live:
            kwargs['time_to_live'] = time_to_live
            
        send_res = client.send_message(payload, **kwargs)
        if is_ajax:
            return jsonify({
                'success': True, 
                'message': 'Message enqueued successfully',
                'message_id': getattr(send_res, 'id', None),
                'encoding': encoding
            })
        flash(f"Message enqueued ({'Base64 encoded' if encoding == 'base64' else 'Plain text'})")
    except Exception as e:
        if is_ajax:
            return jsonify({'success': False, 'error': str(e)}), 500
        flash(f"Enqueue failed: {e}")
        
    return redirect(url_for('ui.view_queue', queue=queue))

@ui.route('/queues/<queue>/message-content', methods=['GET'])
def get_queue_message_content(queue):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
    msg_id = request.args.get('msg_id')
    if not msg_id:
        return jsonify({'success': False, 'error': 'Message ID required.'}), 400
        
    try:
        client = get_queue_service().get_queue_client(queue)
        # Peek messages to find matching ID
        messages = list(client.peek_messages(max_messages=32))
        target = next((m for m in messages if m.id == msg_id), None)
        
        if not target:
            return jsonify({'success': False, 'error': 'Message not found in visible queue items.'}), 404
            
        decoded_text, is_b64 = decode_message_payload(target.content)
        return jsonify({
            'success': True,
            'id': target.id,
            'raw_content': target.content,
            'decoded_content': decoded_text,
            'is_base64': is_b64,
            'insertion_time': format_queue_msg_time(target, 'inserted_on', 'insertion_time'),
            'expiration_time': format_queue_msg_time(target, 'expires_on', 'expiration_time'),
            'dequeue_count': getattr(target, 'dequeue_count', 0)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@ui.route('/queues/<queue>/update-message', methods=['POST'])
def update_queue_message(queue):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
    data = request.get_json(silent=True) or request.form
    msg_id = data.get('msg_id')
    content = data.get('content', '')
    encoding = data.get('encoding', 'base64')
    
    if not msg_id:
        return jsonify({'success': False, 'error': 'Message ID required.'}), 400
        
    try:
        client = get_queue_service().get_queue_client(queue)
        found_map = receive_and_find_messages(client, [msg_id], max_batches=3)
        
        if msg_id not in found_map:
            return jsonify({'success': False, 'error': 'Message could not be leased for update. It may be currently invisible or processed.'}), 404
            
        msg = found_map[msg_id]
        payload = encode_message_payload(content, encoding)
        client.update_message(msg.id, msg.pop_receipt, content=payload, visibility_timeout=0)
        return jsonify({'success': True, 'message': 'Message successfully updated in queue.'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@ui.route('/queues/<queue>/dequeue-single', methods=['POST'])
def dequeue_single_message(queue):
    if not require_auth():
        if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        return redirect(url_for('ui.login'))
        
    data = request.get_json(silent=True) or request.form
    msg_id = data.get('msg_id')
    is_ajax = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    
    if not msg_id:
        if is_ajax:
            return jsonify({'success': False, 'error': 'Message ID required.'}), 400
        flash("Message ID required.")
        return redirect(url_for('ui.view_queue', queue=queue))
        
    try:
        client = get_queue_service().get_queue_client(queue)
        found_map = receive_and_find_messages(client, [msg_id], max_batches=3)
        
        if msg_id not in found_map:
            if is_ajax:
                return jsonify({'success': False, 'error': 'Message not found or already processed.'}), 404
            flash("Message not found or already processed.")
            return redirect(url_for('ui.view_queue', queue=queue))
            
        msg = found_map[msg_id]
        client.delete_message(msg.id, msg.pop_receipt)
        
        if is_ajax:
            return jsonify({'success': True, 'message': f'Message {msg_id} dequeued and permanently deleted.'})
        flash("Dequeued one message")
    except Exception as e:
        if is_ajax:
            return jsonify({'success': False, 'error': str(e)}), 500
        flash(f"Dequeue failed: {e}")
        
    return redirect(url_for('ui.view_queue', queue=queue))

@ui.route('/queues/<queue>/dequeue-multiple', methods=['POST'])
def dequeue_multiple_messages(queue):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
    data = request.get_json(silent=True) or {}
    msg_ids = data.get('msg_ids', [])
    
    if not msg_ids:
        return jsonify({'success': False, 'error': 'No message IDs provided.'}), 400
        
    try:
        client = get_queue_service().get_queue_client(queue)
        found_map = receive_and_find_messages(client, msg_ids, max_batches=4)
        
        deleted_count = 0
        for mid, msg in found_map.items():
            try:
                client.delete_message(msg.id, msg.pop_receipt)
                deleted_count += 1
            except Exception:
                pass
                
        return jsonify({
            'success': True, 
            'deleted_count': deleted_count, 
            'requested_count': len(msg_ids),
            'message': f"Successfully dequeued {deleted_count} message(s)."
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@ui.route('/queues/<queue>/send-to-queue', methods=['POST'])
def send_to_another_queue(queue):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
    data = request.get_json(silent=True) or {}
    msg_ids = data.get('msg_ids', [])
    dest_queue = data.get('destination_queue', '').strip()
    action_type = data.get('action_type', 'move') # 'move' or 'copy'
    encoding = data.get('encoding', 'preserve') # 'preserve', 'base64', 'plain'
    custom_content = data.get('custom_content')
    
    if not msg_ids:
        return jsonify({'success': False, 'error': 'No messages selected to send.'}), 400
    if not dest_queue:
        return jsonify({'success': False, 'error': 'Destination queue name required.'}), 400
        
    svc = get_queue_service()
    try:
        source_client = svc.get_queue_client(queue)
        dest_client = svc.get_queue_client(dest_queue)
        
        # Verify destination queue exists or create if requested
        try:
            dest_client.get_queue_properties()
        except ResourceNotFoundError:
            return jsonify({'success': False, 'error': f"Destination queue '{dest_queue}' does not exist."}), 404
            
        found_map = receive_and_find_messages(source_client, msg_ids, max_batches=4)
        transferred_count = 0
        
        for mid, msg in found_map.items():
            # Determine payload to send
            if custom_content is not None and len(msg_ids) == 1:
                send_payload = encode_message_payload(custom_content, encoding if encoding != 'preserve' else 'base64')
            elif encoding == 'preserve':
                send_payload = msg.content
            elif encoding == 'base64':
                decoded, _ = decode_message_payload(msg.content)
                send_payload = encode_message_payload(decoded, 'base64')
            elif encoding == 'plain':
                decoded, _ = decode_message_payload(msg.content)
                send_payload = encode_message_payload(decoded, 'plain')
            else:
                send_payload = msg.content
                
            # Send to destination queue
            dest_client.send_message(send_payload)
            transferred_count += 1
            
            # If move, delete from source queue; if copy, reset visibility to 0
            if action_type == 'move':
                source_client.delete_message(msg.id, msg.pop_receipt)
            else:
                try:
                    source_client.update_message(msg.id, msg.pop_receipt, visibility_timeout=0)
                except Exception:
                    pass
                    
        return jsonify({
            'success': True,
            'transferred_count': transferred_count,
            'action_type': action_type,
            'destination_queue': dest_queue,
            'message': f"Successfully {'moved' if action_type == 'move' else 'copied'} {transferred_count} message(s) to queue '{dest_queue}'."
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@ui.route('/queues/<queue>/dequeue', methods=['POST'])
def dequeue(queue):
    if not require_auth():
        return redirect(url_for('ui.login'))
    try:
        q = get_queue_service().get_queue_client(queue)
        msgs = q.receive_messages(messages_per_page=1)
        for msg in msgs:
            q.delete_message(msg.id, msg.pop_receipt)
            flash("Dequeued one message")
            break
    except Exception as e:
        flash(f"Dequeue failed: {e}")
    return redirect(url_for('ui.view_queue', queue=queue))

@ui.route('/queues/<queue>/dequeue-all', methods=['POST'])
def dequeue_all(queue):
    if not require_auth():
        return redirect(url_for('ui.login'))
    q = get_queue_service().get_queue_client(queue)
    deleted = 0
    try:
        while True:
            msgs = list(q.receive_messages(messages_per_page=32))
            if not msgs:
                break
            for msg in msgs:
                q.delete_message(msg.id, msg.pop_receipt)
                deleted += 1
        flash(f"Dequeued {deleted} messages")
    except Exception as e:
        flash(f"Dequeue all failed: {e}")
    return redirect(url_for('ui.view_queue', queue=queue))

# -----------------------
# Table Routes
# -----------------------
@ui.route('/tables')
def tables():
    if not require_auth():
        return redirect(url_for('ui.login'))
    
    try:
        svc = get_table_service()
        tables = list(svc.list_tables())
    except Exception as e:
        flash(f"Error loading tables: {e}")
        tables = []

    table_names = [t.name if hasattr(t, "name") else str(t) for t in tables]
    
    tree = load_sidebar_tree()
    return render_template('tables.html', table_names=table_names, table_name=None, sidebar_tree=tree, active_service='tables', active_item=None)

@ui.route('/tables/create', methods=['POST'])
def create_table():
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.form.get('name')
    try:
        get_table_service().create_table(name)
        flash(f"Table '{name}' created")
    except Exception as e:
        flash(f"Create failed: {e}")
    return redirect(url_for('ui.tables'))

@ui.route('/tables/delete', methods=['POST'])
def delete_table():
    if not require_auth():
        return redirect(url_for('ui.login'))
    name = request.form.get('name')
    try:
        get_table_service().delete_table(name)
        flash(f"Table '{name}' deleted")
    except Exception as e:
        flash(f"Delete failed: {e}")
    return redirect(url_for('ui.tables'))

@ui.route('/tables/<table_name>')
def view_table(table_name):
    if not require_auth():
        return redirect(url_for('ui.login'))

    from_date_str = request.args.get('from_date', '').strip()
    to_date_str = request.args.get('to_date', '').strip()

    from_dt = None
    to_dt = None
    if from_date_str:
        try:
            from_dt = datetime.strptime(from_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except Exception:
            from_dt = None
    if to_date_str:
        try:
            to_dt = datetime.strptime(to_date_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
        except Exception:
            to_dt = None

    client = get_table_service().get_table_client(table_name)
    try:
        entities_iter = client.query_entities(query_filter="")
        entities = []
        for i, ent in enumerate(entities_iter):
            if i >= 100:
                break
            entities.append(ent)
    except Exception as e:
        flash(f"Error reading table: {e}")
        return redirect(url_for('ui.tables'))

    if from_dt or to_dt:
        filtered_entities = []
        for ent in entities:
            ts = ent.get('Timestamp')
            if ts and isinstance(ts, datetime):
                if getattr(ts, 'tzinfo', None) is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                if from_dt and ts < from_dt:
                    continue
                if to_dt and ts > to_dt:
                    continue
            filtered_entities.append(ent)
        entities = filtered_entities

    tree = load_sidebar_tree()
    try:
        all_tables = [t.name if hasattr(t, "name") else str(t) for t in get_table_service().list_tables()]
    except Exception:
        all_tables = [table_name]
    return render_template(
        'tables.html',
        entities=entities,
        table_name=table_name,
        all_tables=all_tables,
        sidebar_tree=tree,
        active_service='tables',
        active_item=table_name,
        from_date=from_date_str,
        to_date=to_date_str
    )

@ui.route('/tables/<table_name>/add', methods=['POST'])
def add_entity(table_name):
    if not require_auth():
        return redirect(url_for('ui.login'))
    pk = request.form.get('partition_key')
    rk = request.form.get('row_key')
    pkp = request.form.get('prop_k')
    pvp = request.form.get('prop_v')

    ent = {"PartitionKey": pk, "RowKey": rk}
    if pkp:
        ent[pkp] = pvp

    try:
        get_table_service().get_table_client(table_name).create_entity(ent)
        flash("Entity inserted successfully")
    except Exception as e:
        flash(f"Insert failed: {e}")
    return redirect(url_for('ui.view_table', table_name=table_name))

@ui.route('/tables/<table_name>/entity-content', methods=['GET'])
def get_table_entity_content(table_name):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    pk = request.args.get('pk')
    rk = request.args.get('rk')
    if not pk or not rk:
        return jsonify({'success': False, 'error': 'PartitionKey and RowKey are required.'}), 400
    try:
        client = get_table_service().get_table_client(table_name)
        entity = client.get_entity(partition_key=pk, row_key=rk)
        clean_entity = {}
        for k, v in entity.items():
            if isinstance(v, datetime):
                clean_entity[k] = v.isoformat()
            else:
                clean_entity[k] = v
        return jsonify({'success': True, 'entity': clean_entity})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@ui.route('/tables/<table_name>/update-entity', methods=['POST'])
def update_table_entity(table_name):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or request.form
    pk = data.get('pk') or data.get('PartitionKey')
    rk = data.get('rk') or data.get('RowKey')
    entity_data = data.get('entity') or {}
    
    if not pk or not rk:
        return jsonify({'success': False, 'error': 'PartitionKey and RowKey are required.'}), 400
    
    try:
        client = get_table_service().get_table_client(table_name)
        if isinstance(entity_data, str):
            entity_data = json.loads(entity_data)
        
        new_entity = {k: v for k, v in entity_data.items() if k not in ['odata.etag', 'etag', 'Timestamp']}
        new_entity['PartitionKey'] = pk
        new_entity['RowKey'] = rk
        
        client.upsert_entity(entity=new_entity, mode=UpdateMode.REPLACE)
        return jsonify({'success': True, 'message': 'Entity updated successfully.'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@ui.route('/tables/<table_name>/clone-entity', methods=['POST'])
def clone_table_entity(table_name):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or request.form
    src_pk = data.get('source_pk')
    src_rk = data.get('source_rk')
    new_pk = data.get('new_pk')
    new_rk = data.get('new_rk')
    
    if not src_pk or not src_rk or not new_pk or not new_rk:
        return jsonify({'success': False, 'error': 'Source and target PartitionKey and RowKey are required.'}), 400
        
    try:
        client = get_table_service().get_table_client(table_name)
        source_ent = client.get_entity(partition_key=src_pk, row_key=src_rk)
        new_ent = {k: v for k, v in source_ent.items() if k not in ['odata.etag', 'etag', 'Timestamp']}
        new_ent['PartitionKey'] = new_pk
        new_ent['RowKey'] = new_rk
        
        client.create_entity(new_ent)
        return jsonify({'success': True, 'message': f"Cloned entity to PartitionKey='{new_pk}', RowKey='{new_rk}'."})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@ui.route('/tables/<table_name>/copy-entity', methods=['POST'])
def copy_table_entity(table_name):
    if not require_auth():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or request.form
    pk = data.get('pk')
    rk = data.get('rk')
    dest_table = data.get('dest_table')
    action_type = data.get('action_type', 'copy') # 'move' or 'copy'
    
    if not pk or not rk or not dest_table:
        return jsonify({'success': False, 'error': 'PartitionKey, RowKey and destination table name are required.'}), 400
        
    try:
        svc = get_table_service()
        src_client = svc.get_table_client(table_name)
        dest_client = svc.get_table_client(dest_table)
        
        source_ent = src_client.get_entity(partition_key=pk, row_key=rk)
        new_ent = {k: v for k, v in source_ent.items() if k not in ['odata.etag', 'etag', 'Timestamp']}
        new_ent['PartitionKey'] = pk
        new_ent['RowKey'] = rk
        
        dest_client.upsert_entity(entity=new_ent, mode=UpdateMode.REPLACE)
        if action_type == 'move':
            src_client.delete_entity(partition_key=pk, row_key=rk)
            
        return jsonify({'success': True, 'message': f"Entity successfully {'moved' if action_type == 'move' else 'copied'} to table '{dest_table}'."})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@ui.route('/tables/<table_name>/delete', methods=['POST'])
def delete_entity(table_name):
    if not require_auth():
        return redirect(url_for('ui.login'))
    pk = request.form.get('pk')
    rk = request.form.get('rk')
    try:
        get_table_service().get_table_client(table_name).delete_entity(pk, rk)
        flash("Entity deleted")
    except Exception as e:
        flash(f"Delete failed: {e}")
    return redirect(url_for('ui.view_table', table_name=table_name))

# Register Blueprint
app.register_blueprint(ui)

# -----------------------
# Root Redirect
# -----------------------
@app.route("/")
def index_redirect():
    return redirect("/storage-ui/")

# -----------------------
# Run
# -----------------------
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)), debug=True)
