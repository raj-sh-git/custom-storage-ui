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

let currentOpenDropdown = null;
let lastDropdownOpenTime = 0;

function toggleActionDropdown(event, button) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const parent = button.closest('.action-dropdown');
    if (!parent) return;

    // Find the menu either inside parent or currently attached to body
    let menu = parent.querySelector('.action-dropdown-menu');
    if (!menu && currentOpenDropdown && currentOpenDropdown.parent === parent) {
        menu = currentOpenDropdown.menu;
    }
    if (!menu) return;

    const isAlreadyOpen = currentOpenDropdown && currentOpenDropdown.parent === parent;

    // Close any currently open dropdown first
    closeAllActionDropdowns();

    if (!isAlreadyOpen) {
        lastDropdownOpenTime = Date.now();
        parent.classList.add('active');

        // Store original parent to restore when closed
        menu._originalParent = parent;

        // Move to document.body so ancestor backdrop-filter/overflow cannot clip or misplace it
        document.body.appendChild(menu);

        menu.style.display = 'block';
        menu.style.visibility = 'hidden';
        menu.style.position = 'fixed';

        const btnRect = button.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const menuWidth = menuRect.width || 180;
        const menuHeight = menuRect.height || 160;

        let top = btnRect.bottom + 4;
        let left = btnRect.right - menuWidth;

        // Smart flip upwards if extending beyond viewport bottom
        if (top + menuHeight > window.innerHeight - 10) {
            const flippedTop = btnRect.top - menuHeight - 4;
            if (flippedTop >= 10 || (window.innerHeight - top < btnRect.top)) {
                top = flippedTop;
            }
        }

        // Clamp to viewport boundaries
        if (top < 10) top = 10;
        if (top + menuHeight > window.innerHeight - 10) {
            top = Math.max(10, window.innerHeight - menuHeight - 10);
        }

        if (left < 10) left = 10;
        if (left + menuWidth > window.innerWidth - 10) {
            left = window.innerWidth - menuWidth - 10;
        }

        menu.style.top = `${Math.round(top)}px`;
        menu.style.left = `${Math.round(left)}px`;
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
        menu.style.zIndex = '999999';
        menu.style.visibility = 'visible';

        currentOpenDropdown = { parent, menu, button };
    }
}

function closeAllActionDropdowns() {
    if (currentOpenDropdown) {
        const { parent, menu } = currentOpenDropdown;
        if (parent) parent.classList.remove('active');
        if (menu) {
            menu.style.display = 'none';
            menu.style.visibility = '';
            menu.style.position = '';
            menu.style.top = '';
            menu.style.left = '';
            menu.style.right = '';
            menu.style.bottom = '';
            menu.style.zIndex = '';
            if (menu._originalParent && menu.parentNode !== menu._originalParent) {
                menu._originalParent.appendChild(menu);
            }
        }
        currentOpenDropdown = null;
    }

    // Safety fallback for any remaining active dropdowns
    document.querySelectorAll('.action-dropdown.active').forEach(el => {
        el.classList.remove('active');
        const m = el.querySelector('.action-dropdown-menu');
        if (m) {
            m.style.display = 'none';
        }
    });
}

// Close dropdowns if user clicks outside
window.addEventListener('click', function(e) {
    if (!e.target.closest('.export-group') && !e.target.closest('.dropdown-group')) {
        document.querySelectorAll('.dropdown-menu').forEach(el => {
            el.classList.remove('active');
        });
    }
    if (currentOpenDropdown) {
        // If click is outside both the button and the active floating menu, close it
        if (!e.target.closest('.action-dropdown') && !e.target.closest('.action-dropdown-menu')) {
            closeAllActionDropdowns();
        } else if (e.target.closest('.action-dropdown-item')) {
            // If an action item was clicked, close menu after slight delay so action triggers
            setTimeout(closeAllActionDropdowns, 100);
        }
    }
});

// Close fixed action menus on scroll or resize
window.addEventListener('scroll', function(e) {
    if (Date.now() - lastDropdownOpenTime < 200) return;
    if (currentOpenDropdown) {
        // If scrolling inside the dropdown menu itself, do not close
        if (e.target && (e.target === currentOpenDropdown.menu || (currentOpenDropdown.menu.contains && currentOpenDropdown.menu.contains(e.target)))) {
            return;
        }
        closeAllActionDropdowns();
    }
}, true);

