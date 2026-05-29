import os
import io
import base64
import json
import uuid
import mimetypes
import csv
import openpyxl
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, session, send_file, flash, Blueprint
from flask_session import Session
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
from azure.storage.blob import BlobServiceClient
from azure.storage.fileshare import ShareServiceClient
from azure.storage.queue import QueueServiceClient
from azure.data.tables import TableServiceClient, TableEntity
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
        return redirect(url_for('ui.login'))

    service = get_blob_service()
    container_client = service.get_container_client(container_name)

    # Handle multiple files upload
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
                container_client.upload_blob(name=blob_name, data=file, overwrite=True)
                uploaded.append(file.filename)
            except Exception as e:
                failed.append(f"{file.filename} ({e})")
                
        if uploaded:
            flash(f"Successfully uploaded {len(uploaded)} file(s).")
        if failed:
            flash(f"Failed to upload: {', '.join(failed)}")

        return redirect(url_for('ui.view_blobs', container_name=container_name))

    # List blobs
    try:
        blobs = list(container_client.list_blobs())
    except Exception as e:
        flash(f"Error listing blobs: {e}")
        blobs = []

    tree = load_sidebar_tree()
    return render_template('blobs.html', blobs=blobs, container_name=container_name, sidebar_tree=tree, active_service='blobs', active_item=container_name)

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

    try:
        root = client.get_directory_client('')
        items = list(root.list_directories_and_files())
    except Exception as e:
        flash(f"Error listing files: {e}")
        items = []
        
    tree = load_sidebar_tree()
    return render_template('fileshares.html', share=share, items=items, sidebar_tree=tree, active_service='fileshares', active_item=share)

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
    
    client = get_queue_service().get_queue_client(queue)
    try:
        messages = list(client.peek_messages(max_messages=32))
    except Exception as e:
        flash(f"Error peeking queue: {e}")
        return redirect(url_for('ui.queues'))

    for m in messages:
        # Check if content needs preview truncation
        m.preview = (m.content[:100] + "...") if len(m.content) > 100 else m.content
        m.encoded_json = json.dumps(m.content)

    tree = load_sidebar_tree()
    return render_template('queues.html', queue=queue, messages=messages, sidebar_tree=tree, active_service='queues', active_item=queue)

@ui.route('/queues/<queue>/enqueue', methods=['POST'])
def enqueue(queue):
    if not require_auth():
        return redirect(url_for('ui.login'))
    msg = request.form.get('msg')
    try:
        get_queue_service().get_queue_client(queue).send_message(msg)
        flash("Message enqueued")
    except Exception as e:
        flash(f"Enqueue failed: {e}")
    return redirect(url_for('ui.view_queue', queue=queue))

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

    client = get_table_service().get_table_client(table_name)
    try:
        entities_iter = client.query_entities(query_filter="")
        entities = []
        for i, ent in enumerate(entities_iter):
            if i >= 50:
                break
            entities.append(ent)
    except Exception as e:
        flash(f"Error reading table: {e}")
        return redirect(url_for('ui.tables'))

    tree = load_sidebar_tree()
    return render_template('tables.html', entities=entities, table_name=table_name, sidebar_tree=tree, active_service='tables', active_item=table_name)

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
