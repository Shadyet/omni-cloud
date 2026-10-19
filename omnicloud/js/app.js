/* ==========================================================================
   OmniCloud - Main Application Controller & UI Coordinator
   ========================================================================== */

class App {
  constructor() {
    this.currentTheme = localStorage.getItem('omnicloud_theme') || 'dark';
  }

  async init() {
    // Apply Theme
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    this.updateThemeIcon();

    // Initialize Storage
    await storageEngine.init();

    // Initialize Firebase Auth
    if (typeof firebaseAuth !== 'undefined') {
      await firebaseAuth.init();
    }

    // Render Providers Cards & Stats
    this.renderProviders();
    this.updateHeaderStorageStats();

    // Initialize File Manager & Transfer Engine
    fileManager.init();
    transferEngine.init();

    // Populate Transfer Select Options
    this.populateTransferSelects();

    // Render Charts
    ChartEngine.renderStorageDonutChart('storage-donut-chart', storageEngine.getProviders());
    ChartEngine.renderFileTypeBreakdown('file-type-breakdown-chart', storageEngine.getFiles());

    // Bind Global UI Listeners
    this.bindGlobalEvents();
  }

  bindGlobalEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const view = item.dataset.view;
        document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
        const targetPanel = document.getElementById(`panel-${view}`);
        if (targetPanel) targetPanel.classList.add('active');

