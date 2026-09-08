/* ==========================================================================
   StorageUI v2.0 - Core Frontend Script Logic
   Handles Modals, Theme toggling, Dropdowns, and Multi-file upload helpers.
   ========================================================================== */

// --- 1. Dropdown Navigation ---
function toggleDropdown(id) {
    const dropdown = document.getElementById(id);
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Close dropdowns if user clicks outside
window.addEventListener('click', function(e) {
    if (!e.target.closest('.export-group') && !e.target.closest('.dropdown-group')) {
        document.querySelectorAll('.dropdown-menu').forEach(el => {
            el.classList.remove('active');
        });
    }
});

// --- 2. Generic Modal Actions ---
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // prevent bg scroll
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Close modals when clicking backdrop
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal(this.id);
        }
    });
});

// --- 3. Multi-file upload name displays ---
function updateFilesNameDisplay(input, displayId) {
    const display = document.getElementById(displayId);
    if (display) {
        if (input.files && input.files.length > 0) {
            if (input.files.length === 1) {
                display.textContent = input.files[0].name;
            } else {
                display.textContent = `${input.files.length} files selected`;
            }
            display.style.color = 'var(--text-white)';
            display.style.fontWeight = '500';
        } else {
            display.textContent = "No files chosen";
            display.style.color = '';
            display.style.fontWeight = '';
        }
    }
}

// --- 4. Theme Management Logic ---
function initTheme() {
    const storedTheme = localStorage.getItem("theme") || "dark";
    if (storedTheme === "light") {
        document.body.classList.add("light-theme");
        updateThemeToggleButton(true);
    } else {
        document.body.classList.remove("light-theme");
        updateThemeToggleButton(false);
    }
}

function toggleTheme() {
    const isCurrentlyLight = document.body.classList.contains("light-theme");
    if (isCurrentlyLight) {
        document.body.classList.remove("light-theme");
        localStorage.setItem("theme", "dark");
        updateThemeToggleButton(false);
    } else {
        document.body.classList.add("light-theme");
        localStorage.setItem("theme", "light");
        updateThemeToggleButton(true);
    }
}

function updateThemeToggleButton(isLight) {
    const toggleBtns = document.querySelectorAll("#themeToggle");
    toggleBtns.forEach(btn => {
        const icon = btn.querySelector("i");
        if (icon) {
            if (isLight) {
                icon.className = "fa-solid fa-sun";
            } else {
                icon.className = "fa-solid fa-moon";
            }
        }
    });
}

// Initialize theme immediately on script execute or DOMContentLoaded
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
} else {
    initTheme();
}

// --- 5. Global Creation Helpers ---
function openCreateModal(type) {
    // Reset specific fields depending on type
    const title = document.getElementById("createModalTitle");
    const inputLabel = document.getElementById("createModalInputLabel");
    const inputName = document.getElementById("createResourceName");
    const form = document.getElementById("createResourceForm");

    if (title && inputLabel && inputName && form) {
        inputName.value = "";
        if (type === 'container') {
            title.textContent = "Create Blob Container";
            inputLabel.textContent = "Container Name";
            inputName.placeholder = "e.g. logs-container";
            form.action = "/storage-ui/blobs/create";
        } else if (type === 'share') {
            title.textContent = "Create File Share";
            inputLabel.textContent = "File Share Name";
            inputName.placeholder = "e.g. reports-share";
            form.action = "/storage-ui/fileshares/create";
        } else if (type === 'queue') {
            title.textContent = "Create Message Queue";
            inputLabel.textContent = "Queue Name";
            inputName.placeholder = "e.g. task-queue";
            form.action = "/storage-ui/queues/create";
        } else if (type === 'table') {
            title.textContent = "Create Data Table";
            inputLabel.textContent = "Table Name";
            inputName.placeholder = "e.g. customerTable";
            form.action = "/storage-ui/tables/create";
        }
        openModal("createResourceModal");
    }
}

// --- 6. Multi-Select & Bulk Blob Actions ---
let selectedBlobs = new Set();

function toggleSelectAllBlobs(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.blob-select-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const name = cb.getAttribute('data-name');
        if (name) {
            if (masterCheckbox.checked) {
                selectedBlobs.add(name);
            } else {
                selectedBlobs.delete(name);
            }
        }
    });
    updateBulkToolbar();
}

