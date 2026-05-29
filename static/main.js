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