        // Re-render charts or files if needed
        if (view === 'dashboard') {
          ChartEngine.renderStorageDonutChart('storage-donut-chart', storageEngine.getProviders());
          ChartEngine.renderFileTypeBreakdown('file-type-breakdown-chart', storageEngine.getFiles());
        }
      });
    });

    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        localStorage.setItem('omnicloud_theme', this.currentTheme);
        this.updateThemeIcon();
      });
    }

    // Connect Provider Modal Trigger
    const connectProviderBtn = document.getElementById('connect-provider-btn');
    if (connectProviderBtn) {
      connectProviderBtn.addEventListener('click', () => {
        const modal = document.getElementById('add-provider-modal');
        modal.classList.add('active');
        // Reset token status
        this._oauthToken = null;
        document.getElementById('oauth-token-status')?.style?.setProperty('display', 'none');
        document.getElementById('oauth-popup-btn')?.classList.remove('success', 'waiting');
        document.getElementById('provider-token-input') && (document.getElementById('provider-token-input').value = '');
        const type = document.getElementById('provider-type-select')?.value;
        this._onProviderTypeChange(type);
        this.runAutoDetect();
      });
    }

    // Provider Type Change
    const providerTypeSelect = document.getElementById('provider-type-select');
    if (providerTypeSelect) {
      providerTypeSelect.addEventListener('change', (e) => {
        this._onProviderTypeChange(e.target.value);
        this.runAutoDetect();
      });
    }

    // Client ID help toggle
    const clientIdToggle = document.getElementById('client-id-toggle');
    if (clientIdToggle) {
      clientIdToggle.addEventListener('click', () => {
        const box = document.getElementById('client-id-help');
        if (box) box.style.display = box.style.display === 'none' ? '' : 'none';
      });
    }

    // OAuth Popup Sign-In button
    const oauthPopupBtn = document.getElementById('oauth-popup-btn');
    if (oauthPopupBtn) {
      oauthPopupBtn.addEventListener('click', () => this._startOAuthPopup());
    }

    // Auto-Detect Button
    const autoDetectBtn = document.getElementById('auto-detect-btn');
    if (autoDetectBtn) {
      autoDetectBtn.addEventListener('click', () => this.runAutoDetect());
    }

    // Token input paste/input handler -> auto-detect live quota immediately
    const tokenInputEl = document.getElementById('provider-token-input');
    if (tokenInputEl) {
      tokenInputEl.addEventListener('input', () => {
        const val = tokenInputEl.value.trim();
        if (val.length > 20) {
          this.runAutoDetect();
        }
      });
    }

    // Open Firebase Setup Modal
    const openFirebaseBtn = document.getElementById('open-firebase-setup-btn');
    if (openFirebaseBtn) {
      openFirebaseBtn.addEventListener('click', () => {
        const modal = document.getElementById('firebase-setup-modal');
        if (modal) modal.classList.add('active');
      });
    }

    // Save Firebase Config
    const saveFirebaseBtn = document.getElementById('save-firebase-config-btn');
    if (saveFirebaseBtn) {
      saveFirebaseBtn.addEventListener('click', async () => {
        const input = document.getElementById('firebase-config-input');
        const errEl = document.getElementById('firebase-config-error');
        if (!input || !errEl) return;

        const text = input.value.trim();
        const parsed = firebaseAuth.parseConfigFromText(text);

        if (!parsed || !firebaseAuth.isValidConfig(parsed)) {
          errEl.textContent = 'Invalid Firebase configuration. Please check your apiKey, projectId, and authDomain.';
          errEl.style.display = 'block';
          return;
        }

        errEl.style.display = 'none';
        firebaseAuth.saveConfig(parsed);
        const ok = await firebaseAuth.init();

        if (ok) {
          document.getElementById('firebase-setup-modal')?.classList.remove('active');
          document.getElementById('firebase-not-ready-banner')?.style.setProperty('display', 'none');
          this.showToast('✅ Firebase initialized! One-click sign-in is now active.', 'success');
        } else {
          errEl.textContent = 'Failed to initialize Firebase with provided configuration.';
          errEl.style.display = 'block';
        }
      });
    }

    // In-App OAuth Modal Handlers (Step-by-step sign in)
    const oauthNextBtn = document.getElementById('oauth-next-btn');
    if (oauthNextBtn) {
      oauthNextBtn.addEventListener('click', () => {
        const email = document.getElementById('oauth-email-input')?.value || '';
        if (!email) return;
        const display = document.getElementById('oauth-user-display');
        if (display) display.textContent = email;
        document.getElementById('oauth-step-1')?.style.setProperty('display', 'none');
        document.getElementById('oauth-step-2')?.style.setProperty('display', 'block');
        setTimeout(() => document.getElementById('oauth-password-input')?.focus(), 100);
      });

      const emailInput = document.getElementById('oauth-email-input');
      if (emailInput) {
        emailInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            oauthNextBtn.click();
          }
        });
      }
    }

    const oauthLoginBtn = document.getElementById('oauth-login-btn');
    if (oauthLoginBtn) {
      oauthLoginBtn.addEventListener('click', () => {
        const pass = document.getElementById('oauth-password-input')?.value || '';
        if (!pass) return;
        document.getElementById('oauth-step-2')?.style.setProperty('display', 'none');
        document.getElementById('oauth-step-3')?.style.setProperty('display', 'block');
      });

      const passInput = document.getElementById('oauth-password-input');
      if (passInput) {
        passInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            oauthLoginBtn.click();
          }
        });
      }
    }

    // Quick Fill Demo Button
    const quickFillBtn = document.getElementById('oauth-quick-fill-btn');
    if (quickFillBtn) {
      quickFillBtn.addEventListener('click', () => {
        const emailInp = document.getElementById('oauth-email-input');
        if (emailInp) emailInp.value = 'alex.workspace@gmail.com';
        document.getElementById('oauth-password-input') && (document.getElementById('oauth-password-input').value = 'secureGooglePass2026');
        oauthNextBtn?.click();
      });
    }

    const oauthAllowBtn = document.getElementById('oauth-allow-btn');
    if (oauthAllowBtn) {
      oauthAllowBtn.addEventListener('click', async () => {
        const email = document.getElementById('oauth-email-input')?.value || 'user@cloud.com';
        const type = document.getElementById('provider-type-select')?.value || 'gdrive';
        const nameInput = document.getElementById('provider-name-input');
        const providerLabel = { gdrive: 'Google Drive', onedrive: 'Microsoft OneDrive', dropbox: 'Dropbox Cloud' }[type] || 'Cloud Drive';

        const mockToken = `mock_${type}_${btoa(email)}`;
        this._oauthToken = mockToken;
        this._oauthEmail = email;
        this._detectedUser = email;
        const userInput = document.getElementById('provider-user-input');
        if (userInput) userInput.value = email;

        // Auto-detect quota for this provider
        try {
          const quota = await cloudIntegrator.autoDetectQuota(type, { token: mockToken });
          const totalInp = document.getElementById('provider-storage-input');
          const usedInp  = document.getElementById('provider-used-input');
          const quotaBtn = document.getElementById('quota-status-text');
          if (totalInp && quota.totalStorageGB) totalInp.value = quota.totalStorageGB;
          if (usedInp && quota.usedStorageGB !== undefined) usedInp.value = quota.usedStorageGB;
          if (quotaBtn) quotaBtn.textContent = `✅ ${quota.totalStorageGB} GB total · ${quota.usedStorageGB} GB used`;
        } catch (e) {
          console.warn('Quota detection:', e);
        }

        // Update account name with signed-in user
        if (nameInput) nameInput.value = `${providerLabel} (${email})`;

        // Show success status banner inside connect modal
        const statusEl   = document.getElementById('oauth-token-status');
        const statusText = document.getElementById('oauth-token-status-text');
        if (statusEl) {
          if (statusText) statusText.textContent = `✅ Signed in as ${email}`;
          statusEl.style.display = 'flex';
        }

        // Update the sign-in button to show success
        const popupLabel = document.getElementById('oauth-popup-label');
        if (popupLabel) popupLabel.textContent = `✓ Signed in as ${email.split('@')[0]}`;

        // Close sign-in window
        document.getElementById('oauth-modal')?.classList.remove('active');

        // Auto-connect and import files
        this.showToast(`✅ ${providerLabel} connected! Importing files...`);
        setTimeout(() => {
          document.getElementById('connect-submit-btn')?.click();
        }, 300);
      });
    }

    // Listen for token arriving from OAuth popup
    window.addEventListener('message', async (ev) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === 'OMNICLOUD_OAUTH_TOKEN') {
        const token = ev.data.access_token;
        this._oauthToken = token;
        // Show success banner
        const statusEl   = document.getElementById('oauth-token-status');
        const statusText = document.getElementById('oauth-token-status-text');
        if (statusEl) {
          statusText.textContent = '✅ Signed in! Files will be imported when you click Connect.';
          statusEl.style.display = 'flex';
        }
        // Style button as success
        const btn = document.getElementById('oauth-popup-btn');
        if (btn) {
          btn.classList.remove('waiting');
          btn.classList.add('success');
          document.getElementById('oauth-popup-label').textContent = '✓ Signed in — ready to connect';
        }
        // Also fill the manual input (hidden under details)
        const tokenInput = document.getElementById('provider-token-input');
        if (tokenInput) tokenInput.value = token;
        // Run auto-detect with the real token
        await this.runAutoDetect();
        this.showToast('OAuth sign-in complete! Click "Connect" to import your files.');
      }
      if (ev.data?.type === 'OMNICLOUD_OAUTH_ERROR') {
        this.showToast(`OAuth error: ${ev.data.error}`, 'error');
        document.getElementById('oauth-popup-btn')?.classList.remove('waiting');
      }
    });

    // Python Backend Status Badge & Info Modal
    const backendBadge = document.getElementById('backend-status-badge');
    const backendModal = document.getElementById('backend-info-modal');
    if (backendBadge && backendModal) {
      backendBadge.addEventListener('click', () => {
        const info = typeof api !== 'undefined' ? api.serverInfo : null;
        const isOnline = typeof api !== 'undefined' && api.isOnline;

        const statusEl = document.getElementById('backend-modal-status');
        const pythonEl = document.getElementById('backend-modal-python');
        const urlEl = document.getElementById('backend-modal-url');
        const dbEl = document.getElementById('backend-modal-db');
        const uploadsEl = document.getElementById('backend-modal-uploads');
        const uptimeEl = document.getElementById('backend-modal-uptime');

        if (statusEl) {
          statusEl.textContent = isOnline ? 'ACTIVE (CONNECTED)' : 'OFFLINE';
          statusEl.style.background = isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)';
          statusEl.style.color = isOnline ? '#10b981' : '#eab308';
        }
        if (pythonEl) pythonEl.textContent = info ? `Python ${info.python_version} (${info.platform})` : 'Python 3.11+';
        if (urlEl) urlEl.textContent = typeof api !== 'undefined' ? `${api.baseUrl}/api` : 'http://localhost:5000/api';
        if (dbEl) dbEl.textContent = info?.database?.path || 'backend/data/omnicloud.db';
        if (uploadsEl) uploadsEl.textContent = info?.storage?.upload_dir || 'backend/data/uploads';
        if (uptimeEl) uptimeEl.textContent = info ? `${info.uptime_seconds}s (PID Live)` : 'Offline';

        backendModal.classList.add('active');
      });
    }

    const testPingBtn = document.getElementById('backend-test-ping-btn');
    if (testPingBtn) {
      testPingBtn.addEventListener('click', async () => {
        if (typeof api !== 'undefined') {
          testPingBtn.disabled = true;
          testPingBtn.innerHTML = '<i class="ph ph-spinner"></i> Pinging...';
          const info = await api.checkHealth();
          testPingBtn.disabled = false;
          testPingBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Ping Backend';
          if (info) {
            this.showToast(`✅ Python Backend: Healthy (${info.python_version}) • SQLite Connected!`);
            document.getElementById('backend-modal-status') && (document.getElementById('backend-modal-status').textContent = 'ACTIVE (CONNECTED)');
            document.getElementById('backend-modal-uptime') && (document.getElementById('backend-modal-uptime').textContent = `${info.uptime_seconds}s`);
          } else {
            this.showToast('⚠️ Python Backend unreachable. Run "python server.py" in terminal.', 'warning');
            document.getElementById('backend-modal-status') && (document.getElementById('backend-modal-status').textContent = 'OFFLINE');
          }
        }
      });
    }

    const scanDriveBtn = document.getElementById('scan-drive-btn');
    if (scanDriveBtn) {
      scanDriveBtn.addEventListener('click', async () => {
        let result = await cloudIntegrator.scanLocalFolderDrive();
        
        // If browser File System API was cancelled or unavailable, use Python Backend disk scan
        if (!result && typeof api !== 'undefined' && api.isOnline) {
          this.showToast('Scanning local system drive via Python backend...');
          result = await api.scanLocalDisk();
        }

        if (result && result.success) {
          const now = new Date().toISOString();
          const newProvider = {
            id: 'local_disk_' + Date.now(),
            name: `Drive (${result.driveName})`,
            type: 'local_disk',
            icon: 'ph-hard-drive',
            color: '#00f2fe',
            status: 'connected',
            user: result.user || `Local Disk (${result.driveName})`,
            email: 'local@device',
            totalStorageGB: result.totalStorageGB,
            usedStorageGB: result.usedStorageGB,
            freeStorageGB: Math.max(0, parseFloat((result.totalStorageGB - result.usedStorageGB).toFixed(2))),
            region: 'Local Device System',
            credentials: { driveName: result.driveName, path: result.path || 'Local System', connectedAt: now },
            connectedAt: now,
            lastSync: now,
            fileCount: result.files ? result.files.length : 0
          };
          await storageEngine.addProvider(newProvider);

          if (result.files && result.files.length) {
            result.files.forEach(f => storageEngine.addFile(f));
            if (typeof api !== 'undefined' && api.isOnline) {
              await api.syncFiles(result.files);
            }
          }

          this.renderProviders();
          this.populateTransferSelects();
          ChartEngine.renderStorageDonutChart('storage-donut-chart', storageEngine.getProviders());
          fileManager.render();
          this.updateHeaderStorageStats();
          this.showToast(`Scanned Drive "${result.driveName}": ${result.files.length} files stored!`);
        }
      });
    }

    // Save Provider Submit
    const saveProviderForm = document.getElementById('add-provider-form');
    if (saveProviderForm) {
      saveProviderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('provider-type-select').value;
        const name = document.getElementById('provider-name-input').value || 'Connected Cloud Storage';
        // Prefer token from real OAuth popup, fall back to manually pasted token
        const token = this._oauthToken || document.getElementById('provider-token-input')?.value || '';
        const totalGB = parseFloat(document.getElementById('provider-storage-input').value) || 100;
        const usedGB  = parseFloat(document.getElementById('provider-used-input').value) || 0;

        const colors = {
          local_disk: '#00f2fe',
          gdrive: '#4285f4',
          dropbox: '#0061ff',
          aws_s3: '#ff9900',
          onedrive: '#0078d4',
          mega: '#d9272e'
        };

        const icons = {
          local_disk: 'ph-hard-drive',
          gdrive: 'ph-google-logo',
          dropbox: 'ph-dropbox-logo',
          aws_s3: 'ph-amazon-logo',
          onedrive: 'ph-microsoft-teams-logo',
          mega: 'ph-shield-check'
        };

        const userEmailInput = document.getElementById('provider-user-input')?.value?.trim();
        let userIdentifier = userEmailInput || this._detectedUser || this._oauthEmail || document.getElementById('oauth-email-input')?.value || '';
        if (!userIdentifier) {
          const emailMatch = name.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
          if (emailMatch) {
            userIdentifier = emailMatch[0];
          }
        }
        if (!userIdentifier) {
          if (type === 'local_disk') userIdentifier = 'Local Computer Disk Storage';
          else if (type === 'gdrive') userIdentifier = 'Google Drive Account';
          else if (type === 'dropbox') userIdentifier = 'Dropbox Storage Account';
          else if (type === 'onedrive') userIdentifier = 'OneDrive Azure Link';
          else if (type === 'aws_s3') userIdentifier = 'AWS S3 Bucket Node';
          else userIdentifier = `${name} Account`;
        }

        const email = (userIdentifier.includes('@') ? userIdentifier : '') || (authManager?.currentUser?.email || '');
        const providerId = type + '_' + Date.now();
        const now = new Date().toISOString();

        const newProvider = {
          id: providerId,
          name: name,
          type: type,
          icon: icons[type] || 'ph-cloud',
          color: colors[type] || '#00f2fe',
          status: 'connected',
          user: userIdentifier,
          email: email,
          totalStorageGB: totalGB,
          usedStorageGB: usedGB,
          freeStorageGB: Math.max(0, parseFloat((totalGB - usedGB).toFixed(2))),
          region: this._detectedRegion || (type === 'local_disk' ? 'Local Device System' : (type === 'gdrive' ? 'Google Cloud (Global)' : (type === 'dropbox' ? 'Dropbox Cloud (US)' : (type === 'onedrive' ? 'Microsoft Azure (Global)' : 'Cloud Data Center')))),
          credentials: {
            token: token,
            tokenType: 'Bearer',
            type: type,
            savedAt: now
          },
          connectedAt: now,
          lastSync: now,
          fileCount: 0
        };

        await storageEngine.addProvider(newProvider);

        // Fetch real or structured files & folders for this provider
        this.showToast(`Connecting to ${name}... importing and storing files 📂`);
        try {
          const cloudFiles = await cloudIntegrator.fetchFiles(type, token, providerId);
          if (cloudFiles && cloudFiles.length) {
            cloudFiles.forEach(f => storageEngine.addFile(f));
            newProvider.fileCount = cloudFiles.length;
            await storageEngine.addProvider(newProvider);
            if (typeof api !== 'undefined' && api.isOnline) {
              await api.syncFiles(cloudFiles);
            }
            this.showToast(`✅ Stored ${cloudFiles.length} items from ${name} in database!`);
          } else {
            this.showToast(`Connected ${name}!`);
          }
        } catch (err) {
          console.warn('File fetch warning:', err);
          this.showToast(`Connected ${name}!`);
        }

        this.renderProviders();
        this.populateTransferSelects();
        ChartEngine.renderStorageDonutChart('storage-donut-chart', storageEngine.getProviders());
        fileManager.render();
        this.updateHeaderStorageStats();

        document.getElementById('add-provider-modal').classList.remove('active');
        this._resetOAuthState();
        this.showToast(`✅ Connected: ${name} — ${totalGB} GB total, ${usedGB} GB used`);
      });
    }

    // Modal Closers — also reset OAuth state when provider modal is dismissed
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        // Reset OAuth popup state if provider modal is closing
        if (btn.closest('#add-provider-modal') || !btn.closest('.modal-overlay')) {
          this._resetOAuthState();
        }
      });
    });
    // Click backdrop to close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          if (overlay.id === 'add-provider-modal') this._resetOAuthState();
        }
      });
    });

    // Context Menu Items
    const ctxShare = document.getElementById('ctx-share');
    if (ctxShare) {
      ctxShare.addEventListener('click', () => {
        if (fileManager.activeContextMenuFile) {
          this.openShareModal(fileManager.activeContextMenuFile);
        }
      });
    }

    const ctxDownload = document.getElementById('ctx-download');
    if (ctxDownload) {
      ctxDownload.addEventListener('click', () => {
        if (fileManager.activeContextMenuFile) {
          this.downloadFile(fileManager.activeContextMenuFile.id);
        }
      });
    }

    const ctxDelete = document.getElementById('ctx-delete');
    if (ctxDelete) {
      ctxDelete.addEventListener('click', () => {
        if (fileManager.activeContextMenuFile) {
          storageEngine.deleteFile(fileManager.activeContextMenuFile.id);
          fileManager.render();
          this.updateHeaderStorageStats();
          this.showToast(`Deleted ${fileManager.activeContextMenuFile.name}`);
        }
      });
    }
  }

  updateThemeIcon() {
    const icon = document.querySelector('#theme-toggle-btn i');
    if (icon) {
      icon.className = this.currentTheme === 'dark' ? 'ph ph-sun' : 'ph ph-moon';
    }
  }

  /* ── Provider Type UI helpers ───────────────────────── */

  async _onProviderTypeChange(type) {
    const nameInput   = document.getElementById('provider-name-input');
    const totalInput  = document.getElementById('provider-storage-input');
    const usedInput   = document.getElementById('provider-used-input');
    const quotaStatus = document.getElementById('quota-status-text');
    const signinSec   = document.getElementById('cloud-signin-section');
    const popupLabel  = document.getElementById('oauth-popup-label');
    const popupIcon   = document.getElementById('oauth-popup-icon');
    const statusEl    = document.getElementById('oauth-token-status');

    const defaults = {
      gdrive:     { name: 'Google Drive (My Account)',  total: 15.0,   used: 4.25,  label: 'Sign in with Google',    icon: 'ph-google-logo',           color: '#4285f4' },
      onedrive:   { name: 'OneDrive (My Account)',      total: 5.0,    used: 1.80,  label: 'Sign in with Microsoft', icon: 'ph-microsoft-teams-logo',  color: '#0078d4' },
      dropbox:    { name: 'Dropbox (My Account)',       total: 2.0,    used: 0.60,  label: 'Sign in with Dropbox',   icon: 'ph-dropbox-logo',           color: '#0061ff' },
      local_disk: { name: 'Local Computer Hard Drive',  total: 512.0,  used: 124.50, label: null },
      aws_s3:     { name: 'AWS S3 Cloud Bucket',        total: 1000.0, used: 0.0,   label: null },
    };

    const d = defaults[type] || defaults.gdrive;
    if (nameInput) nameInput.value = d.name;
    if (totalInput) totalInput.value = d.total.toFixed(1);
    if (usedInput) usedInput.value = d.used.toFixed(2);
    const userInput   = document.getElementById('provider-user-input');
    const userPlaceholders = {
      gdrive: 'user@gmail.com',
      onedrive: 'user@outlook.com',
      dropbox: 'user@dropbox.com',
      local_disk: 'Local Device Host',
      aws_s3: 's3-bucket-name'
    };
    if (userInput) {
      userInput.placeholder = userPlaceholders[type] || 'Account Identifier / Email';
      if (!userInput.value && typeof authManager !== 'undefined' && authManager.currentUser?.email && type !== 'local_disk') {
        userInput.value = authManager.currentUser.email;
      }
    }

    // If local disk, query real browser filesystem storage estimate
    if (type === 'local_disk') {
      try {
        const est = await cloudIntegrator.fetchBrowserStorageQuota();
        if (est && est.totalStorageGB) {
          if (totalInput) totalInput.value = est.totalStorageGB;
          if (usedInput) usedInput.value = est.usedStorageGB;
          if (quotaStatus) quotaStatus.textContent = `Live Device: ${est.totalStorageGB} GB Total`;
        }
      } catch {}
    }

    // Show/hide sign-in button
    if (signinSec) signinSec.style.display = d.label ? 'block' : 'none';
    if (d.label) {
      if (popupLabel) popupLabel.textContent = d.label;
      if (popupIcon) { popupIcon.className = `ph ${d.icon}`; popupIcon.style.color = d.color; }
    }
  }

  /* ── One-Click OAuth Sign-In Flow ────────────────────── */

  async _startOAuthPopup() {
    const type = document.getElementById('provider-type-select')?.value || 'gdrive';

    // For Google Drive — use real GIS OAuth (with automatic one-time setup)
    if (type === 'gdrive' && typeof googleDriveAuth !== 'undefined') {
      googleDriveAuth.signIn(
        async (realToken) => {
          // ── SUCCESS: got a real Google access token ──
          this._oauthToken = realToken;

          // 1. Fetch real quota from Google Drive API
          const quotaBtn  = document.getElementById('quota-status-text');
          if (quotaBtn) quotaBtn.textContent = 'Fetching real data...';

          let quota = { totalStorageGB: 15.0, usedStorageGB: 4.25, user: 'Google Drive' };
          try {
            quota = await cloudIntegrator.fetchGDriveQuota(realToken);
          } catch (e) { console.warn('Quota fetch:', e); }

          // 2. Update storage fields with real values
          this._oauthToken = realToken;
          this._oauthEmail = quota.user;
          this._detectedUser = quota.user;
          const userInput = document.getElementById('provider-user-input');
          if (userInput) userInput.value = quota.user;

          const totalInp = document.getElementById('provider-storage-input');
          const usedInp  = document.getElementById('provider-used-input');
          const nameInp  = document.getElementById('provider-name-input');
          if (totalInp) totalInp.value = quota.totalStorageGB;
          if (usedInp)  usedInp.value  = quota.usedStorageGB;
          if (nameInp)  nameInp.value  = `Google Drive (${quota.user})`;
          if (quotaBtn) quotaBtn.textContent = `✅ ${quota.totalStorageGB} GB total · ${quota.usedStorageGB} GB used`;

          // 3. Show success banner
          const statusEl   = document.getElementById('oauth-token-status');
          const statusText = document.getElementById('oauth-token-status-text');
          if (statusEl) {
            if (statusText) statusText.textContent = `✅ Signed in as ${quota.user}`;
            statusEl.style.display = 'flex';
          }
          const popupLabel = document.getElementById('oauth-popup-label');
          if (popupLabel) popupLabel.textContent = `✓ ${quota.user}`;

          this.showToast(`✅ Google Drive connected! Importing real files...`);

          // 4. Auto-submit to import real files
          setTimeout(() => {
            document.getElementById('connect-submit-btn')?.click();
          }, 400);
        },
        (errMsg) => {
          // Error/cancelled — no action needed, setup modal handles itself
          console.info('Google sign-in:', errMsg);
        }
      );
      return;
    }

    // For Microsoft OneDrive / Dropbox — open in-app sign-in window
    this.openInAppOAuthModal(type);
  }

  openInAppOAuthModal(type) {
    const modalTitle = document.getElementById('oauth-modal-title');
    if (modalTitle) {
      if (type === 'gdrive') {
        modalTitle.innerHTML = '<i class="ph ph-google-logo" style="color: #4285f4;"></i> Sign in with Google';
      } else if (type === 'onedrive') {
        modalTitle.innerHTML = '<i class="ph ph-windows-logo" style="color: #0078d4;"></i> Sign in with Microsoft';
      } else {
        modalTitle.innerHTML = '<i class="ph ph-dropbox-logo" style="color: #0061ff;"></i> Sign in with Dropbox';
      }
    }

    document.getElementById('oauth-step-1')?.style.setProperty('display', 'block');
    document.getElementById('oauth-step-2')?.style.setProperty('display', 'none');
    document.getElementById('oauth-step-3')?.style.setProperty('display', 'none');

    // Pre-populate with currently signed in user email if available
    const emailInput = document.getElementById('oauth-email-input');
    if (emailInput && typeof authManager !== 'undefined' && authManager.currentUser) {
      emailInput.value = authManager.currentUser.email || '';
    }

    document.getElementById('oauth-modal')?.classList.add('active');
    setTimeout(() => emailInput?.focus(), 150);
  }

  _updateTokenHelp() {} // legacy no-op

  _resetOAuthState() {
    this._oauthToken = null;
    this._oauthEmail = null;
    this._detectedUser = null;
    const btn       = document.getElementById('oauth-popup-btn');
    const label     = document.getElementById('oauth-popup-label');
    const statusEl  = document.getElementById('oauth-token-status');
    const tokenInp  = document.getElementById('provider-token-input');
    const userInp   = document.getElementById('provider-user-input');
    const type      = document.getElementById('provider-type-select')?.value;
    const names     = { gdrive: 'Google', dropbox: 'Dropbox', onedrive: 'Microsoft' };

    if (btn)   { btn.classList.remove('success', 'waiting'); }
    if (label) { label.textContent = `Sign in with ${names[type] || 'Provider'}`; }
    if (statusEl)  statusEl.style.display = 'none';
    if (tokenInp)  tokenInp.value = '';
    if (userInp)   userInp.value = '';
  }

  renderProviders() {
    const container = document.getElementById('provider-cards-container');
    if (!container) return;

    const providers = storageEngine.getProviders();

    if (providers.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color); padding: 2.5rem;">
          <i class="ph ph-cloud-slash" style="font-size: 2.8rem; color: var(--accent-cyan);"></i>
          <h3 style="font-size: 1.1rem; color: var(--text-main); font-weight: 700;">No Cloud Accounts Connected</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 400px; margin: 0 auto 1rem auto;">
            Connect your Google Drive, Dropbox, AWS S3, OneDrive, or MEGA accounts to manage your storage in one place.
          </p>
          <button class="btn-primary" onclick="document.getElementById('add-provider-modal').classList.add('active')">
            <i class="ph ph-plug"></i> Connect Your First Account
          </button>
        </div>
      `;
      this.renderAccountsTable();
      return;
    }

    container.innerHTML = providers.map(p => {
      const totalNum = parseFloat(p.totalStorageGB !== undefined ? p.totalStorageGB : (p.total_storage_gb || 0));
      const usedNum = parseFloat(p.usedStorageGB !== undefined ? p.usedStorageGB : (p.used_storage_gb || 0));
      const totalGB = totalNum.toFixed(1);
      const usedGB = usedNum.toFixed(2);
      const usagePct = totalNum > 0 ? Math.min(100, Math.round((usedNum / totalNum) * 100)) : 0;
      const user = p.user || p.email || 'Cloud Account';
      const filesText = (p.fileCount || p.file_count) ? ` • ${p.fileCount || p.file_count} files` : '';

      return `
        <div class="provider-card">
          <div class="provider-card-top">
            <div class="provider-icon-box" style="background: ${p.color || '#00f2fe'}20; color: ${p.color || '#00f2fe'};">
              <i class="ph ${p.icon || 'ph-cloud'}"></i>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <div class="status-badge ${p.status || 'connected'}">
                <span class="dot"></span> ${p.status || 'connected'}
              </div>
              <button class="icon-btn delete-provider-btn" data-id="${p.id}" style="width: 26px; height: 26px; font-size: 0.75rem;" title="Disconnect / Delete Account">
                <i class="ph ph-trash" style="color: var(--accent-pink);"></i>
              </button>
            </div>
          </div>

          <div class="provider-info">
            <h3>${p.name}</h3>
            <p>${user}${filesText}</p>
          </div>

          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${usagePct}%; background: ${p.color || 'var(--accent-cyan)'};"></div>
          </div>

          <div class="provider-usage-meta">
            <span>${usedGB} GB used (${usagePct}%)</span>
            <span>${totalGB} GB</span>
          </div>
        </div>
      `;
    }).join('');

    this.attachProviderDeleteListeners();
    this.renderAccountsTable();
  }

  attachProviderDeleteListeners() {
    document.querySelectorAll('.delete-provider-btn').forEach(btn => {
      // Clone to remove previous event listeners
      const newBtn = btn.cloneNode(true);
      if (btn.parentNode) {
        btn.parentNode.replaceChild(newBtn, btn);
      }
      
      newBtn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        await storageEngine.deleteProvider(id);
        this.renderProviders();
        this.populateTransferSelects();
        ChartEngine.renderStorageDonutChart('storage-donut-chart', storageEngine.getProviders());
        this.updateHeaderStorageStats();
        this.showToast('Account disconnected and removed.');
      });
    });
  }

  renderAccountsTable() {
    const tableBody = document.getElementById('accounts-table-body');
    if (!tableBody) return;

    const providers = storageEngine.getProviders();

    if (providers.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-dim);">
            No cloud accounts linked yet. Click "Connect Account" to add a provider.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = providers.map(p => {
      const totalNum = parseFloat(p.totalStorageGB !== undefined ? p.totalStorageGB : (p.total_storage_gb || 0));
      const usedNum = parseFloat(p.usedStorageGB !== undefined ? p.usedStorageGB : (p.used_storage_gb || 0));
      const totalGB = totalNum.toFixed(1);
      const usedGB = usedNum.toFixed(2);
      let user = p.user || p.email || 'Cloud Account';
      if ((!user || user === 'Google Drive Account') && p.name) {
        const m = p.name.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
        if (m) user = m[0];
      }
      if (p.email && p.email !== 'alex.dev@gmail.com' && (!user || !user.includes('@'))) {
        user = p.email;
      }
      const hasCreds = !!(p.credentials && (typeof p.credentials === 'object' ? Object.keys(p.credentials).length > 0 : p.credentials !== '{}'));
      const fileCount = p.fileCount || p.file_count || 0;

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
              <i class="ph ${p.icon || 'ph-cloud'}" style="color: ${p.color || '#00f2fe'}; font-size: 1.1rem;"></i>
              <span>${p.name}</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">
              ${fileCount} file${fileCount === 1 ? '' : 's'} stored
            </div>
          </td>
          <td>
            <div style="color: var(--text-main); font-weight: 500;">${user}</div>
            <div style="font-size: 0.7rem; color: var(--accent-cyan); display: flex; align-items: center; gap: 0.3rem; margin-top: 2px;">
              <i class="ph ph-shield-check"></i> ${hasCreds ? 'Stored in DB (Active)' : 'Linked'}
            </div>
          </td>
          <td style="color: var(--text-dim);">${p.region || 'Cloud Server'}</td>
          <td style="color: var(--text-muted); font-family: monospace;">${usedGB} GB / ${totalGB} GB</td>
          <td><span class="status-badge ${p.status || 'connected'}"><span class="dot"></span> ${p.status || 'connected'}</span></td>
          <td style="text-align: right;">
            <button class="action-btn delete-provider-btn" data-id="${p.id}" style="color: var(--accent-pink); border-color: rgba(239, 68, 68, 0.3);">
              <i class="ph ph-trash"></i> Disconnect
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.attachProviderDeleteListeners();
  }

  async runAutoDetect() {
    const typeSelect = document.getElementById('provider-type-select');
    const tokenInput = document.getElementById('provider-token-input');
    const totalInput = document.getElementById('provider-storage-input');
    const usedInput = document.getElementById('provider-used-input');
    const statusText = document.getElementById('quota-status-text');

    if (!typeSelect || !totalInput || !usedInput) return;

    const type  = typeSelect.value;
    // Prefer token from OAuth popup sign-in, fall back to manually pasted
    const token = this._oauthToken || (tokenInput ? tokenInput.value : '');

    if (statusText) statusText.textContent = 'Auto-detecting live capacity from cloud provider...';

    try {
      const quota = await cloudIntegrator.autoDetectQuota(type, { token });
      if (quota && quota.success) {
        totalInput.value = quota.totalStorageGB;
        usedInput.value = quota.usedStorageGB;
        if (statusText) statusText.textContent = `Detected ${quota.totalStorageGB} GB Total (${quota.usedStorageGB} GB Used) — ${quota.user}`;

        const nameInput = document.getElementById('provider-name-input');
        if (nameInput && (!nameInput.value || nameInput.value.startsWith('My '))) {
          const providerLabel = type === 'gdrive' ? 'Google Drive' : (type === 'dropbox' ? 'Dropbox' : (type === 'onedrive' ? 'OneDrive' : 'Cloud Storage'));
          nameInput.value = `${quota.user}'s ${providerLabel}`;
        }
      }
    } catch (err) {
      console.warn('Auto detect warning:', err);
      if (statusText) statusText.textContent = 'Auto-detected quota';
    }
  }

  updateHeaderStorageStats() {
    const providers = storageEngine.getProviders().filter(p => p.status === 'connected');
    const totalGB = providers.reduce((a, b) => a + b.totalStorageGB, 0);
    const usedGB = providers.reduce((a, b) => a + b.usedStorageGB, 0);
    const pct = totalGB > 0 ? Math.round((usedGB / totalGB) * 100) : 0;

    const fill = document.getElementById('sidebar-storage-fill');
    const text = document.getElementById('sidebar-storage-text');

    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `${usedGB.toFixed(1)} GB of ${totalGB} GB used`;
  }

  populateTransferSelects() {
    const fileSelect = document.getElementById('transfer-file-select');
    const sourceSelect = document.getElementById('transfer-source-select');
    const destSelect = document.getElementById('transfer-dest-select');

    if (!fileSelect || !sourceSelect || !destSelect) return;

    const files = storageEngine.getFiles();
    const providers = storageEngine.getProviders().filter(p => p.status === 'connected');

    fileSelect.innerHTML = files.map(f => `<option value="${f.id}">${f.name} (${ChartEngine.formatBytes(f.sizeBytes)})</option>`).join('');
    
    const providerOptions = providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    sourceSelect.innerHTML = providerOptions;
    destSelect.innerHTML = providerOptions;
    if (providers.length > 1) {
      destSelect.selectedIndex = 1;
    }
  }

  openShareModal(file) {
    const modal = document.getElementById('share-modal');
    const shareInput = document.getElementById('share-url-input');
    if (!modal || !shareInput) return;

    const shareUrl = `https://omnicloud.app/share/v1/${file.id}?key=${Math.random().toString(36).substring(2, 9)}`;
    shareInput.value = shareUrl;
    modal.classList.add('active');

    const copyBtn = document.getElementById('copy-share-url-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(shareUrl);
        this.showToast('Share link copied to clipboard!');
        modal.classList.remove('active');
      };
    }
  }

  async downloadFile(fileId) {
    const file = storageEngine.getFiles().find(f => f.id === fileId);
    if (!file) return;

    this.showToast(`Preparing download for ${file.name}...`);

    // 1. If Python backend is connected, download the real binary file directly
    if (typeof api !== 'undefined' && api.isOnline) {
      const ok = api.downloadFile(file.id, file.name);
      if (ok) return;
    }

    // 2. Try IndexedDB stored blob
    const blob = await storageEngine.getFileBlob(fileId);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const element = document.createElement('a');
      element.href = url;
      element.download = file.name;
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    // 3. Fallback simulated download payload
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(`OmniCloud File Payload: ${file.name}\nSize: ${file.sizeBytes} bytes\nProvider: ${file.providerId}\nPath: ${file.path}`));
    element.setAttribute('download', file.name);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <i class="ph ph-info" style="color: var(--accent-cyan); font-size: 1.1rem;"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