function updateBlobSelection() {
    selectedBlobs.clear();
    const checkboxes = document.querySelectorAll('.blob-select-checkbox:checked');
    checkboxes.forEach(cb => {
        const name = cb.getAttribute('data-name');
        if (name) selectedBlobs.add(name);
    });

    const master = document.getElementById('selectAllBlobs');
    const allCheckboxes = document.querySelectorAll('.blob-select-checkbox');
    if (master && allCheckboxes.length > 0) {
        master.checked = checkboxes.length === allCheckboxes.length;
        master.indeterminate = checkboxes.length > 0 && checkboxes.length < allCheckboxes.length;
    }
    updateBulkToolbar();
}

function deselectAllBlobs() {
    selectedBlobs.clear();
    document.querySelectorAll('.blob-select-checkbox').forEach(cb => cb.checked = false);
    const master = document.getElementById('selectAllBlobs');
    if (master) {
        master.checked = false;
        master.indeterminate = false;
    }
    updateBulkToolbar();
}

function updateBulkToolbar() {
    const toolbar = document.getElementById('bulkActionsToolbar');
    const badge = document.getElementById('selectedCountBadge');
    const downloadBtn = document.getElementById('btnDownloadSelected');
    if (toolbar && badge) {
        if (selectedBlobs.size > 0) {
            toolbar.style.display = 'flex';
            badge.textContent = `${selectedBlobs.size} selected`;
            if (downloadBtn) {
                if (selectedBlobs.size === 1) {
                    downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i> <span>Download File</span>';
                    downloadBtn.title = 'Download selected file';
                } else {
                    downloadBtn.innerHTML = `<i class="fa-solid fa-file-zipper"></i> <span>Download ZIP (${selectedBlobs.size})</span>`;
                    downloadBtn.title = 'Download all selected files as a ZIP archive';
                }
            }
        } else {
            toolbar.style.display = 'none';
        }
    }
}

function downloadSelectedBlobs(containerName) {
    if (selectedBlobs.size === 0) return;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `/storage-ui/blobs/${encodeURIComponent(containerName)}/download-selected`;
    form.style.display = 'none';

    selectedBlobs.forEach(name => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'blob_names';
        input.value = name;
        form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
}

function openEmptyContainerModal() {
    openModal('emptyContainerModal');
}

function openDeleteContainerModal(containerName) {
    const targetSpan = document.getElementById('deleteContainerTargetName');
    const input = document.getElementById('deleteContainerInput');
    if (targetSpan) targetSpan.textContent = containerName;
    if (input) input.value = containerName;
    openModal('deleteContainerModal');
}

function openBulkDeleteBlobsModal() {
    if (selectedBlobs.size === 0) return;
    const countSpan = document.getElementById('bulkDeleteCount');
    const listDiv = document.getElementById('bulkDeleteBlobsList');
    if (countSpan) countSpan.textContent = selectedBlobs.size;
    if (listDiv) {
        listDiv.innerHTML = Array.from(selectedBlobs).map(name => `
            <div style="padding: 4px 8px; background: rgba(255,255,255,0.04); border-radius: 4px; font-family: var(--font-code); font-size: 12px; word-break: break-all;">
                <i class="fa-solid fa-file" style="color: var(--text-muted); margin-right: 6px;"></i>${name}
            </div>
        `).join('');
    }
    openModal('bulkDeleteBlobsModal');
}

function confirmBulkDeleteBlobs(containerName) {
    if (selectedBlobs.size === 0) return;
    const btn = document.getElementById('btnConfirmBulkDelete');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
    }

    fetch(`/storage-ui/blobs/${encodeURIComponent(containerName)}/delete-multiple`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ blob_names: Array.from(selectedBlobs) })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            window.location.reload();
        } else {
            alert('Error deleting blobs: ' + (data.error || (data.errors ? data.errors.join(', ') : 'Unknown error')));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete Selected Blobs';
            }
        }
    })
    .catch(err => {
        alert('Network or Server Error: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete Selected Blobs';
        }
    });
}

// --- 7. In-Browser Blob File Editor ---
let activeEditingBlob = null;
let activeEditingContainer = null;