window.addEventListener('resize', function() {
    closeAllActionDropdowns();
});

// --- Toast & Clipboard Notifications ---
function showToast(message, type = 'info') {
    let container = document.getElementById('storage-ui-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'storage-ui-toast-container';
        container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 999999; display: flex; flex-direction: column; gap: 8px; pointer-events: none;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = 'background: rgba(15, 23, 42, 0.95); color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.15); backdrop-filter: blur(12px); padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 500; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); display: flex; align-items: center; gap: 8px; pointer-events: auto; transition: opacity 0.3s ease;';
    const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info');
    const color = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#0078d4');
    toast.innerHTML = `<i class="fa-solid ${icon}" style="color: ${color};"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

function copyTextToClipboard(text, successMsg = 'Copied to clipboard!') {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(successMsg, 'success');
        }).catch(() => {
            fallbackCopyText(text, successMsg);
        });
    } else {
        fallbackCopyText(text, successMsg);
    }
}

function fallbackCopyText(text, successMsg) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast(successMsg, 'success');
    } catch (err) {
        console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
}

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
    const box = document.getElementById(`queue-box-${index}`);
    const contentEl = document.getElementById(`queue-content-${index}`) || document.getElementById(`queue-preview-${index}`);
    const btnDecoded = document.getElementById(`btn-decoded-${index}`);
    const btnRaw = document.getElementById(`btn-raw-${index}`);
    if (!contentEl) return;

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

    if (rawContent === undefined) rawContent = contentEl.textContent || '';
    if (decodedContent === undefined) decodedContent = rawContent;

    let effectiveDecoded = decodedContent;
    if (!effectiveDecoded || effectiveDecoded === rawContent) {
        const clientDecoded = decodeBase64Client(rawContent);
        if (clientDecoded && clientDecoded !== rawContent) {
            effectiveDecoded = clientDecoded;
        }
    }

    const isExpanded = box && box.classList.contains('expanded');
    const activePayload = (mode === 'raw') ? (rawContent || '') : (effectiveDecoded || '');

    if (isExpanded) {
        contentEl.textContent = activePayload;
    } else {
        const trimmed = activePayload.trim();
        contentEl.textContent = trimmed.length > 120 ? (trimmed.substring(0, 120) + '...') : trimmed;
    }

    if (mode === 'raw') {
        if (btnRaw) btnRaw.classList.add('active');
        if (btnDecoded) btnDecoded.classList.remove('active');
    } else {
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
    const box = document.getElementById(`queue-box-${index}`);
    const contentEl = document.getElementById(`queue-content-${index}`) || document.getElementById(`queue-preview-${index}`);
    const expandBtn = document.getElementById(`queue-expand-${index}`);
    const expandText = document.getElementById(`queue-expand-text-${index}`);
    const expandIcon = document.getElementById(`queue-expand-icon-${index}`);
    if (!box || !contentEl) return;

    // Determine current view mode (raw or decoded)
    const btnDecoded = document.getElementById(`btn-decoded-${index}`);
    const isDecodedMode = btnDecoded && btnDecoded.classList.contains('active');
    const mode = isDecodedMode ? 'decoded' : 'raw';

    let decodedContent = '';
    let rawContent = '';
    const dataScript = document.getElementById(`queue-msg-data-${index}`);
    if (dataScript) {
        try {
            const data = JSON.parse(dataScript.textContent);
            decodedContent = data.decoded;
            rawContent = data.raw;
        } catch (e) {}
    }
    if (!rawContent) rawContent = contentEl.textContent || '';
    if (!decodedContent) decodedContent = rawContent;

    let effectiveDecoded = decodedContent;
    if (!effectiveDecoded || effectiveDecoded === rawContent) {
        const clientDecoded = decodeBase64Client(rawContent);
        if (clientDecoded && clientDecoded !== rawContent) {
            effectiveDecoded = clientDecoded;
        }
    }

    const activePayload = (mode === 'raw') ? (rawContent || '') : (effectiveDecoded || '');
    const isCurrentlyExpanded = box.classList.contains('expanded');

    if (isCurrentlyExpanded) {
        // Collapse to single-line preview
        box.classList.remove('expanded');
        box.classList.add('collapsed');
        const trimmed = activePayload.trim();
        contentEl.textContent = trimmed.length > 120 ? (trimmed.substring(0, 120) + '...') : trimmed;

        if (expandText) expandText.textContent = 'Show Full';
        if (expandIcon) expandIcon.className = 'fa-solid fa-chevron-down';
        if (expandBtn) {
            expandBtn.classList.remove('active-expand');
            expandBtn.title = 'Expand full content in place';
        }
    } else {
        // Expand the SAME box to show full multiline content
        box.classList.remove('collapsed');
        box.classList.add('expanded');
        contentEl.textContent = activePayload;

        if (expandText) expandText.textContent = 'Collapse';
        if (expandIcon) expandIcon.className = 'fa-solid fa-chevron-up';
        if (expandBtn) {
            expandBtn.classList.add('active-expand');
            expandBtn.title = 'Collapse content to single line';
        }
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

// =========================================================================
// Service Action Menu & Modal Handlers (Blobs, File Shares, Queues, Tables)
// =========================================================================

// --- 1. Blob Action Handlers ---
let activeBlobContainer = '';

function openRenameBlobModal(containerName, blobName) {
    activeBlobContainer = containerName;
    const oldInput = document.getElementById('renameBlobOldName');
    const newInput = document.getElementById('renameBlobNewName');
    const errDiv = document.getElementById('renameBlobError');
    if (oldInput) oldInput.value = blobName;
    if (newInput) newInput.value = blobName;
    if (errDiv) {
        errDiv.style.display = 'none';
        errDiv.textContent = '';
    }
    openModal('renameBlobModal');
    if (newInput) {
        setTimeout(() => {
            newInput.focus();
            newInput.select();
        }, 150);
    }
}

function handleRenameBlobSubmit(event) {
    if (event) event.preventDefault();
    const oldName = document.getElementById('renameBlobOldName')?.value?.trim();
    const newName = document.getElementById('renameBlobNewName')?.value?.trim();
    const btn = document.getElementById('btnConfirmRenameBlob');
    const errDiv = document.getElementById('renameBlobError');

    if (!oldName || !newName) {
        if (errDiv) {
            errDiv.textContent = 'Old and new blob names are required.';
            errDiv.style.display = 'block';
        }
        return;
    }
    if (oldName === newName) {
        closeModal('renameBlobModal');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Renaming...';
    }

    fetch(`/storage-ui/blobs/${encodeURIComponent(activeBlobContainer)}/rename`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ old_name: oldName, new_name: newName })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('renameBlobModal');
            window.location.reload();
        } else {
            if (errDiv) {
                errDiv.textContent = data.error || 'Failed to rename blob.';
                errDiv.style.display = 'block';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Rename Blob</span>';
            }
        }
    })
    .catch(err => {
        if (errDiv) {
            errDiv.textContent = 'Network error: ' + err.message;
            errDiv.style.display = 'block';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Rename Blob</span>';
        }
    });
}

function openMoveBlobModal(containerName, blobName) {
    activeBlobContainer = containerName;
    const srcInput = document.getElementById('moveBlobSourceName');
    const destPath = document.getElementById('moveBlobDestPath');
    const destContainer = document.getElementById('moveBlobDestContainer');
    const errDiv = document.getElementById('moveBlobError');

    if (srcInput) srcInput.value = blobName;
    if (destPath) destPath.value = blobName;
    if (destContainer) destContainer.value = containerName;
    if (errDiv) {
        errDiv.style.display = 'none';
        errDiv.textContent = '';
    }
    openModal('moveBlobModal');
}

function handleMoveBlobSubmit(event) {
    if (event) event.preventDefault();
    const srcBlob = document.getElementById('moveBlobSourceName')?.value?.trim();
    const destContainer = document.getElementById('moveBlobDestContainer')?.value;
    const destPath = document.getElementById('moveBlobDestPath')?.value?.trim();
    const modeRadio = document.querySelector('input[name="blob_op_mode"]:checked');
    const opMode = modeRadio ? modeRadio.value : 'move';
    const btn = document.getElementById('btnConfirmMoveBlob');
    const errDiv = document.getElementById('moveBlobError');

    if (!srcBlob || !destContainer || !destPath) {
        if (errDiv) {
            errDiv.textContent = 'Source blob, destination container, and destination path are required.';
            errDiv.style.display = 'block';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${opMode === 'move' ? 'Moving...' : 'Copying...'}`;
    }

    fetch(`/storage-ui/blobs/${encodeURIComponent(activeBlobContainer)}/move-copy`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            blob_name: srcBlob,
            dest_container: destContainer,
            dest_blob_name: destPath,
            action_type: opMode
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('moveBlobModal');
            window.location.reload();
        } else {
            if (errDiv) {
                errDiv.textContent = data.error || 'Operation failed.';
                errDiv.style.display = 'block';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Apply</span>';
            }
        }
    })
    .catch(err => {
        if (errDiv) {
            errDiv.textContent = 'Network error: ' + err.message;
            errDiv.style.display = 'block';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Apply</span>';
        }
    });
}

