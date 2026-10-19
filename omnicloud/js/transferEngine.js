/* ==========================================================================
   OmniCloud - Multi-Cloud Migration Engine & Sync Queue
   ========================================================================== */

class TransferEngine {
  constructor() {
    this.activeIntervals = {};
  }

  init() {
    this.bindEvents();
    this.renderQueue();
  }

  bindEvents() {
    const launchBtn = document.getElementById('launch-transfer-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', () => this.initiateTransferFromInputs());
    }
  }

  initiateTransferFromInputs() {
    const fileSelect = document.getElementById('transfer-file-select');
    const sourceSelect = document.getElementById('transfer-source-select');
    const destSelect = document.getElementById('transfer-dest-select');

    if (!fileSelect || !sourceSelect || !destSelect) return;

    const fileId = fileSelect.value;
    const sourceProvider = sourceSelect.value;
    const destProvider = destSelect.value;

    if (sourceProvider === destProvider) {
      app.showToast('Source and Destination cloud providers must be different!', 'warning');
      return;
    }

    const file = storageEngine.getFiles().find(f => f.id === fileId);
    if (!file) {
      app.showToast('Please select a file to transfer', 'warning');
      return;
    }

    this.startTransfer(file, sourceProvider, destProvider);
  }

  startTransfer(file, sourceProvider, destProvider) {
    const transferId = 'tr-' + Date.now();
    const transferItem = {
      id: transferId,
      fileName: file.name,
      fileId: file.id,
      sourceProvider: sourceProvider,
      destProvider: destProvider,
      sizeBytes: file.sizeBytes,
      progress: 0,
      status: 'in_progress',
      timestamp: new Date().toISOString(),
      speedMbps: (Math.random() * 40 + 20).toFixed(1)
    };

    storageEngine.addTransfer(transferItem);
    app.showToast(`Transfer started: ${file.name} -> ${destProvider.toUpperCase()}`);
    this.renderQueue();

    // If Python backend is connected, notify server transfer queue
    if (typeof api !== 'undefined' && api.isOnline) {
      api.createTransfer(file.id, sourceProvider, destProvider).catch(err => console.warn('API transfer error:', err));
    }

    // Simulate animated progress loop
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 8;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        delete this.activeIntervals[transferId];

        storageEngine.updateTransferProgress(transferId, 100, 'completed');

        // Create copy of file in target destination provider
        const providers = storageEngine.getProviders();
        const destP = providers.find(p => p.id === destProvider);

        const transferredFile = {
          ...file,
          id: 'f-migrated-' + Date.now(),
          providerId: destProvider,
          name: `${file.name}`,
          lastModified: new Date().toISOString(),
          tags: [...(file.tags || []), 'Transferred']
        };

        storageEngine.addFile(transferredFile);
        app.showToast(`Completed cross-cloud transfer to ${destP ? destP.name : destProvider}!`);
        
        fileManager.render();
        app.updateHeaderStorageStats();
      } else {
        storageEngine.updateTransferProgress(transferId, progress, 'in_progress');
      }
      this.renderQueue();
    }, 400);

    this.activeIntervals[transferId] = interval;
  }

  renderQueue() {
    const queueContainer = document.getElementById('transfer-queue-container');
    if (!queueContainer) return;

    const transfers = storageEngine.getTransfers();
    const providers = storageEngine.getProviders();

    if (transfers.length === 0) {
      queueContainer.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-arrows-left-right"></i>
          <p style="font-size: 0.85rem;">No active or past transfers in queue.</p>
        </div>
      `;
      return;
    }

    queueContainer.innerHTML = transfers.map(t => {
      const srcP = providers.find(p => p.id === t.sourceProvider) || { name: t.sourceProvider, icon: 'ph-cloud' };
      const destP = providers.find(p => p.id === t.destProvider) || { name: t.destProvider, icon: 'ph-cloud' };
      const formattedSize = ChartEngine.formatBytes(t.sizeBytes);

      return `
        <div class="queue-item">
          <div class="queue-item-header">
            <span>${t.fileName} (${formattedSize})</span>
            <span style="font-size: 0.78rem; color: ${t.status === 'completed' ? 'var(--accent-emerald)' : 'var(--accent-cyan)'}">
              ${t.status === 'completed' ? '<i class="ph ph-check-circle"></i> Completed' : `${t.progress}% (${t.speedMbps} MB/s)`}
            </span>
          </div>

          <div class="queue-route">
            <span><i class="ph ${srcP.icon}"></i> ${srcP.name}</span>
            <i class="ph ph-arrow-right" style="color: var(--accent-cyan);"></i>
            <span><i class="ph ${destP.icon}"></i> ${destP.name}</span>
          </div>

          <div class="queue-progress-bar">
            <div class="queue-progress-fill" style="width: ${t.progress}%; background: ${t.status === 'completed' ? 'var(--accent-emerald)' : 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))'};"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

const transferEngine = new TransferEngine();