function openEditBlobModal(containerName, blobName) {
    activeEditingContainer = containerName;
    activeEditingBlob = blobName;

    const modalTitle = document.getElementById('editBlobTitle');
    const editor = document.getElementById('blobContentEditor');
    const statusText = document.getElementById('editBlobStatus');
    const sizeBadge = document.getElementById('editBlobSizeBadge');
    const saveBtn = document.getElementById('btnSaveBlob');

    if (modalTitle) modalTitle.textContent = `Edit Blob: ${blobName}`;
    if (editor) {
        editor.value = 'Loading blob content...';
        editor.disabled = true;
    }
    if (statusText) statusText.textContent = 'Fetching data from Azure Storage...';
    if (sizeBadge) sizeBadge.textContent = '--';
    if (saveBtn) saveBtn.disabled = true;

    openModal('editBlobModal');

    fetch(`/storage-ui/blobs/${encodeURIComponent(containerName)}/content?blob_name=${encodeURIComponent(blobName)}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (editor) {
                editor.value = data.content;
                editor.disabled = false;
            }
            if (statusText) statusText.textContent = `Type: ${data.content_type || 'text/plain'}`;
            if (sizeBadge) {
                const sizeKb = (data.size / 1024).toFixed(1);
                sizeBadge.textContent = `${sizeKb} KB`;
            }
            if (saveBtn) saveBtn.disabled = false;
        } else {
            if (editor) {
                editor.value = `Unable to load file in text editor.\n\nReason: ${data.error}`;
                editor.disabled = true;
            }
            if (statusText) statusText.textContent = 'Preview unavailable for binary/large files.';
        }
    })
    .catch(err => {
        if (editor) {
            editor.value = `Failed to fetch blob: ${err.message}`;
            editor.disabled = true;
        }
        if (statusText) statusText.textContent = 'Network error fetching content.';
    });
}

function saveBlobContent() {
    if (!activeEditingContainer || !activeEditingBlob) return;
    const editor = document.getElementById('blobContentEditor');
    const saveBtn = document.getElementById('btnSaveBlob');
    const statusText = document.getElementById('editBlobStatus');

    if (!editor || !saveBtn) return;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    if (statusText) statusText.textContent = 'Uploading changes to Azure Storage...';

    fetch(`/storage-ui/blobs/${encodeURIComponent(activeEditingContainer)}/save-content`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            blob_name: activeEditingBlob,
            content: editor.value
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (statusText) statusText.innerHTML = '<span style="color: #10b981;"><i class="fa-solid fa-circle-check"></i> Saved successfully!</span>';
            setTimeout(() => {
                closeModal('editBlobModal');
                window.location.reload();
            }, 700);
        } else {
            alert('Save failed: ' + (data.error || 'Unknown error'));
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
            if (statusText) statusText.textContent = 'Save failed.';
        }
    })
    .catch(err => {
        alert('Network or Gateway Error saving blob: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
        if (statusText) statusText.textContent = 'Network error.';
    });
}

// --- 8. Instant Client-Side Table Filter ---
function filterBlobsTable(query) {
    const q = (query || '').toLowerCase().trim();
    const rows = document.querySelectorAll('.blob-row');
    const emptyRow = document.getElementById('noSearchMatchRow');
    let visibleCount = 0;

    rows.forEach(row => {
        const name = (row.getAttribute('data-blob-name') || '').toLowerCase();
        if (!q || name.includes(q)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    if (emptyRow) {
        emptyRow.style.display = (visibleCount === 0 && rows.length > 0) ? '' : 'none';
    }

    const clearBtn = document.getElementById('btnClearSearch');
    if (clearBtn) {
        clearBtn.style.display = q ? 'inline-block' : 'none';
    }
}

function clearBlobSearch() {
    const input = document.getElementById('blobSearchInput');
    if (input) {
        input.value = '';
        filterBlobsTable('');
        input.focus();
    }
}

// --- 9. Pagination Page Size Selector ---
function changeBlobPageSize(containerName, limit) {
    const url = new URL(window.location.href);
    url.searchParams.set('limit', limit);
    url.searchParams.set('page', 1);
    window.location.href = url.toString();
}

// --- 10. Upload with Live Progress & Gateway Timeout Handling ---
function uploadBlobsWithProgress(event, form, containerName) {
    event.preventDefault();
    const fileInput = form.querySelector('input[type="file"]');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('Please choose at least one file to upload.');
        return;
    }

    const progressContainer = document.getElementById('uploadProgressContainer');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressStatus = document.getElementById('uploadProgressStatus');
    const progressPercent = document.getElementById('uploadProgressPercent');
    const uploadBtn = form.querySelector('button[type="submit"]');

    if (progressContainer) progressContainer.style.display = 'flex';
    if (progressBar) progressBar.style.width = '0%';
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressStatus) progressStatus.textContent = `Uploading ${fileInput.files.length} file(s)...`;
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
    }

    const formData = new FormData(form);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', form.action || window.location.href, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    // 180 seconds timeout for large files
    xhr.timeout = 180000;

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressPercent) progressPercent.textContent = `${percent}%`;
            const loadedMb = (e.loaded / (1024 * 1024)).toFixed(1);
            const totalMb = (e.total / (1024 * 1024)).toFixed(1);
            if (progressStatus) progressStatus.textContent = `Uploaded ${loadedMb} MB of ${totalMb} MB (${percent}%)`;
        }
    };

    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            if (progressBar) progressBar.style.width = '100%';
            if (progressPercent) progressPercent.textContent = '100%';
            if (progressStatus) progressStatus.innerHTML = '<span style="color: #10b981;"><i class="fa-solid fa-circle-check"></i> Upload completed successfully!</span>';
            setTimeout(() => {
                window.location.reload();
            }, 600);
        } else if (xhr.status === 504 || xhr.status === 502) {
            handleUploadTimeout('Gateway Timeout (504/502). The server or ingress took too long to process the upload. Files may still be completing in Azure Storage.');
        } else {
            let errorMsg = `Upload failed with status ${xhr.status}`;
            try {
                const res = JSON.parse(xhr.responseText);
                if (res.error) errorMsg = res.error;
            } catch (e) {}
            handleUploadError(errorMsg);
        }
    };

    xhr.ontimeout = function() {
        handleUploadTimeout('Client request timed out after 3 minutes. The connection may be slow or the ingress gateway dropped the connection.');
    };

    xhr.onerror = function() {
        handleUploadError('Network error occurred during upload. Please check your network connection.');
    };

    function handleUploadTimeout(msg) {
        if (progressStatus) {
            progressStatus.innerHTML = `<span style="color: #f59e0b;"><i class="fa-solid fa-triangle-exclamation"></i> ${msg}</span>`;
        }
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Retry Upload';
        }
    }

    function handleUploadError(msg) {
        if (progressStatus) {
            progressStatus.innerHTML = `<span style="color: #ef4444;"><i class="fa-solid fa-circle-xmark"></i> ${msg}</span>`;
        }
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload Files';
        }
    }

    xhr.send(formData);
}

// ==========================================================================
// 11. Queue Selection, In-Place Editing, Cross-Queue Routing & Enqueue Logic
// ==========================================================================
let selectedQueueMsgs = new Set();
let activeEditingQueueMsg = null;
let activeEditingQueueName = null;
let activeSendQueueMsgs = [];

// --- A. Multi-Select & Bulk Queue Message Actions ---
function toggleSelectAllQueueMsgs(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.queue-msg-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        const msgId = cb.getAttribute('data-id');
        if (msgId) {
            if (masterCheckbox.checked) {
                selectedQueueMsgs.add(msgId);
            } else {
                selectedQueueMsgs.delete(msgId);
            }
        }
    });
    updateQueueBulkToolbar();
}

function updateQueueMsgSelection() {
    selectedQueueMsgs.clear();
    const checkboxes = document.querySelectorAll('.queue-msg-checkbox:checked');
    checkboxes.forEach(cb => {
        const msgId = cb.getAttribute('data-id');
        if (msgId) selectedQueueMsgs.add(msgId);
    });

    const master = document.getElementById('selectAllQueueMsgs');
    const allCheckboxes = document.querySelectorAll('.queue-msg-checkbox');
    if (master && allCheckboxes.length > 0) {
        master.checked = checkboxes.length === allCheckboxes.length;
        master.indeterminate = checkboxes.length > 0 && checkboxes.length < allCheckboxes.length;
    }
    updateQueueBulkToolbar();
}

function deselectAllQueueMsgs() {
    selectedQueueMsgs.clear();
    document.querySelectorAll('.queue-msg-checkbox').forEach(cb => cb.checked = false);
    const master = document.getElementById('selectAllQueueMsgs');
    if (master) {
        master.checked = false;
        master.indeterminate = false;
    }
    updateQueueBulkToolbar();
}

function updateQueueBulkToolbar() {
    const toolbar = document.getElementById('queueBulkActionsToolbar');
    const badge = document.getElementById('selectedQueueCountBadge');
    if (toolbar && badge) {
        if (selectedQueueMsgs.size > 0) {
            toolbar.style.display = 'flex';
            badge.textContent = `${selectedQueueMsgs.size} selected`;
        } else {
            toolbar.style.display = 'none';
        }
    }
}

// --- B. Enqueue Message Modal & Helpers ---
function openEnqueueModal(queueName) {
    const title = document.getElementById('enqueueModalTitle');
    const queueNameSpan = document.getElementById('enqueueTargetQueueName');
    const textarea = document.getElementById('enqueueMsgBody');
    const statusText = document.getElementById('enqueueMsgStatus');
    const sendBtn = document.getElementById('btnSubmitEnqueue');

    if (title) title.textContent = `Enqueue Message into '${queueName}'`;
    if (queueNameSpan) queueNameSpan.textContent = queueName;
    if (textarea) textarea.value = '';
    if (statusText) statusText.textContent = '';
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Enqueue Message';
    }

    // Default to Base64 (Standard for Azure Functions / WebJobs)
    const b64Radio = document.getElementById('enqueueEncodingB64');
    if (b64Radio) b64Radio.checked = true;

    openModal('enqueueMsgModal');
}

function formatEnqueueJson() {
    const textarea = document.getElementById('enqueueMsgBody');
    if (!textarea || !textarea.value.trim()) return;
    try {
        const parsed = JSON.parse(textarea.value.trim());
        textarea.value = JSON.stringify(parsed, null, 2);
    } catch (e) {
        alert('Invalid JSON: ' + e.message);
    }
}

function handleEnqueueSubmit(event, form, queueName) {
    event.preventDefault();
    const textarea = document.getElementById('enqueueMsgBody');
    const encodingInput = form.querySelector('input[name="encoding"]:checked');
    const visInput = form.querySelector('input[name="visibility_timeout"]');
    const ttlInput = form.querySelector('input[name="time_to_live"]');
    const sendBtn = document.getElementById('btnSubmitEnqueue');
    const statusText = document.getElementById('enqueueMsgStatus');

    const msgContent = textarea ? textarea.value.trim() : '';
    const encoding = encodingInput ? encodingInput.value : 'base64';
    const visTimeout = visInput ? visInput.value : '0';
    const ttl = ttlInput ? ttlInput.value : '';

    if (!msgContent) {
        alert('Please enter a message body before enqueuing.');
        return;
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enqueuing...';
    }
    if (statusText) statusText.textContent = 'Submitting message to Azure Queue...';

    fetch(`/storage-ui/queues/${encodeURIComponent(queueName)}/enqueue`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            msg: msgContent,
            encoding: encoding,
            visibility_timeout: visTimeout,
            time_to_live: ttl
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (statusText) statusText.innerHTML = '<span style="color: #10b981;"><i class="fa-solid fa-circle-check"></i> Message enqueued successfully!</span>';
            setTimeout(() => {
                closeModal('enqueueMsgModal');
                window.location.reload();
            }, 600);
        } else {
            alert('Enqueue error: ' + (data.error || 'Unknown error'));
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Enqueue Message';
            }
            if (statusText) statusText.textContent = 'Enqueue failed.';
        }
    })
    .catch(err => {
        alert('Network or Server Error: ' + err.message);
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Enqueue Message';
        }
        if (statusText) statusText.textContent = 'Network error.';
    });
}

// --- C. In-Place Queue Message Editor ---
function openEditQueueMsgModal(queueName, msgId) {
    activeEditingQueueName = queueName;
    activeEditingQueueMsg = msgId;

    const modalTitle = document.getElementById('editQueueMsgTitle');
    const editor = document.getElementById('queueMsgContentEditor');
    const statusText = document.getElementById('editQueueMsgStatus');
    const msgIdBadge = document.getElementById('editQueueMsgIdBadge');
    const dequeueCountBadge = document.getElementById('editQueueMsgDequeueCount');
    const saveBtn = document.getElementById('btnSaveQueueMsg');

    if (modalTitle) modalTitle.textContent = `Edit Message: ${msgId}`;
    if (msgIdBadge) msgIdBadge.textContent = msgId;
    if (dequeueCountBadge) dequeueCountBadge.textContent = '--';
    if (editor) {
        editor.value = 'Loading queue message...';
        editor.disabled = true;
    }
    if (statusText) statusText.textContent = 'Fetching message payload from Azure Queue...';
    if (saveBtn) saveBtn.disabled = true;

    openModal('editQueueMsgModal');

    fetch(`/storage-ui/queues/${encodeURIComponent(queueName)}/message-content?msg_id=${encodeURIComponent(msgId)}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (editor) {
                editor.value = data.decoded_content || data.raw_content || '';
                editor.disabled = false;
            }
            if (dequeueCountBadge) {
                dequeueCountBadge.textContent = `Dequeued: ${data.dequeue_count || 0} times`;
            }
            if (statusText) {
                statusText.textContent = `Inserted: ${data.insertion_time || '--'} | Format: ${data.is_base64 ? 'Base64 Encoded' : 'Plain Text'}`;
            }
            // Set radio encoding button based on whether it was detected as base64
            const b64Radio = document.getElementById('editMsgEncodingB64');
            const plainRadio = document.getElementById('editMsgEncodingPlain');
            if (data.is_base64 && b64Radio) {
                b64Radio.checked = true;
            } else if (plainRadio) {
                plainRadio.checked = true;
            }
            if (saveBtn) saveBtn.disabled = false;
        } else {
            if (editor) {
                editor.value = `Unable to load message.\n\nReason: ${data.error}`;
                editor.disabled = true;
            }
            if (statusText) statusText.textContent = 'Message not available or leased by consumer.';
        }
    })
    .catch(err => {
        if (editor) {
            editor.value = `Failed to fetch message: ${err.message}`;
            editor.disabled = true;
        }
        if (statusText) statusText.textContent = 'Network error fetching message content.';
    });
}