function openDeleteSingleBlobModal(containerName, blobName) {
    const nameSpan = document.getElementById('deleteSingleBlobName');
    const input = document.getElementById('deleteSingleBlobInput');
    if (nameSpan) nameSpan.textContent = blobName;
    if (input) input.value = blobName;
    openModal('deleteSingleBlobModal');
}

// --- 2. File Share Action Handlers ---
let activeFileShare = '';
let activeShareFilename = '';

function openEditShareFileModal(share, filename) {
    activeFileShare = share;
    activeShareFilename = filename;
    const title = document.getElementById('editShareFileTitle');
    const status = document.getElementById('editShareFileStatus');
    const editor = document.getElementById('shareFileContentEditor');
    const btn = document.getElementById('btnSaveShareFile');

    if (title) title.textContent = `Edit File: ${filename}`;
    if (status) status.textContent = 'Fetching file data...';
    if (editor) editor.value = '';
    if (btn) btn.disabled = true;

    openModal('editShareFileModal');

    fetch(`/storage-ui/fileshares/${encodeURIComponent(share)}/file-content?filename=${encodeURIComponent(filename)}`)
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (editor) editor.value = data.content || '';
            if (status) status.textContent = data.is_text ? 'UTF-8 Text File' : 'Binary data (preview only)';
            if (btn) btn.disabled = !data.is_text;
        } else {
            if (status) status.textContent = 'Error: ' + (data.error || 'Failed to read file');
        }
    })
    .catch(err => {
        if (status) status.textContent = 'Network error: ' + err.message;
    });
}

