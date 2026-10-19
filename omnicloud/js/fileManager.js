/* ==========================================================================
   OmniCloud - Windows 11 Style File Manager Engine
   Supports: Multi-Selection, Folder Navigation, Cut/Copy/Paste,
   Inline Rename, Delete, Sortable Details View, Left Tree Navigation,
   Keyboard Shortcuts (F2, Del, Ctrl+A/C/X/V, Alt+Enter), Properties Dialog.
   ========================================================================== */

class FileManager {
  constructor() {
    this.currentViewMode = 'grid'; // 'grid' | 'details' | 'tiles'
    this.currentProviderFilter = 'all';
    this.currentTypeFilter = 'all';
    this.currentSearchQuery = '';
    this.currentPath = '/';
    this.selectedFileIds = new Set();
    this.clipboard = null; // { action: 'cut' | 'copy', fileIds: [] }
    this.pathHistory = ['/'];
    this.historyIndex = 0;
    this.sortField = 'name'; // 'name' | 'date' | 'type' | 'size'
    this.sortOrder = 'asc'; // 'asc' | 'desc'
    this.activeContextMenuFile = null;
  }

  init() {
    this.bindEvents();
    this.bindKeyboardShortcuts();
    this.render();
  }

  /* ── Event Bindings ───────────────────────────────────── */

