/* ==========================================================================
   OmniCloud - Persistence & Hybrid Storage Engine
   Synchronizes between Python Backend (SQLite / Disk) and LocalStorage / IndexedDB
   ========================================================================== */

class StorageManager {
  constructor() {
    this.STORAGE_KEY_PROVIDERS = 'omnicloud_providers_v1';
    this.STORAGE_KEY_FILES = 'omnicloud_files_v1';
    this.STORAGE_KEY_TRANSFERS = 'omnicloud_transfers_v1';
    this.STORAGE_KEY_SETTINGS = 'omnicloud_settings_v1';
    this.dbName = 'OmniCloudDB';
    this.dbVersion = 1;
    this.db = null;
    this.isBackendConnected = false;
  }

  async init() {
    if (localStorage.getItem(this.STORAGE_KEY_PROVIDERS) === null) {
      localStorage.setItem(this.STORAGE_KEY_PROVIDERS, JSON.stringify(INITIAL_PROVIDERS));
    }
    if (localStorage.getItem(this.STORAGE_KEY_FILES) === null) {
      localStorage.setItem(this.STORAGE_KEY_FILES, JSON.stringify(INITIAL_FILES));
    }
    if (localStorage.getItem(this.STORAGE_KEY_TRANSFERS) === null) {
      localStorage.setItem(this.STORAGE_KEY_TRANSFERS, JSON.stringify(INITIAL_TRANSFERS));
    }

    await this.initIndexedDB();

    // Connect to Python Backend API if available
    if (typeof api !== 'undefined') {
      try {
        const isOnline = await api.init();
        this.isBackendConnected = isOnline;
        if (isOnline) {
          await this.syncWithBackend();
        }
      } catch (e) {
        console.warn('Backend sync initialization skipped:', e);
      }
    }
  }

  async syncWithBackend() {
    try {
      // 1. Providers Sync: Reconcile backend and local providers
      const backendProviders = (await api.getProviders()) || [];
      const localProviders = this.getProviders() || [];

      const providerMap = new Map();
      backendProviders.forEach(p => providerMap.set(p.id, p));

      const missingOnBackend = [];
      for (const lp of localProviders) {
        if (!providerMap.has(lp.id)) {
          providerMap.set(lp.id, lp);
          missingOnBackend.push(lp);
        }
      }

      if (missingOnBackend.length > 0) {
        await api.syncProviders(missingOnBackend);
      }

      this.saveProviders(Array.from(providerMap.values()));

      // 2. Files Sync
      const backendFiles = await api.getFiles();
      const localFiles = this.getFiles();

      if (backendFiles && backendFiles.length > 0) {
        this.saveFiles(backendFiles);
      } else if (localFiles.length > 0) {
        await api.syncFiles(localFiles);
      }

      // 3. Transfers Sync
      const backendTransfers = await api.getTransfers();
      if (backendTransfers && backendTransfers.length > 0) {
        this.saveTransfers(backendTransfers);
      }

      console.log('✅ OmniCloud successfully synced with Python Backend');
    } catch (e) {
      console.warn('Backend sync error:', e);
    }
  }

  clearAllData() {
    localStorage.setItem(this.STORAGE_KEY_FILES, JSON.stringify([]));
    localStorage.setItem(this.STORAGE_KEY_TRANSFERS, JSON.stringify([]));
    if (this.db) {
      const tx = this.db.transaction('fileBlobs', 'readwrite');
      tx.objectStore('fileBlobs').clear();
    }
  }