function saveShareFileContent() {
    if (!activeFileShare || !activeShareFilename) return;
    const editor = document.getElementById('shareFileContentEditor');
    const btn = document.getElementById('btnSaveShareFile');
    const status = document.getElementById('editShareFileStatus');
    const content = editor ? editor.value : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    fetch(`/storage-ui/fileshares/${encodeURIComponent(activeFileShare)}/save-content`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ filename: activeShareFilename, content: content })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('editShareFileModal');
            showToast('File saved successfully!', 'success');
        } else {
            if (status) status.textContent = 'Save error: ' + (data.error || 'Failed to save');
            alert('Error saving file: ' + (data.error || 'Unknown error'));
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Save Changes</span>';
        }
    })
    .catch(err => {
        if (status) status.textContent = 'Network error: ' + err.message;
        alert('Network error: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Save Changes</span>';
        }
    });
}

function openRenameShareFileModal(share, filename) {
    activeFileShare = share;
    const oldInput = document.getElementById('renameShareFileOldName');
    const newInput = document.getElementById('renameShareFileNewName');
    const errDiv = document.getElementById('renameShareFileError');

    if (oldInput) oldInput.value = filename;
    if (newInput) newInput.value = filename;
    if (errDiv) {
        errDiv.style.display = 'none';
        errDiv.textContent = '';
    }
    openModal('renameShareFileModal');
    if (newInput) {
        setTimeout(() => {
            newInput.focus();
            newInput.select();
        }, 150);
    }
}