function saveQueueMsg() {
    if (!activeEditingQueueName || !activeEditingQueueMsg) return;
    const editor = document.getElementById('queueMsgContentEditor');
    const encodingInput = document.querySelector('input[name="editMsgEncoding"]:checked');
    const saveBtn = document.getElementById('btnSaveQueueMsg');
    const statusText = document.getElementById('editQueueMsgStatus');

    if (!editor || !saveBtn) return;
    const encoding = encodingInput ? encodingInput.value : 'base64';

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating in Queue...';
    if (statusText) statusText.textContent = 'Updating message payload in Azure Queue...';

    fetch(`/storage-ui/queues/${encodeURIComponent(activeEditingQueueName)}/update-message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            msg_id: activeEditingQueueMsg,
            content: editor.value,
            encoding: encoding
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (statusText) statusText.innerHTML = '<span style="color: #10b981;"><i class="fa-solid fa-circle-check"></i> Message successfully updated!</span>';
            setTimeout(() => {
                closeModal('editQueueMsgModal');
                window.location.reload();
            }, 700);
        } else {
            alert('Update failed: ' + (data.error || 'Unknown error'));
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save & Update Message';
            if (statusText) statusText.textContent = 'Update failed.';
        }
    })
    .catch(err => {
        alert('Network or Server Error updating message: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save & Update Message';
        if (statusText) statusText.textContent = 'Network error.';
    });
}

// --- D. Send / Move to Another Queue ---
function openSendToQueueModal(queueName, singleMsgId = null) {
    activeEditingQueueName = queueName;
    if (singleMsgId) {
        activeSendQueueMsgs = [singleMsgId];
    } else {
        activeSendQueueMsgs = Array.from(selectedQueueMsgs);
    }

    if (activeSendQueueMsgs.length === 0) {
        alert('Please select at least one message to send.');
        return;
    }

    const countBadge = document.getElementById('sendQueueCountBadge');
    const msgListDiv = document.getElementById('sendQueueMsgsList');
    const transferBtn = document.getElementById('btnConfirmSendToQueue');

    if (countBadge) countBadge.textContent = `${activeSendQueueMsgs.length} message(s)`;
    if (msgListDiv) {
        msgListDiv.innerHTML = activeSendQueueMsgs.map(id => `
            <div style="padding: 4px 8px; background: rgba(255,255,255,0.04); border-radius: 4px; font-family: var(--font-code); font-size: 12px; word-break: break-all;">
                <i class="fa-solid fa-envelope" style="color: var(--accent-blue); margin-right: 6px;"></i>${id}
            </div>
        `).join('');
    }

    if (transferBtn) {
        transferBtn.disabled = false;
        transferBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Transfer Messages';
    }

    openModal('sendToQueueModal');
}

function confirmSendToQueue() {
    if (!activeEditingQueueName || activeSendQueueMsgs.length === 0) return;

    const select = document.getElementById('destQueueSelect');
    const customInput = document.getElementById('destQueueCustomInput');
    let destQueue = select ? select.value : '';
    if (destQueue === '__custom__' && customInput) {
        destQueue = customInput.value.trim();
    }

    if (!destQueue) {
        alert('Please choose or enter a destination queue.');
        return;
    }

    if (destQueue === activeEditingQueueName) {
        const confirmSelf = confirm(`Destination queue is the same as source queue '${destQueue}'. Are you sure you want to re-enqueue?`);
        if (!confirmSelf) return;
    }

    const actionTypeInput = document.querySelector('input[name="queueTransferAction"]:checked');
    const actionType = actionTypeInput ? actionTypeInput.value : 'move';

    const encodingInput = document.querySelector('input[name="queueTransferEncoding"]:checked');
    const encoding = encodingInput ? encodingInput.value : 'preserve';

    const transferBtn = document.getElementById('btnConfirmSendToQueue');
    if (transferBtn) {
        transferBtn.disabled = true;
        transferBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Transferring...';
    }

    fetch(`/storage-ui/queues/${encodeURIComponent(activeEditingQueueName)}/send-to-queue`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            msg_ids: activeSendQueueMsgs,
            destination_queue: destQueue,
            action_type: actionType,
            encoding: encoding
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(data.message || `Successfully transferred ${data.transferred_count} message(s) to '${destQueue}'.`);
            closeModal('sendToQueueModal');
            window.location.reload();
        } else {
            alert('Transfer failed: ' + (data.error || 'Unknown error'));
            if (transferBtn) {
                transferBtn.disabled = false;
                transferBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Transfer Messages';
            }
        }
    })
    .catch(err => {
        alert('Network or Server Error: ' + err.message);
        if (transferBtn) {
            transferBtn.disabled = false;
            transferBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Transfer Messages';
        }
    });
}

function onDestQueueSelectChange(select) {
    const customDiv = document.getElementById('destQueueCustomGroup');
    if (customDiv) {
        customDiv.style.display = (select.value === '__custom__') ? 'block' : 'none';
    }
}

// --- E. Dequeue Modals (Single & Bulk) ---
let activeSingleDequeueMsgId = null;

function openSingleDequeueModal(queueName, msgId) {
    activeEditingQueueName = queueName;
    activeSingleDequeueMsgId = msgId;

    const idSpan = document.getElementById('singleDequeueMsgId');
    if (idSpan) idSpan.textContent = msgId;

    openModal('singleDequeueModal');
}

function confirmSingleDequeue() {
    if (!activeEditingQueueName || !activeSingleDequeueMsgId) return;

    const btn = document.getElementById('btnConfirmSingleDequeue');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dequeuing...';
    }

    fetch(`/storage-ui/queues/${encodeURIComponent(activeEditingQueueName)}/dequeue-single`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ msg_id: activeSingleDequeueMsgId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('singleDequeueModal');
            window.location.reload();
        } else {
            alert('Dequeue error: ' + (data.error || 'Unknown error'));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-minus"></i> Dequeue Message';
            }
        }
    })
    .catch(err => {
        alert('Network error: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-minus"></i> Dequeue Message';
        }
    });
}

function openBulkDequeueModal(queueName) {
    activeEditingQueueName = queueName;
    if (selectedQueueMsgs.size === 0) return;

    const countSpan = document.getElementById('bulkDequeueCount');
    const listDiv = document.getElementById('bulkDequeueMsgsList');

    if (countSpan) countSpan.textContent = selectedQueueMsgs.size;
    if (listDiv) {
        listDiv.innerHTML = Array.from(selectedQueueMsgs).map(id => `
            <div style="padding: 4px 8px; background: rgba(255,255,255,0.04); border-radius: 4px; font-family: var(--font-code); font-size: 12px; word-break: break-all;">
                <i class="fa-solid fa-envelope" style="color: #f87171; margin-right: 6px;"></i>${id}
            </div>
        `).join('');
    }

    openModal('bulkDequeueModal');
}

function confirmBulkDequeue() {
    if (!activeEditingQueueName || selectedQueueMsgs.size === 0) return;

    const btn = document.getElementById('btnConfirmBulkDequeue');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dequeuing...';
    }

    fetch(`/storage-ui/queues/${encodeURIComponent(activeEditingQueueName)}/dequeue-multiple`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ msg_ids: Array.from(selectedQueueMsgs) })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('bulkDequeueModal');
            window.location.reload();
        } else {
            alert('Bulk dequeue error: ' + (data.error || 'Unknown error'));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Dequeue Selected Messages';
            }
        }
    })
    .catch(err => {
        alert('Network error: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Dequeue Selected Messages';
        }
    });
}

function openDequeueAllModal(queueName) {
    const nameSpan = document.getElementById('dequeueAllTargetQueueName');
    if (nameSpan) nameSpan.textContent = queueName;
    openModal('dequeueAllModal');
}

function openDeleteQueueModal(queueName) {
    const targetSpan = document.getElementById('deleteQueueTargetName');
    const input = document.getElementById('deleteQueueInput');
    if (targetSpan) targetSpan.textContent = queueName;
    if (input) input.value = queueName;
    openModal('deleteQueueModal');
}

// --- F. Toggle Raw / Decoded Preview in Table Row ---
function decodeBase64Client(str) {
    if (!str || typeof str !== 'string') return str;
    try {
        const cleaned = str.replace(/[\r\n\s\t]/g, '');
        // Handle padding
        const missingPadding = (4 - (cleaned.length % 4)) % 4;
        const padded = cleaned + '='.repeat(missingPadding);
        // Standard base64 decoding with UTF-8 support
        const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const decoder = new TextDecoder('utf-8');
        const decoded = decoder.decode(bytes);
        if (decoded && decoded.trim() && decoded !== str) {
            return decoded;
        }
    } catch (e) {}
    return str;
}

function setQueueMsgViewMode(index, mode, explicitDecoded, explicitRaw) {
    const previewEl = document.getElementById(`queue-preview-${index}`);
    const fullEl = document.getElementById(`queue-full-${index}`);
    const btnDecoded = document.getElementById(`btn-decoded-${index}`);
    const btnRaw = document.getElementById(`btn-raw-${index}`);
    if (!previewEl) return;

    let decodedContent = explicitDecoded;
    let rawContent = explicitRaw;

    if (decodedContent === undefined || rawContent === undefined) {
        const dataScript = document.getElementById(`queue-msg-data-${index}`);
        if (dataScript) {
            try {
                const data = JSON.parse(dataScript.textContent);
                decodedContent = data.decoded;
                rawContent = data.raw;
            } catch (e) {
                console.error("Error parsing queue message payload JSON:", e);
            }
        }
    }

    if (rawContent === undefined) rawContent = previewEl.textContent || '';
    if (decodedContent === undefined) decodedContent = rawContent;

    let effectiveDecoded = decodedContent;
    if (!effectiveDecoded || effectiveDecoded === rawContent) {
        const clientDecoded = decodeBase64Client(rawContent);
        if (clientDecoded && clientDecoded !== rawContent) {
            effectiveDecoded = clientDecoded;
        }
    }

    if (mode === 'raw') {
        const rawTrimmed = (rawContent || '').trim();
        const rawTrunc = rawTrimmed.length > 120 ? (rawTrimmed.substring(0, 120) + '...') : rawTrimmed;
        previewEl.textContent = rawTrunc;
        if (fullEl) fullEl.textContent = rawContent;
        if (btnRaw) btnRaw.classList.add('active');
        if (btnDecoded) btnDecoded.classList.remove('active');
    } else {
        const decTrimmed = (effectiveDecoded || '').trim();
        const decTrunc = decTrimmed.length > 120 ? (decTrimmed.substring(0, 120) + '...') : decTrimmed;
        previewEl.textContent = decTrunc;
        if (fullEl) fullEl.textContent = effectiveDecoded;
        if (btnDecoded) btnDecoded.classList.add('active');
        if (btnRaw) btnRaw.classList.remove('active');
    }
}

function toggleQueueMsgView(index, decodedContent, rawContent) {
    const toggleBtn = document.getElementById(`queue-toggle-${index}`);
    const currentMode = (toggleBtn && toggleBtn.getAttribute('data-mode')) || 'raw';
    const nextMode = (currentMode === 'raw') ? 'decoded' : 'raw';
    if (toggleBtn) toggleBtn.setAttribute('data-mode', nextMode);
    setQueueMsgViewMode(index, nextMode, decodedContent, rawContent);
}

function toggleQueueMsgExpand(index) {
    const fullEl = document.getElementById(`queue-full-${index}`);
    const expandBtn = document.getElementById(`queue-expand-${index}`);
    if (!fullEl || !expandBtn) return;

    if (fullEl.style.display === 'none' || !fullEl.style.display) {
        fullEl.style.display = 'block';
        expandBtn.innerHTML = 'Collapse ▲';
    } else {
        fullEl.style.display = 'none';
        expandBtn.innerHTML = 'Show Full ▼';
    }
}

// --- G. Instant Client-Side Queue Filter ---
function filterQueueMessagesTable(query) {
    const q = (query || '').toLowerCase().trim();
    const rows = document.querySelectorAll('.queue-msg-row');
    const emptyRow = document.getElementById('noQueueMsgMatchRow');
    let visibleCount = 0;

    rows.forEach(row => {
        const text = (row.innerText || '').toLowerCase();
        if (!q || text.includes(q)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    if (emptyRow) {
        emptyRow.style.display = (visibleCount === 0 && rows.length > 0) ? '' : 'none';
    }

    const clearBtn = document.getElementById('btnClearQueueSearch');
    if (clearBtn) {
        clearBtn.style.display = q ? 'inline-block' : 'none';
    }
}

function clearQueueSearch() {
    const input = document.getElementById('queueSearchInput');
    if (input) {
        input.value = '';
        filterQueueMessagesTable('');
        input.focus();
    }
}