  initIndexedDB() {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('fileBlobs')) {
            db.createObjectStore('fileBlobs', { keyPath: 'id' });
          }
        };
        request.onsuccess = (event) => {
          this.db = event.target.result;
          resolve();
        };
        request.onerror = (event) => {
          console.warn('IndexedDB failed to open, falling back to LocalStorage', event);
          resolve();
        };
      } catch (e) {
        resolve();
      }
    });
  }

  // --- Providers ---

  getProviders() {
    return JSON.parse(localStorage.getItem(this.STORAGE_KEY_PROVIDERS) || '[]');
  }

  saveProviders(providers) {
    localStorage.setItem(this.STORAGE_KEY_PROVIDERS, JSON.stringify(providers));
  }

  async addProvider(newProvider) {
    const providers = this.getProviders();
    const existingIndex = providers.findIndex(p => p.id === newProvider.id);
    if (existingIndex >= 0) {
      providers[existingIndex] = { ...providers[existingIndex], ...newProvider };
    } else {
      providers.push(newProvider);
    }
    this.saveProviders(providers);

    if (typeof api !== 'undefined' && api.isOnline) {
      try {
        const saved = await api.addProvider(newProvider);
        if (saved) {
          const list = this.getProviders();
          const idx = list.findIndex(p => p.id === newProvider.id);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...saved };
            this.saveProviders(list);
          }
        }
      } catch (err) {
        console.warn('API addProvider failed:', err);
      }
    }
  }

  async deleteProvider(providerId) {
    let providers = this.getProviders();
    providers = providers.filter(p => p.id !== providerId);
    this.saveProviders(providers);

    let files = this.getFiles();
    files = files.filter(f => f.providerId !== providerId);
    this.saveFiles(files);

    if (typeof api !== 'undefined' && api.isOnline) {
      try {
        await api.deleteProvider(providerId);
      } catch (err) {
        console.warn('API deleteProvider failed:', err);
      }
    }
  }

  async updateProviderStatus(id, status) {
    const providers = this.getProviders();
    const target = providers.find(p => p.id === id);
    if (target) {
      target.status = status;
      target.lastSync = new Date().toISOString();
      this.saveProviders(providers);
      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.addProvider(target);
        } catch (err) {
          console.warn('API updateProvider failed:', err);
        }
      }
    }
  }

  // --- Files ---

  getFiles() {
    return JSON.parse(localStorage.getItem(this.STORAGE_KEY_FILES) || '[]');
  }

  saveFiles(files) {
    localStorage.setItem(this.STORAGE_KEY_FILES, JSON.stringify(files));
  }

  addFile(fileMetaData, fileBlob = null) {
    const files = this.getFiles();
    // Prevent duplicate entries
    const existingIndex = files.findIndex(f => f.id === fileMetaData.id);
    if (existingIndex >= 0) {
      files[existingIndex] = fileMetaData;
    } else {
      files.unshift(fileMetaData);
    }
    this.saveFiles(files);

    if (fileBlob && this.db) {
      try {
        const tx = this.db.transaction('fileBlobs', 'readwrite');
        const store = tx.objectStore('fileBlobs');
        store.put({ id: fileMetaData.id, blob: fileBlob });
      } catch (e) {}
    }

    // Sync to Python backend if it was created locally without multipart upload
    if (typeof api !== 'undefined' && api.isOnline && !fileMetaData._fromBackend) {
      if (!fileBlob) {
        api.syncFiles([fileMetaData]).catch(err => console.warn('API syncFile failed:', err));
      }
    }
  }

  deleteFile(fileId) {
    let files = this.getFiles();
    files = files.filter(f => f.id !== fileId);
    this.saveFiles(files);

    if (this.db) {
      try {
        const tx = this.db.transaction('fileBlobs', 'readwrite');
        const store = tx.objectStore('fileBlobs');
        store.delete(fileId);
      } catch (e) {}
    }

    if (typeof api !== 'undefined' && api.isOnline) {
      api.deleteFile(fileId).catch(err => console.warn('API deleteFile failed:', err));
    }
  }

  updateFile(fileId, updates) {
    const files = this.getFiles();
    const target = files.find(f => f.id === fileId);
    if (target) {
      Object.assign(target, updates);
      target.lastModified = new Date().toISOString();
      this.saveFiles(files);

      if (typeof api !== 'undefined' && api.isOnline) {
        api.updateFile(fileId, updates).catch(err => console.warn('API updateFile failed:', err));
      }
      return target;
    }
    return null;
  }

  renameFile(fileId, newName) {
    return this.updateFile(fileId, { name: newName });
  }

  moveFiles(fileIds, targetPath, targetProviderId = null) {
    const files = this.getFiles();
    fileIds.forEach(id => {
      const f = files.find(item => item.id === id);
      if (f) {
        f.path = targetPath;
        if (targetProviderId) f.providerId = targetProviderId;
        f.lastModified = new Date().toISOString();
      }
    });
    this.saveFiles(files);

    if (typeof api !== 'undefined' && api.isOnline) {
      api.batchMove(fileIds, targetPath, targetProviderId).catch(err => console.warn('API batchMove failed:', err));
    }
  }

  createFolder(folderName, currentPath = '/', providerId = 'local_disk') {
    const newFolder = {
      id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: folderName,
      type: 'folder',
      mimeType: 'application/vnd.google-apps.folder',
      sizeBytes: 0,
      providerId: providerId,
      path: currentPath,
      starred: false,
      encrypted: false,
      lastModified: new Date().toISOString(),
      tags: ['Folder'],
      previewUrl: null
    };
    this.addFile(newFolder);

    if (typeof api !== 'undefined' && api.isOnline) {
      api.createFolder(folderName, currentPath, providerId).then(serverFolder => {
        if (serverFolder && serverFolder.id) {
          // Update local folder with server ID
          let fList = this.getFiles();
          const idx = fList.findIndex(f => f.id === newFolder.id);
          if (idx >= 0) {
            fList[idx] = serverFolder;
            this.saveFiles(fList);
          }
        }
      }).catch(err => console.warn('API createFolder failed:', err));
    }

    return newFolder;
  }

  toggleStarFile(fileId) {
    const files = this.getFiles();
    const target = files.find(f => f.id === fileId);
    if (target) {
      target.starred = !target.starred;
      this.saveFiles(files);

      if (typeof api !== 'undefined' && api.isOnline) {
        api.updateFile(fileId, { starred: target.starred }).catch(err => console.warn('API toggleStar failed:', err));
      }
    }
  }

  getFileBlob(fileId) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(null);
      try {
        const tx = this.db.transaction('fileBlobs', 'readonly');
        const store = tx.objectStore('fileBlobs');
        const request = store.get(fileId);
        request.onsuccess = () => resolve(request.result ? request.result.blob : null);
        request.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  // --- Transfers ---

  getTransfers() {
    return JSON.parse(localStorage.getItem(this.STORAGE_KEY_TRANSFERS) || '[]');
  }

  saveTransfers(transfers) {
    localStorage.setItem(this.STORAGE_KEY_TRANSFERS, JSON.stringify(transfers));
  }

  addTransfer(transferItem) {
    const transfers = this.getTransfers();
    transfers.unshift(transferItem);
    this.saveTransfers(transfers);
  }

  updateTransferProgress(id, progress, status = 'in_progress') {
    const transfers = this.getTransfers();
    const target = transfers.find(t => t.id === id);
    if (target) {
      target.progress = progress;
      target.status = status;
      this.saveTransfers(transfers);
    }
  }
}

const storageEngine = new StorageManager();