function handleRenameShareFileSubmit(event) {
    if (event) event.preventDefault();
    const oldName = document.getElementById('renameShareFileOldName')?.value?.trim();
    const newName = document.getElementById('renameShareFileNewName')?.value?.trim();
    const btn = document.getElementById('btnConfirmRenameShareFile');
    const errDiv = document.getElementById('renameShareFileError');

    if (!oldName || !newName) {
        if (errDiv) {
            errDiv.textContent = 'Old and new filenames are required.';
            errDiv.style.display = 'block';
        }
        return;
    }
    if (oldName === newName) {
        closeModal('renameShareFileModal');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Renaming...';
    }

    fetch(`/storage-ui/fileshares/${encodeURIComponent(activeFileShare)}/rename-file`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ old_name: oldName, new_name: newName })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('renameShareFileModal');
            window.location.reload();
        } else {
            if (errDiv) {
                errDiv.textContent = data.error || 'Failed to rename file.';
                errDiv.style.display = 'block';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Rename File</span>';
            }
        }
    })
    .catch(err => {
        if (errDiv) {
            errDiv.textContent = 'Network error: ' + err.message;
            errDiv.style.display = 'block';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Rename File</span>';
        }
    });
}

function openMoveShareFileModal(share, filename) {
    activeFileShare = share;
    const srcInput = document.getElementById('moveShareFileSourceName');
    const destPath = document.getElementById('moveShareFileDestPath');
    const destShare = document.getElementById('moveShareFileDestShare');
    const errDiv = document.getElementById('moveShareFileError');

    if (srcInput) srcInput.value = filename;
    if (destPath) destPath.value = filename;
    if (destShare) destShare.value = share;
    if (errDiv) {
        errDiv.style.display = 'none';
        errDiv.textContent = '';
    }
    openModal('moveShareFileModal');
}