  bindEvents() {
    // View Switcher (Grid / Details / Tiles)
    document.querySelectorAll('.win-view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.win-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentViewMode = btn.dataset.view;
        this.render();
      });
    });

    // Navigation Buttons (Back, Forward, Up, Refresh)
    document.getElementById('win-btn-back')?.addEventListener('click', () => this.navigateBack());
    document.getElementById('win-btn-forward')?.addEventListener('click', () => this.navigateForward());
    document.getElementById('win-btn-up')?.addEventListener('click', () => this.navigateUp());
    document.getElementById('win-btn-refresh')?.addEventListener('click', () => {
      this.render();
      if (typeof app !== 'undefined') app.showToast('Explorer refreshed');
    });

    // Copy Path Button
    document.getElementById('win-btn-copy-path')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(this.currentPath);
      if (typeof app !== 'undefined') app.showToast(`Copied path: ${this.currentPath}`);
    });

    // Search Input
    const searchInput = document.getElementById('win-search-input');
    const searchClear = document.getElementById('win-search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.currentSearchQuery = e.target.value.toLowerCase().trim();
        if (searchClear) searchClear.style.display = this.currentSearchQuery ? 'block' : 'none';
        this.render();
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        this.currentSearchQuery = '';
        searchClear.style.display = 'none';
        this.render();
      });
    }

    // Sort Dropdown
    const sortBtn = document.getElementById('win-sort-dropdown-btn');
    const sortMenu = document.getElementById('win-sort-menu');
    if (sortBtn && sortMenu) {
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sortMenu.classList.toggle('show');
      });

      sortMenu.querySelectorAll('.win-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.dataset.sort) {
            this.sortField = item.dataset.sort;
            sortMenu.querySelectorAll('[data-sort]').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const label = document.getElementById('win-sort-label');
            if (label) label.textContent = `Sort: ${item.textContent}`;
          }
          if (item.dataset.order) {
            this.sortOrder = item.dataset.order;
            sortMenu.querySelectorAll('[data-order]').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
          }
          sortMenu.classList.remove('show');
          this.render();
        });
      });
    }

    // Global click closes dropdowns & context menus
    document.addEventListener('click', () => {
      sortMenu?.classList.remove('show');
      document.getElementById('file-context-menu')?.classList.remove('show');
    });

    // Left Navigation Tree Click Handler
    const navTree = document.getElementById('win-nav-tree-pane');
    if (navTree) {
      navTree.addEventListener('click', (e) => {
        const node = e.target.closest('.win-tree-node');
        if (!node) return;

        navTree.querySelectorAll('.win-tree-node').forEach(n => n.classList.remove('active'));
        node.classList.add('active');

        this.currentProviderFilter = node.dataset.provider || 'all';
        this.currentTypeFilter = node.dataset.type || 'all';
        this.currentPath = node.dataset.path || '/';
        this.pushHistory(this.currentPath);

        this.selectedFileIds.clear();
        this.updateActionRibbonState();
        this.render();
      });
    }

    // Action Ribbon Buttons
    document.getElementById('win-btn-new-folder')?.addEventListener('click', () => this.openNewFolderModal());
    document.getElementById('win-btn-cut')?.addEventListener('click', () => this.cutSelected());
    document.getElementById('win-btn-copy')?.addEventListener('click', () => this.copySelected());
    document.getElementById('win-btn-paste')?.addEventListener('click', () => this.pasteClipboard());
    document.getElementById('win-btn-rename')?.addEventListener('click', () => this.renameSelectedPrompt());
    document.getElementById('win-btn-delete')?.addEventListener('click', () => this.deleteSelected());
    document.getElementById('win-btn-star')?.addEventListener('click', () => this.toggleStarSelected());
    document.getElementById('win-btn-download')?.addEventListener('click', () => this.downloadSelected());
    document.getElementById('win-btn-properties')?.addEventListener('click', () => this.openPropertiesModal());

    // New Folder Dialog Submit
    document.getElementById('win-create-folder-submit-btn')?.addEventListener('click', () => {
      const input = document.getElementById('win-new-folder-name');
      const folderName = input ? input.value.trim() : 'New folder';
      if (folderName) {
        const providerId = this.currentProviderFilter !== 'all' ? this.currentProviderFilter : 'local_disk';
        storageEngine.createFolder(folderName, this.currentPath, providerId);
        document.getElementById('win-new-folder-modal')?.classList.remove('active');
        if (typeof app !== 'undefined') app.showToast(`📁 Created folder: ${folderName}`);
        this.render();
      }
    });

    // Properties Modal Tabs & Save
    document.querySelectorAll('.win-prop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.win-prop-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.win-prop-tab-content').forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
        tab.classList.add('active');
        const content = document.getElementById(`prop-tab-${tab.dataset.tab}`);
        if (content) { content.classList.add('active'); content.style.display = 'block'; }
      });
    });

    document.getElementById('prop-save-btn')?.addEventListener('click', () => {
      if (this.activeContextMenuFile) {
        const newName = document.getElementById('prop-input-name')?.value.trim();
        if (newName && newName !== this.activeContextMenuFile.name) {
          storageEngine.renameFile(this.activeContextMenuFile.id, newName);
          if (typeof app !== 'undefined') app.showToast(`Renamed to: ${newName}`);
          this.render();
        }
      }
      document.getElementById('win-properties-modal')?.classList.remove('active');
    });

    // File Upload Handler
    const fileUploadInput = document.getElementById('real-file-input');
    if (fileUploadInput) {
      fileUploadInput.addEventListener('change', (e) => this.handleFileUpload(e.target.files));
    }

    // Drag and Drop Upload & Move
    const dropZone = document.getElementById('upload-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files?.length) {
          this.handleFileUpload(e.dataTransfer.files);
        }
      });
    }
  }

  /* ── Keyboard Shortcuts (Windows Explorer standard) ──── */

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }

      // Check if Explorer is visible
      const explorerPanel = document.getElementById('panel-explorer');
      if (!explorerPanel || !explorerPanel.classList.contains('active')) return;

      // F2: Rename selected
      if (e.key === 'F2') {
        e.preventDefault();
        this.renameSelectedPrompt();
      }
      // Delete: Delete selected
      else if (e.key === 'Delete' || (e.key === 'Backspace' && !e.altKey)) {
        e.preventDefault();
        this.deleteSelected();
      }
      // Ctrl+A: Select All
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.selectAll();
      }
      // Ctrl+C: Copy
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        this.copySelected();
      }
      // Ctrl+X: Cut
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        this.cutSelected();
      }
      // Ctrl+V: Paste
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        this.pasteClipboard();
      }
      // Alt+Enter: Properties
      else if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        this.openPropertiesModal();
      }
      // Alt+Left: Back
      else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigateBack();
      }
      // Alt+Right: Forward
      else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigateForward();
      }
      // Alt+Up: Up folder
      else if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        this.navigateUp();
      }
      // Enter: Open / Preview selected
      else if (e.key === 'Enter' && this.selectedFileIds.size === 1) {
        e.preventDefault();
        const fileId = Array.from(this.selectedFileIds)[0];
        const file = storageEngine.getFiles().find(f => f.id === fileId);
        if (file) {
          if (file.type === 'folder') this.navigateToFolder(file);
          else this.openPreviewModal(file);
        }
      }
    });
  }

  /* ── Navigation & Path Management ────────────────────── */

  pushHistory(path) {
    if (this.pathHistory[this.historyIndex] !== path) {
      this.pathHistory = this.pathHistory.slice(0, this.historyIndex + 1);
      this.pathHistory.push(path);
      this.historyIndex = this.pathHistory.length - 1;
    }
    this.updateNavButtons();
  }

  navigateBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.currentPath = this.pathHistory[this.historyIndex];
      this.updateNavButtons();
      this.render();
    }
  }

  navigateForward() {
    if (this.historyIndex < this.pathHistory.length - 1) {
      this.historyIndex++;
      this.currentPath = this.pathHistory[this.historyIndex];
      this.updateNavButtons();
      this.render();
    }
  }

  navigateUp() {
    if (this.currentPath !== '/') {
      const parts = this.currentPath.split('/').filter(Boolean);
      parts.pop();
      this.currentPath = parts.length ? '/' + parts.join('/') + '/' : '/';
      this.pushHistory(this.currentPath);
      this.render();
    }
  }

  navigateToFolder(folderFile) {
    let parentPath = folderFile.path || '/';
    if (!parentPath.endsWith('/')) parentPath += '/';
    const nextPath = `${parentPath === '/' ? '/' : parentPath}${folderFile.name}/`;
    this.currentPath = nextPath;
    this.pushHistory(nextPath);
    this.selectedFileIds.clear();
    this.render();
  }

  updateNavButtons() {
    const btnBack = document.getElementById('win-btn-back');
    const btnForward = document.getElementById('win-btn-forward');
    const btnUp = document.getElementById('win-btn-up');

    if (btnBack) btnBack.disabled = this.historyIndex <= 0;
    if (btnForward) btnForward.disabled = this.historyIndex >= this.pathHistory.length - 1;
    if (btnUp) btnUp.disabled = this.currentPath === '/';
  }

  updateBreadcrumbs() {
    const container = document.getElementById('win-breadcrumbs');
    if (!container) return;

    const parts = this.currentPath.split('/').filter(Boolean);
    let html = `<span class="win-breadcrumb-item ${this.currentPath === '/' ? 'active' : ''}" onclick="fileManager.goToBreadcrumb('/')"><i class="ph ph-desktop"></i> This PC</span>`;

    let accumulatedPath = '/';
    parts.forEach((part, index) => {
      accumulatedPath += part + '/';
      const isLast = index === parts.length - 1;
      html += `<span class="win-breadcrumb-sep">›</span>
               <span class="win-breadcrumb-item ${isLast ? 'active' : ''}" onclick="fileManager.goToBreadcrumb('${accumulatedPath}')">${part}</span>`;
    });

    container.innerHTML = html;
  }

  goToBreadcrumb(path) {
    this.currentPath = path;
    this.pushHistory(path);
    this.selectedFileIds.clear();
    this.render();
  }

  /* ── File Filtering & Sorting ────────────────────────── */

  getFilteredAndSortedFiles() {
    let files = storageEngine.getFiles();

    // 1. Provider Filter
    if (this.currentProviderFilter !== 'all') {
      files = files.filter(f => f.providerId === this.currentProviderFilter);
    }

    // 2. Type Filter
    if (this.currentTypeFilter !== 'all') {
      if (this.currentTypeFilter === 'starred') {
        files = files.filter(f => f.starred);
      } else if (this.currentTypeFilter === 'encrypted') {
        files = files.filter(f => f.encrypted);
      } else {
        files = files.filter(f => f.type === this.currentTypeFilter);
      }
    }

    // 3. Search Filter
    if (this.currentSearchQuery) {
      files = files.filter(f =>
        f.name.toLowerCase().includes(this.currentSearchQuery) ||
        (f.tags && f.tags.some(t => t.toLowerCase().includes(this.currentSearchQuery)))
      );
    }

    // 4. Folder Path Filter (if not searching globally and in root or subfolder)
    if (!this.currentSearchQuery && this.currentTypeFilter === 'all') {
      const cur = this.currentPath.endsWith('/') ? this.currentPath : (this.currentPath + '/');
      files = files.filter(f => {
        const p = (f.path || '/').endsWith('/') ? (f.path || '/') : ((f.path || '/') + '/');
        return p === cur;
      });
    }

    // 5. Sort: Folders always on top (Windows style), then sort by selected field
    files.sort((a, b) => {
      const aIsFolder = a.type === 'folder' ? 1 : 0;
      const bIsFolder = b.type === 'folder' ? 1 : 0;
      if (aIsFolder !== bIsFolder) return bIsFolder - aIsFolder;

      let valA, valB;
      if (this.sortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (this.sortField === 'date') {
        valA = new Date(a.lastModified || 0).getTime();
        valB = new Date(b.lastModified || 0).getTime();
      } else if (this.sortField === 'size') {
        valA = a.sizeBytes || 0;
        valB = b.sizeBytes || 0;
      } else {
        valA = a.type || '';
        valB = b.type || '';
      }

      if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return files;
  }

  /* ── Selection & Action States ────────────────────────── */

  selectFile(fileId, isMulti = false, isRange = false) {
    if (isMulti) {
      if (this.selectedFileIds.has(fileId)) this.selectedFileIds.delete(fileId);
      else this.selectedFileIds.add(fileId);
    } else {
      this.selectedFileIds.clear();
      this.selectedFileIds.add(fileId);
    }

    const files = storageEngine.getFiles();
    this.activeContextMenuFile = files.find(f => f.id === fileId) || null;

    this.updateActionRibbonState();
    this.updateStatusBar();
    this.highlightSelectedElements();
  }

  selectAll() {
    const files = this.getFilteredAndSortedFiles();
    this.selectedFileIds.clear();
    files.forEach(f => this.selectedFileIds.add(f.id));
    this.updateActionRibbonState();
    this.updateStatusBar();
    this.highlightSelectedElements();
  }

  clearSelection() {
    this.selectedFileIds.clear();
    this.activeContextMenuFile = null;
    this.updateActionRibbonState();
    this.updateStatusBar();
    this.highlightSelectedElements();
  }

  highlightSelectedElements() {
    document.querySelectorAll('.win-file-item, .win-files-table tr, .win-tile-item').forEach(el => {
      const id = el.dataset.fileId;
      if (this.selectedFileIds.has(id)) el.classList.add('selected');
      else el.classList.remove('selected');
    });
  }

  updateActionRibbonState() {
    const count = this.selectedFileIds.size;
    const hasSelection = count > 0;
    const singleSelection = count === 1;

    const btnCut = document.getElementById('win-btn-cut');
    const btnCopy = document.getElementById('win-btn-copy');
    const btnPaste = document.getElementById('win-btn-paste');
    const btnRename = document.getElementById('win-btn-rename');
    const btnDelete = document.getElementById('win-btn-delete');
    const btnStar = document.getElementById('win-btn-star');
    const btnDownload = document.getElementById('win-btn-download');
    const btnProp = document.getElementById('win-btn-properties');

    if (btnCut) btnCut.disabled = !hasSelection;
    if (btnCopy) btnCopy.disabled = !hasSelection;
    if (btnPaste) btnPaste.disabled = !this.clipboard;
    if (btnRename) btnRename.disabled = !singleSelection;
    if (btnDelete) btnDelete.disabled = !hasSelection;
    if (btnStar) btnStar.disabled = !hasSelection;
    if (btnDownload) btnDownload.disabled = !hasSelection;
    if (btnProp) btnProp.disabled = !singleSelection;
  }

  updateStatusBar() {
    const files = this.getFilteredAndSortedFiles();
    const countEl = document.getElementById('win-status-item-count');
    const selectedEl = document.getElementById('win-status-selected-count');
    const storageEl = document.getElementById('win-status-storage-info');

    if (countEl) countEl.innerHTML = `<i class="ph ph-files"></i> ${files.length} item${files.length === 1 ? '' : 's'}`;

    if (selectedEl) {
      if (this.selectedFileIds.size > 0) {
        let totalBytes = 0;
        files.filter(f => this.selectedFileIds.has(f.id)).forEach(f => totalBytes += (f.sizeBytes || 0));
        selectedEl.style.display = 'inline-flex';
        selectedEl.innerHTML = `<i class="ph ph-check-square"></i> ${this.selectedFileIds.size} selected (${this.formatBytes(totalBytes)})`;
      } else {
        selectedEl.style.display = 'none';
      }
    }

    if (storageEl) {
      const providers = storageEngine.getProviders();
      let totalGB = 0, usedGB = 0;
      providers.forEach(p => { totalGB += p.totalStorageGB || 0; usedGB += p.usedStorageGB || 0; });
      storageEl.innerHTML = `<i class="ph ph-hard-drive"></i> ${usedGB.toFixed(2)} GB used / ${totalGB.toFixed(1)} GB total`;
    }
  }

  /* ── File Operations (Cut / Copy / Paste / Rename / Delete) ── */

  cutSelected() {
    if (this.selectedFileIds.size === 0) return;
    this.clipboard = { action: 'cut', fileIds: Array.from(this.selectedFileIds) };
    this.updateActionRibbonState();
    if (typeof app !== 'undefined') app.showToast(`✂ Cut ${this.selectedFileIds.size} item(s)`);
  }

  copySelected() {
    if (this.selectedFileIds.size === 0) return;
    this.clipboard = { action: 'copy', fileIds: Array.from(this.selectedFileIds) };
    this.updateActionRibbonState();
    if (typeof app !== 'undefined') app.showToast(`📋 Copied ${this.selectedFileIds.size} item(s)`);
  }

  pasteClipboard() {
    if (!this.clipboard || !this.clipboard.fileIds?.length) return;

    if (this.clipboard.action === 'cut') {
      storageEngine.moveFiles(this.clipboard.fileIds, this.currentPath);
      if (typeof app !== 'undefined') app.showToast(`📥 Moved ${this.clipboard.fileIds.length} item(s) to ${this.currentPath}`);
      this.clipboard = null;
    } else {
      const files = storageEngine.getFiles();
      this.clipboard.fileIds.forEach(id => {
        const original = files.find(f => f.id === id);
        if (original) {
          const clone = {
            ...original,
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: `Copy of ${original.name}`,
            path: this.currentPath,
            lastModified: new Date().toISOString()
          };
          storageEngine.addFile(clone);
        }
      });
      if (typeof app !== 'undefined') app.showToast(`📥 Pasted ${this.clipboard.fileIds.length} item(s)`);
    }

    this.render();
    this.updateActionRibbonState();
  }

  renameSelectedPrompt() {
    if (this.selectedFileIds.size !== 1) return;
    const fileId = Array.from(this.selectedFileIds)[0];
    const file = storageEngine.getFiles().find(f => f.id === fileId);
    if (!file) return;

    const newName = prompt('Enter new name:', file.name);
    if (newName && newName.trim() && newName !== file.name) {
      storageEngine.renameFile(fileId, newName.trim());
      if (typeof app !== 'undefined') app.showToast(`Renamed to: ${newName.trim()}`);
      this.render();
    }
  }

  deleteSelected() {
    if (this.selectedFileIds.size === 0) return;
    const count = this.selectedFileIds.size;
    if (confirm(`Are you sure you want to delete ${count} selected item${count === 1 ? '' : 's'}?`)) {
      this.selectedFileIds.forEach(id => storageEngine.deleteFile(id));
      this.selectedFileIds.clear();
      this.updateActionRibbonState();
      this.render();
      if (typeof app !== 'undefined') {
        app.updateHeaderStorageStats();
        app.showToast(`🗑 Deleted ${count} item(s)`);
      }
    }
  }

  toggleStarSelected() {
    this.selectedFileIds.forEach(id => storageEngine.toggleStarFile(id));
    this.render();
  }

  downloadSelected() {
    this.selectedFileIds.forEach(id => {
      if (typeof app !== 'undefined') app.downloadFile(id);
    });
  }

  openNewFolderModal() {
    const input = document.getElementById('win-new-folder-name');
    if (input) input.value = 'New folder';
    document.getElementById('win-new-folder-modal')?.classList.add('active');
    setTimeout(() => input?.focus(), 150);
  }

  openPropertiesModal(file = null) {
    const targetFile = file || this.activeContextMenuFile || (this.selectedFileIds.size ? storageEngine.getFiles().find(f => f.id === Array.from(this.selectedFileIds)[0]) : null);
    if (!targetFile) return;

    this.activeContextMenuFile = targetFile;

    document.getElementById('prop-title-name') && (document.getElementById('prop-title-name').textContent = `${targetFile.name} Properties`);
    document.getElementById('prop-input-name') && (document.getElementById('prop-input-name').value = targetFile.name);
    document.getElementById('prop-file-type') && (document.getElementById('prop-file-type').textContent = targetFile.type === 'folder' ? 'File Folder' : `${targetFile.type.toUpperCase()} File (${targetFile.name.split('.').pop() || ''})`);
    document.getElementById('prop-file-location') && (document.getElementById('prop-file-location').textContent = targetFile.path || '/');
    document.getElementById('prop-file-size') && (document.getElementById('prop-file-size').textContent = `${this.formatBytes(targetFile.sizeBytes)} (${(targetFile.sizeBytes || 0).toLocaleString()} bytes)`);
    document.getElementById('prop-file-provider') && (document.getElementById('prop-file-provider').textContent = this.getProviderLabel(targetFile.providerId));
    document.getElementById('prop-cloud-provider') && (document.getElementById('prop-cloud-provider').textContent = this.getProviderLabel(targetFile.providerId));
    document.getElementById('prop-file-created') && (document.getElementById('prop-file-created').textContent = new Date(targetFile.lastModified || Date.now()).toLocaleString());
    document.getElementById('prop-file-modified') && (document.getElementById('prop-file-modified').textContent = new Date(targetFile.lastModified || Date.now()).toLocaleString());
    document.getElementById('prop-cloud-starred') && (document.getElementById('prop-cloud-starred').textContent = targetFile.starred ? 'Yes ⭐' : 'No');
    document.getElementById('prop-detail-id') && (document.getElementById('prop-detail-id').textContent = targetFile.id);
    document.getElementById('prop-detail-mime') && (document.getElementById('prop-detail-mime').textContent = targetFile.mimeType || 'application/octet-stream');

    const bigIcon = document.getElementById('prop-big-icon');
    if (bigIcon) bigIcon.innerHTML = targetFile.type === 'folder' ? '📁' : this.getFileEmoji(targetFile.type);

    document.getElementById('win-properties-modal')?.classList.add('active');
  }

  /* ── Render Explorer Views ────────────────────────────── */

  render() {
    this.updateBreadcrumbs();
    this.updateNavButtons();
    this.updateStatusBar();
    this.renderLeftTreeCounts();

    const container = document.getElementById('files-container');
    if (!container) return;

    const files = this.getFilteredAndSortedFiles();
    const providers = storageEngine.getProviders();

    if (files.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3.5rem 1.5rem; color: var(--text-dim);">
          <i class="ph ph-folder-open" style="font-size: 3rem; color: var(--accent-cyan); opacity: 0.6; margin-bottom: 0.75rem;"></i>
          <h3 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.35rem;">This folder is empty</h3>
          <p style="font-size: 0.82rem;">Drag and drop files here, create a new folder, or upload files.</p>
        </div>
      `;
      return;
    }

    if (this.currentViewMode === 'grid') {
      container.className = 'win-files-container win-files-grid';
      container.innerHTML = files.map(f => this.renderGridItem(f, providers)).join('');
    } else if (this.currentViewMode === 'details') {
      container.className = 'win-files-container';
      container.innerHTML = `
        <table class="win-files-table">
          <thead>
            <tr>
              <th onclick="fileManager.setSort('name')" style="width: 45%;">Name <i class="ph ph-caret-up-down"></i></th>
              <th onclick="fileManager.setSort('date')">Date modified <i class="ph ph-caret-up-down"></i></th>
              <th onclick="fileManager.setSort('type')">Type <i class="ph ph-caret-up-down"></i></th>
              <th onclick="fileManager.setSort('size')">Size <i class="ph ph-caret-up-down"></i></th>
              <th>Cloud Drive</th>
            </tr>
          </thead>
          <tbody>
            ${files.map(f => this.renderDetailsRow(f, providers)).join('')}
          </tbody>
        </table>
      `;
    } else {
      // Tiles View
      container.className = 'win-files-container win-files-tiles';
      container.innerHTML = files.map(f => this.renderTileItem(f, providers)).join('');
    }

    this.attachItemEventListeners();
    this.highlightSelectedElements();
  }

  setSort(field) {
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortOrder = 'asc';
    }
    this.render();
  }

  renderGridItem(file, providers) {
    const isFolder = file.type === 'folder';
    const isSelected = this.selectedFileIds.has(file.id);
    const provider = providers.find(p => p.id === file.providerId);
    const providerIcon = this.getProviderIcon(file.providerId);
    const iconColor = this.getTypeColor(file.type);

    let previewContent = '';
    if (isFolder) {
      previewContent = `<i class="ph ph-folder-fill" style="color: #f59e0b; font-size: 3.2rem;"></i>`;
    } else if (file.previewUrl) {
      previewContent = `<img src="${file.previewUrl}" alt="${file.name}" loading="lazy" />`;
    } else {
      previewContent = `<i class="${this.getTypeIcon(file.type)}" style="color: ${iconColor}; font-size: 2.8rem;"></i>`;
    }

    return `
      <div class="win-file-item ${isSelected ? 'selected' : ''}" data-file-id="${file.id}" draggable="true">
        <div class="win-file-checkbox"><i class="ph ph-check"></i></div>
        <div class="win-file-thumb">
          ${previewContent}
          <div class="win-file-provider-badge" title="${provider ? provider.name : 'Cloud'}">${providerIcon}</div>
        </div>
        <div class="win-file-meta">
          <div class="win-file-name" title="${file.name}">${file.name}</div>
          <div class="win-file-subtext">
            <span>${isFolder ? 'Folder' : this.formatBytes(file.sizeBytes)}</span>
            <span>${file.starred ? '⭐' : ''}</span>
          </div>
        </div>
      </div>
    `;
  }

  renderDetailsRow(file, providers) {
    const isFolder = file.type === 'folder';
    const isSelected = this.selectedFileIds.has(file.id);
    const provider = providers.find(p => p.id === file.providerId);
    const typeIcon = isFolder ? '<i class="ph ph-folder-fill" style="color: #f59e0b; font-size: 1.1rem;"></i>' : `<i class="${this.getTypeIcon(file.type)}" style="color: ${this.getTypeColor(file.type)};"></i>`;

    return `
      <tr class="${isSelected ? 'selected' : ''}" data-file-id="${file.id}" draggable="true">
        <td style="display: flex; align-items: center; gap: 0.5rem;">
          ${typeIcon}
          <span style="font-weight: 500; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
        </td>
        <td>${new Date(file.lastModified || Date.now()).toLocaleDateString()}</td>
        <td style="text-transform: capitalize;">${isFolder ? 'File Folder' : file.type}</td>
        <td>${isFolder ? '-' : this.formatBytes(file.sizeBytes)}</td>
        <td><span class="provider-pill" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; background: var(--bg-tertiary);">${provider ? provider.name : 'Local Storage'}</span></td>
      </tr>
    `;
  }

  renderTileItem(file, providers) {
    const isFolder = file.type === 'folder';
    const isSelected = this.selectedFileIds.has(file.id);
    const provider = providers.find(p => p.id === file.providerId);
    const typeIcon = isFolder ? '<i class="ph ph-folder-fill win-tile-icon" style="color: #f59e0b;"></i>' : `<i class="${this.getTypeIcon(file.type)} win-tile-icon" style="color: ${this.getTypeColor(file.type)};"></i>`;

    return `
      <div class="win-tile-item ${isSelected ? 'selected' : ''}" data-file-id="${file.id}" draggable="true">
        ${typeIcon}
        <div style="flex: 1; overflow: hidden;">
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${file.name}</div>
          <div style="font-size: 0.72rem; color: var(--text-dim); display: flex; gap: 0.5rem; margin-top: 2px;">
            <span>${isFolder ? 'Folder' : this.formatBytes(file.sizeBytes)}</span>
            <span>•</span>
            <span>${provider ? provider.name : 'Cloud'}</span>
          </div>
        </div>
      </div>
    `;
  }

  attachItemEventListeners() {
    const items = document.querySelectorAll('.win-file-item, .win-files-table tbody tr, .win-tile-item');
    items.forEach(el => {
      const fileId = el.dataset.fileId;
      const file = storageEngine.getFiles().find(f => f.id === fileId);
      if (!file) return;

      // Click: Single / Multi-select
      el.addEventListener('click', (e) => {
        const isMulti = e.ctrlKey || e.metaKey || e.target.closest('.win-file-checkbox');
        const isRange = e.shiftKey;
        this.selectFile(fileId, isMulti, isRange);
      });

      // Double Click: Open Folder or Preview
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (file.type === 'folder') {
          this.navigateToFolder(file);
        } else {
          this.openPreviewModal(file);
        }
      });

      // Right Click: Windows Context Menu
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectFile(fileId, false);
        this.openContextMenu(e, file);
      });

      // Drag and Drop (Reordering / Moving into folders)
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', fileId);
        e.dataTransfer.effectAllowed = 'move';
      });

      if (file.type === 'folder') {
        el.addEventListener('dragover', (e) => {
          e.preventDefault();
          el.style.outline = '2px dashed var(--accent-cyan)';
        });
        el.addEventListener('dragleave', () => { el.style.outline = ''; });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.style.outline = '';
          const draggedId = e.dataTransfer.getData('text/plain');
          if (draggedId && draggedId !== fileId) {
            const targetPath = `${this.currentPath === '/' ? '' : this.currentPath}${file.name}/`;
            storageEngine.moveFiles([draggedId], targetPath);
            if (typeof app !== 'undefined') app.showToast(`Moved to ${file.name}`);
            this.render();
          }
        });
      }
    });
  }

  /* ── Left Sidebar Tree Updates ────────────────────────── */

  renderLeftTreeCounts() {
    const allFiles = storageEngine.getFiles();
    const countAll = document.getElementById('tree-count-all');
    const countDoc = document.getElementById('tree-count-doc');
    const countImg = document.getElementById('tree-count-img');
    const countVid = document.getElementById('tree-count-vid');
    const countStar = document.getElementById('tree-count-star');

    if (countAll) countAll.textContent = allFiles.length;
    if (countDoc) countDoc.textContent = allFiles.filter(f => f.type === 'document').length;
    if (countImg) countImg.textContent = allFiles.filter(f => f.type === 'image').length;
    if (countVid) countVid.textContent = allFiles.filter(f => f.type === 'video').length;
    if (countStar) countStar.textContent = allFiles.filter(f => f.starred).length;

    // Render Connected Cloud Drives list in Tree
    const drivesList = document.getElementById('win-tree-drives-list');
    if (drivesList) {
      const providers = storageEngine.getProviders();
      if (providers.length === 0) {
        drivesList.innerHTML = `<div style="padding: 0.4rem 0.65rem; font-size: 0.75rem; color: var(--text-dim);">No drives connected</div>`;
      } else {
        drivesList.innerHTML = providers.map(p => {
          const providerFiles = allFiles.filter(f => f.providerId === p.id);
          const isActive = this.currentProviderFilter === p.id;
          return `
            <div class="win-tree-node ${isActive ? 'active' : ''}" data-provider="${p.id}" data-type="all">
              <i class="${p.icon || 'ph-cloud'}" style="color: ${p.color || 'var(--accent-cyan)'};"></i>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</span>
              <span class="win-node-badge">${providerFiles.length}</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  /* ── Context Menu & Preview ──────────────────────────── */

  openContextMenu(e, file) {
    this.activeContextMenuFile = file;
    const menu = document.getElementById('file-context-menu');
    if (!menu) return;

    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - 260)}px`;
    menu.classList.add('show');
  }

  openPreviewModal(file) {
    const modal = document.getElementById('file-preview-modal');
    if (!modal) return;

    document.getElementById('preview-file-name') && (document.getElementById('preview-file-name').textContent = file.name);
    document.getElementById('preview-file-meta') && (document.getElementById('preview-file-meta').textContent = `${this.formatBytes(file.sizeBytes)} • ${new Date(file.lastModified || Date.now()).toLocaleDateString()} • ${this.getProviderLabel(file.providerId)}`);

    const body = document.getElementById('preview-modal-body');
    if (body) {
      if (file.type === 'image' && file.previewUrl) {
        body.innerHTML = `<img src="${file.previewUrl}" alt="${file.name}" style="max-width: 100%; max-height: 60vh; border-radius: var(--radius-sm); object-fit: contain;" />`;
      } else if (file.type === 'video' && file.previewUrl) {
        body.innerHTML = `<video controls autoplay style="max-width: 100%; max-height: 60vh; border-radius: var(--radius-sm);"><source src="${file.previewUrl}" type="${file.mimeType || 'video/mp4'}">Your browser does not support HTML video.</video>`;
      } else if (file.type === 'code') {
        body.innerHTML = `<pre style="background: var(--bg-tertiary); padding: 1rem; border-radius: var(--radius-sm); font-family: monospace; font-size: 0.85rem; max-height: 60vh; overflow: auto; text-align: left;"><code>// Source Preview: ${file.name}\n// Provider: ${this.getProviderLabel(file.providerId)}\n\nconsole.log("OmniCloud connected file stream active.");</code></pre>`;
      } else {
        body.innerHTML = `
          <div style="text-align: center; padding: 2rem;">
            <i class="${this.getTypeIcon(file.type)}" style="font-size: 4rem; color: var(--accent-cyan); margin-bottom: 1rem;"></i>
            <h4 style="color: var(--text-main); margin-bottom: 0.5rem;">${file.name}</h4>
            <p style="color: var(--text-dim); font-size: 0.85rem;">Document ready for cloud synchronization and streaming.</p>
          </div>
        `;
      }
    }

    modal.classList.add('active');
  }

  /* ── File Upload Processing ──────────────────────────── */

  async handleFileUpload(filesList) {
    if (!filesList || !filesList.length) return;
    const providers = storageEngine.getProviders();
    const providerId = this.currentProviderFilter !== 'all' ? this.currentProviderFilter : (providers.length ? providers[0].id : 'local_disk');

    for (const f of Array.from(filesList)) {
      let type = 'document';
      if (f.type.startsWith('image/')) type = 'image';
      else if (f.type.startsWith('video/')) type = 'video';
      else if (f.type.startsWith('audio/')) type = 'audio';
      else if (f.name.endsWith('.js') || f.name.endsWith('.html') || f.name.endsWith('.py') || f.name.endsWith('.css') || f.name.endsWith('.json')) type = 'code';

      // If Python backend is connected, upload actual binary file to server
      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          const serverFile = await api.uploadFile(f, this.currentPath, providerId);
          if (serverFile) {
            serverFile._fromBackend = true;
            storageEngine.addFile(serverFile, f);
            continue;
          }
        } catch (err) {
          console.warn('Backend upload failed, using local storage fallback:', err);
        }
      }

      const fileObj = {
        id: 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        name: f.name,
        type: type,
        mimeType: f.type || 'application/octet-stream',
        sizeBytes: f.size,
        providerId: providerId,
        path: this.currentPath,
        starred: false,
        encrypted: false,
        lastModified: new Date().toISOString(),
        tags: ['Uploaded', type],
        previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null
      };

      storageEngine.addFile(fileObj, f);
    }

    if (typeof app !== 'undefined') {
      app.updateHeaderStorageStats();
      app.showToast(`✅ Uploaded ${filesList.length} file(s) into ${this.currentPath}`);
    }
    this.render();
  }

  /* ── Utilities ────────────────────────────────────────── */

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getTypeIcon(type) {
    const icons = {
      folder: 'ph-folder-fill',
      document: 'ph-file-text',
      image: 'ph-image',
      video: 'ph-video',
      audio: 'ph-music-note',
      code: 'ph-code'
    };
    return `ph ${icons[type] || 'ph-file'}`;
  }

  getTypeColor(type) {
    const colors = {
      folder: '#f59e0b',
      document: '#3b82f6',
      image: '#10b981',
      video: '#f43f5e',
      audio: '#8b5cf6',
      code: '#00f2fe'
    };
    return colors[type] || '#00f2fe';
  }

  getFileEmoji(type) {
    const emojis = { folder: '📁', document: '📄', image: '🖼️', video: '🎬', audio: '🎵', code: '💻' };
    return emojis[type] || '📄';
  }

  getProviderIcon(providerId) {
    if (providerId?.includes('gdrive')) return '<i class="ph ph-google-logo" style="color: #4285f4;"></i>';
    if (providerId?.includes('onedrive')) return '<i class="ph ph-windows-logo" style="color: #0078d4;"></i>';
    if (providerId?.includes('dropbox')) return '<i class="ph ph-dropbox-logo" style="color: #0061ff;"></i>';
    if (providerId?.includes('aws')) return '<i class="ph ph-amazon-logo" style="color: #ff9900;"></i>';
    return '<i class="ph ph-hard-drive" style="color: var(--accent-cyan);"></i>';
  }

  getProviderLabel(providerId) {
    const p = storageEngine.getProviders().find(item => item.id === providerId);
    return p ? p.name : 'Local Hard Drive';
  }
}

const fileManager = new FileManager();