function handleMoveShareFileSubmit(event) {
    if (event) event.preventDefault();
    const srcFile = document.getElementById('moveShareFileSourceName')?.value?.trim();
    const destShare = document.getElementById('moveShareFileDestShare')?.value;
    const destPath = document.getElementById('moveShareFileDestPath')?.value?.trim();
    const modeRadio = document.querySelector('input[name="share_file_op_mode"]:checked');
    const opMode = modeRadio ? modeRadio.value : 'move';
    const btn = document.getElementById('btnConfirmMoveShareFile');
    const errDiv = document.getElementById('moveShareFileError');

    if (!srcFile || !destShare || !destPath) {
        if (errDiv) {
            errDiv.textContent = 'Source filename, destination share, and destination filename are required.';
            errDiv.style.display = 'block';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${opMode === 'move' ? 'Moving...' : 'Copying...'}`;
    }

    fetch(`/storage-ui/fileshares/${encodeURIComponent(activeFileShare)}/move-copy-file`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            filename: srcFile,
            dest_share: destShare,
            dest_filename: destPath,
            action_type: opMode
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('moveShareFileModal');
            window.location.reload();
        } else {
            if (errDiv) {
                errDiv.textContent = data.error || 'Operation failed.';
                errDiv.style.display = 'block';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Apply</span>';
            }
        }
    })
    .catch(err => {
        if (errDiv) {
            errDiv.textContent = 'Network error: ' + err.message;
            errDiv.style.display = 'block';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Apply</span>';
        }
    });
}

function openDeleteShareFileModal(share, filename) {
    const nameSpan = document.getElementById('deleteShareFileName');
    const input = document.getElementById('deleteShareFileInput');
    if (nameSpan) nameSpan.textContent = filename;
    if (input) input.value = filename;
    openModal('deleteShareFileModal');
}

// --- 3. Queue Action Handlers ---
function copyQueueMsgPayload(index) {
    const btnDecoded = document.getElementById(`btn-decoded-${index}`);
    const isDecodedMode = btnDecoded && btnDecoded.classList.contains('active');
    const dataScript = document.getElementById(`queue-msg-data-${index}`);
    let content = '';
    if (dataScript) {
        try {
            const data = JSON.parse(dataScript.textContent);
            content = isDecodedMode ? (data.decoded || data.raw || '') : (data.raw || data.decoded || '');
        } catch (e) {
            console.error(e);
        }
    }
    if (!content) {
        const contentEl = document.getElementById(`queue-content-${index}`) || document.getElementById(`queue-preview-${index}`);
        content = contentEl ? contentEl.textContent : '';
    }
    copyTextToClipboard(content, 'Queue message payload copied to clipboard!');
}

// --- 4. Table Entity Action Handlers ---
let activeTable = '';
let activeTableEntityPK = '';
let activeTableEntityRK = '';

function copyTableEntityJson(index) {
    const dataScript = document.getElementById(`table-entity-data-${index}`);
    if (!dataScript) return;
    try {
        const data = JSON.parse(dataScript.textContent);
        const formatted = JSON.stringify(data, null, 2);
        copyTextToClipboard(formatted, 'Entity JSON copied to clipboard!');
    } catch (e) {
        console.error('Error parsing table entity data:', e);
    }
}

function openEditTableEntityModal(tableName, pk, rk, index) {
    activeTable = tableName;
    activeTableEntityPK = pk;
    activeTableEntityRK = rk;

    const title = document.getElementById('editTableEntityTitle');
    const pkInput = document.getElementById('editTableEntityPK');
    const rkInput = document.getElementById('editTableEntityRK');
    const jsonEditor = document.getElementById('editTableEntityJson');
    const errDiv = document.getElementById('editTableEntityError');

    if (title) title.textContent = `Edit Entity: ${pk} / ${rk}`;
    if (pkInput) pkInput.value = pk;
    if (rkInput) rkInput.value = rk;
    if (errDiv) {
        errDiv.style.display = 'none';
        errDiv.textContent = '';
    }

    let entityData = null;
    const dataScript = document.getElementById(`table-entity-data-${index}`);
    if (dataScript) {
        try {
            entityData = JSON.parse(dataScript.textContent);
        } catch (e) {}
    }

    if (entityData) {
        // Filter out system properties
        const customProps = {};
        for (const [k, v] of Object.entries(entityData)) {
            if (!['PartitionKey', 'RowKey', 'Timestamp', 'etag', 'odata.etag'].includes(k)) {
                customProps[k] = v;
            }
        }
        if (jsonEditor) jsonEditor.value = JSON.stringify(customProps, null, 2);
        openModal('editTableEntityModal');
    } else {
        if (jsonEditor) jsonEditor.value = 'Fetching entity...';
        openModal('editTableEntityModal');
        fetch(`/storage-ui/tables/${encodeURIComponent(tableName)}/entity-content?pk=${encodeURIComponent(pk)}&rk=${encodeURIComponent(rk)}`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.entity) {
                const customProps = {};
                for (const [k, v] of Object.entries(data.entity)) {
                    if (!['PartitionKey', 'RowKey', 'Timestamp', 'etag', 'odata.etag'].includes(k)) {
                        customProps[k] = v;
                    }
                }
                if (jsonEditor) jsonEditor.value = JSON.stringify(customProps, null, 2);
            } else {
                if (errDiv) {
                    errDiv.textContent = data.error || 'Failed to fetch entity.';
                    errDiv.style.display = 'block';
                }
            }
        })
        .catch(err => {
            if (errDiv) {
                errDiv.textContent = 'Network error: ' + err.message;
                errDiv.style.display = 'block';
            }
        });
    }
}

function handleUpdateTableEntitySubmit(event) {
    if (event) event.preventDefault();
    const jsonEditor = document.getElementById('editTableEntityJson');
    const errDiv = document.getElementById('editTableEntityError');
    const btn = document.getElementById('btnConfirmUpdateEntity');
    const rawJson = jsonEditor ? jsonEditor.value.trim() : '{}';

    let parsed = {};
    try {
        parsed = rawJson ? JSON.parse(rawJson) : {};
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Entity properties must be a JSON object (key-value dictionary).');
        }
    } catch (e) {
        if (errDiv) {
            errDiv.textContent = 'Invalid JSON: ' + e.message;
            errDiv.style.display = 'block';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    fetch(`/storage-ui/tables/${encodeURIComponent(activeTable)}/update-entity`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            pk: activeTableEntityPK,
            rk: activeTableEntityRK,
            entity: parsed
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('editTableEntityModal');
            window.location.reload();
        } else {
            if (errDiv) {
                errDiv.textContent = data.error || 'Failed to update entity.';
                errDiv.style.display = 'block';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Save Changes</span>';
            }
        }
    })
    .catch(err => {
        if (errDiv) {
            errDiv.textContent = 'Network error: ' + err.message;
            errDiv.style.display = 'block';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Save Changes</span>';
        }
    });
}

function openCloneTableEntityModal(tableName, pk, rk) {
    activeTable = tableName;
    const srcPK = document.getElementById('cloneSourcePK');
    const srcRK = document.getElementById('cloneSourceRK');
    const newPK = document.getElementById('cloneNewPK');
    const newRK = document.getElementById('cloneNewRK');
    const errDiv = document.getElementById('cloneTableEntityError');

    if (srcPK) srcPK.value = pk;
    if (srcRK) srcRK.value = rk;
    if (newPK) newPK.value = pk;
    if (newRK) newRK.value = rk + '-copy';
    if (errDiv) {
        errDiv.style.display = 'none';
        errDiv.textContent = '';
    }
    openModal('cloneTableEntityModal');
    if (newRK) {
        setTimeout(() => {
            newRK.focus();
            newRK.select();
        }, 150);
    }
}

function handleCloneTableEntitySubmit(event) {
    if (event) event.preventDefault();
    const srcPK = document.getElementById('cloneSourcePK')?.value?.trim();
    const srcRK = document.getElementById('cloneSourceRK')?.value?.trim();
    const newPK = document.getElementById('cloneNewPK')?.value?.trim();
    const newRK = document.getElementById('cloneNewRK')?.value?.trim();
    const btn = document.getElementById('btnConfirmCloneEntity');
    const errDiv = document.getElementById('cloneTableEntityError');

    if (!srcPK || !srcRK || !newPK || !newRK) {
        if (errDiv) {
            errDiv.textContent = 'All PartitionKey and RowKey fields are required.';
            errDiv.style.display = 'block';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cloning...';
    }

    fetch(`/storage-ui/tables/${encodeURIComponent(activeTable)}/clone-entity`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            source_pk: srcPK,
            source_rk: srcRK,
            new_pk: newPK,
            new_rk: newRK
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('cloneTableEntityModal');
            window.location.reload();
        } else {
            if (errDiv) {
                errDiv.textContent = data.error || 'Failed to clone entity.';
                errDiv.style.display = 'block';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-clone"></i> <span>Clone Entity</span>';
            }
        }
    })
    .catch(err => {
        if (errDiv) {
            errDiv.textContent = 'Network error: ' + err.message;
            errDiv.style.display = 'block';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-clone"></i> <span>Clone Entity</span>';
        }
    });
}

function openCopyTableEntityModal(tableName, pk, rk) {
    activeTable = tableName;
    const pkInput = document.getElementById('copyEntityPK');
    const rkInput = document.getElementById('copyEntityRK');
    const destSelect = document.getElementById('copyEntityDestTable');
    const errDiv = document.getElementById('copyTableEntityError');

    if (pkInput) pkInput.value = pk;
    if (rkInput) rkInput.value = rk;
    if (destSelect) destSelect.value = tableName;
    if (errDiv) {
        errDiv.style.display = 'none';
        errDiv.textContent = '';
    }
    openModal('copyTableEntityModal');
}

function handleCopyTableEntitySubmit(event) {
    if (event) event.preventDefault();
    const pk = document.getElementById('copyEntityPK')?.value?.trim();
    const rk = document.getElementById('copyEntityRK')?.value?.trim();
    const destTable = document.getElementById('copyEntityDestTable')?.value;
    const modeRadio = document.querySelector('input[name="table_op_mode"]:checked');
    const opMode = modeRadio ? modeRadio.value : 'copy';
    const btn = document.getElementById('btnConfirmCopyEntity');
    const errDiv = document.getElementById('copyTableEntityError');

    if (!pk || !rk || !destTable) {
        if (errDiv) {
            errDiv.textContent = 'PartitionKey, RowKey and destination table are required.';
            errDiv.style.display = 'block';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${opMode === 'move' ? 'Moving...' : 'Copying...'}`;
    }

    fetch(`/storage-ui/tables/${encodeURIComponent(activeTable)}/copy-entity`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            pk: pk,
            rk: rk,
            dest_table: destTable,
            action_type: opMode
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closeModal('copyTableEntityModal');
            window.location.reload();
        } else {
            if (errDiv) {
                errDiv.textContent = data.error || 'Operation failed.';
                errDiv.style.display = 'block';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Apply</span>';
            }
        }
    })
    .catch(err => {
        if (errDiv) {
            errDiv.textContent = 'Network error: ' + err.message;
            errDiv.style.display = 'block';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Apply</span>';
        }
    });
}

function openDeleteTableEntityModal(tableName, pk, rk) {
    const pkSpan = document.getElementById('deleteEntityPK');
    const rkSpan = document.getElementById('deleteEntityRK');
    const formPK = document.getElementById('deleteEntityFormPK');
    const formRK = document.getElementById('deleteEntityFormRK');

    if (pkSpan) pkSpan.textContent = pk;
    if (rkSpan) rkSpan.textContent = rk;
    if (formPK) formPK.value = pk;
    if (formRK) formRK.value = rk;
    openModal('deleteTableEntityModal');
}

// --- Table Column Sorting ---
function sortTable(th) {
    if (!th) return;
    const table = th.closest('table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // Get column index
    const thRow = th.parentElement;
    const thList = Array.from(thRow.children);
    const colIndex = thList.indexOf(th);
    if (colIndex === -1) return;

    const sortType = th.getAttribute('data-sort-type') || 'text';
    const isAsc = th.classList.contains('sorted-asc');
    const newOrder = isAsc ? 'desc' : 'asc';

    // Reset all headers in this table
    thList.forEach(otherTh => {
        if (otherTh.classList.contains('sortable-th')) {
            otherTh.classList.remove('sorted-asc', 'sorted-desc');
            otherTh.setAttribute('aria-sort', 'none');
            const icon = otherTh.querySelector('.sort-icon');
            if (icon) {
                icon.className = 'fa-solid fa-sort sort-icon';
            }
        }
    });

    // Apply active class & icon
    th.classList.add(newOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');
    th.setAttribute('aria-sort', newOrder === 'asc' ? 'ascending' : 'descending');
    const icon = th.querySelector('.sort-icon');
    if (icon) {
        icon.className = newOrder === 'asc' ? 'fa-solid fa-arrow-up sort-icon' : 'fa-solid fa-arrow-down sort-icon';
    }

    // Get rows to sort (skip empty-state / no-result rows)
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    const rowsToSort = [];
    const specialRows = [];

    allRows.forEach(row => {
        const firstTd = row.querySelector('td');
        if (row.id.startsWith('no') || (firstTd && firstTd.colSpan > 1)) {
            specialRows.push(row);
        } else {
            rowsToSort.push(row);
        }
    });

    if (rowsToSort.length <= 1) return;

    // Sort rows
    rowsToSort.sort((rowA, rowB) => {
        const cellA = rowA.children[colIndex];
        const cellB = rowB.children[colIndex];
        if (!cellA || !cellB) return 0;

        let valA = cellA.getAttribute('data-sort-val');
        if (valA === null) valA = cellA.innerText.trim();

        let valB = cellB.getAttribute('data-sort-val');
        if (valB === null) valB = cellB.innerText.trim();

        let cmp = 0;
        if (sortType === 'number') {
            const numA = parseFloat(valA) || 0;
            const numB = parseFloat(valB) || 0;
            cmp = numA - numB;
        } else if (sortType === 'date') {
            const dateA = Date.parse(valA) || 0;
            const dateB = Date.parse(valB) || 0;
            cmp = dateA - dateB;
        } else {
            cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
        }

        return newOrder === 'asc' ? cmp : -cmp;
    });

    // Re-append sorted rows and special rows
    const fragment = document.createDocumentFragment();
    rowsToSort.forEach(row => fragment.appendChild(row));
    specialRows.forEach(row => fragment.appendChild(row));
    tbody.appendChild(fragment);
}

function navigateToBlobSort(sortField) {
    const url = new URL(window.location.href);
    const currentSort = url.searchParams.get('sort') || 'name';
    const currentOrder = url.searchParams.get('order') || 'asc';

    let newOrder = 'asc';
    if (currentSort === sortField) {
        newOrder = (currentOrder === 'asc') ? 'desc' : 'asc';
    }

    url.searchParams.set('sort', sortField);
    url.searchParams.set('order', newOrder);
    url.searchParams.set('page', '1');
    window.location.href = url.toString();
}



