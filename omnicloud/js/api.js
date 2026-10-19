/* ==========================================================================
   OmniCloud - Python Backend API Client
   Connects frontend to Flask REST API (SQLite database + disk storage)
   ========================================================================== */

class OmniCloudAPI {
  constructor() {
    // ── Backend URL Configuration ────────────────────────────────────────────
    // When running locally (Flask serves both frontend + API on port 5000),
    // use the current origin.
    // When hosted on Netlify (or any external domain), point to your
    // deployed Python backend. Change OMNICLOUD_BACKEND_URL below if needed.
    const OMNICLOUD_BACKEND_URL = ''; // e.g. 'https://your-backend.railway.app'

    const isLocalFlask = window.location.port === '5000' ||
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname === 'localhost';
    const isNetlify    = window.location.hostname === 'omnicloud1.netlify.app';

    if (OMNICLOUD_BACKEND_URL) {
      // Explicit override always wins
      this.baseUrl = OMNICLOUD_BACKEND_URL.replace(/\/$/, '');
    } else if (isLocalFlask) {
      // Local dev: Flask is serving both the page and the API
      this.baseUrl = window.location.origin;
    } else if (isNetlify) {
      // Netlify deployment: API is on a separate server.
      // Set OMNICLOUD_BACKEND_URL above once you have a deployed backend.
      this.baseUrl = 'http://localhost:5000'; // fallback for testing via Netlify
    } else {
      this.baseUrl = window.location.origin;
    }
    // ─────────────────────────────────────────────────────────────────────────

    this.isOnline = false;
    this.serverInfo = null;
    this.onStatusChange = null;
    this.pingInterval = null;
  }

  async init() {
    await this.checkHealth();
    // Periodically check server health every 15 seconds
    if (!this.pingInterval) {
      this.pingInterval = setInterval(() => this.checkHealth(), 15000);
    }
    return this.isOnline;
  }

  /* ── Server Health & Status ──────────────────────────── */

  async checkHealth() {
    const candidates = [this.baseUrl];
    if (this.baseUrl.includes('localhost')) {
      candidates.push('http://127.0.0.1:5000');
    } else if (this.baseUrl.includes('127.0.0.1')) {
      candidates.push('http://localhost:5000');
    }

    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/system/health`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(2500)
        });
        if (res.ok) {
          const data = await res.json();
          this.baseUrl = url;
          const prev = this.isOnline;
          this.isOnline = true;
          this.serverInfo = data;
          if (prev !== true && typeof this.onStatusChange === 'function') {
            this.onStatusChange(true, data);
          }
          this._updateBadgeUI(true, data);
          return data;
        }
      } catch (e) {
        // Try next candidate
      }
    }

    const prev = this.isOnline;
    this.isOnline = false;
    this.serverInfo = null;
    if (prev !== false && typeof this.onStatusChange === 'function') {
      this.onStatusChange(false, null);
    }
    this._updateBadgeUI(false, null);
    return null;
  }

  _updateBadgeUI(online, info) {
    const badge = document.getElementById('backend-status-badge');
    const dot = document.getElementById('backend-status-dot');
    const label = document.getElementById('backend-status-text');

    if (!badge || !dot || !label) return;

    if (online) {
      badge.classList.remove('offline');
      badge.classList.add('online');
      dot.style.background = '#10b981';
      dot.style.boxShadow = '0 0 10px #10b981';
      label.textContent = `Python Backend (v${info?.version || '2.0'})`;
      badge.title = `Python ${info?.python_version || '3.11'} • SQLite Database Active • Click for details`;
    } else {
      badge.classList.remove('online');
      badge.classList.add('offline');
      dot.style.background = '#eab308';
      dot.style.boxShadow = '0 0 8px rgba(234, 179, 8, 0.4)';
      label.textContent = 'Python Backend (Offline)';
      badge.title = 'Python backend offline. Run "python server.py" to connect. Click to start.';
    }
  }

  /* ── Files API ────────────────────────────────────────── */

  async getFiles(filter = {}) {
    if (!this.isOnline) return null;
    try {
      const params = new URLSearchParams();
      if (filter.providerId) params.append('providerId', filter.providerId);
      if (filter.type) params.append('type', filter.type);
      if (filter.path) params.append('path', filter.path);
      if (filter.search) params.append('search', filter.search);
      if (filter.starred !== undefined) params.append('starred', filter.starred);

      const res = await fetch(`${this.baseUrl}/api/files?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        return data.files || [];
      }
    } catch (e) {
      console.warn('API getFiles failed, using local fallback:', e);
    }
    return null;
  }

  async uploadFile(fileObj, path = '/', providerId = 'local_disk') {
    if (!this.isOnline) return null;
    try {
      const formData = new FormData();
      formData.append('file', fileObj);
      formData.append('path', path);
      formData.append('providerId', providerId);

      const res = await fetch(`${this.baseUrl}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        return data.file;
      }
    } catch (e) {
      console.warn('API uploadFile failed:', e);
    }
    return null;
  }

  downloadFile(fileId, fileName) {
    if (this.isOnline) {
      const downloadUrl = `${this.baseUrl}/api/files/${encodeURIComponent(fileId)}/download`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }
    return false;
  }

  async deleteFile(fileId) {
    if (!this.isOnline) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async batchDelete(fileIds) {
    if (!this.isOnline) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/files/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async batchMove(fileIds, targetPath, targetProviderId = null) {
    if (!this.isOnline) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/files/batch-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds, targetPath, targetProviderId })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async createFolder(name, path = '/', providerId = 'local_disk') {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/files/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path, providerId })
      });
      if (res.ok) {
        const data = await res.json();
        return data.file;
      }
    } catch (e) {
      console.warn('API createFolder failed:', e);
    }
    return null;
  }

  async updateFile(fileId, updates) {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/files/${encodeURIComponent(fileId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        return data.file;
      }
    } catch (e) {
      console.warn('API updateFile failed:', e);
    }
    return null;
  }

  async syncFiles(files) {
    if (!this.isOnline || !files?.length) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/files/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  /* ── Providers API ────────────────────────────────────── */

  async getProviders() {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/providers`);
      if (res.ok) {
        const data = await res.json();
        return data.providers || [];
      }
    } catch (e) {
      console.warn('API getProviders failed:', e);
    }
    return null;
  }

  async addProvider(provider) {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider)
      });
      if (res.ok) {
        const data = await res.json();
        return data.provider;
      }
    } catch (e) {
      console.warn('API addProvider failed:', e);
    }
    return null;
  }

  async deleteProvider(providerId) {
    if (!this.isOnline) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/providers/${encodeURIComponent(providerId)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async syncProviders(providers) {
    if (!this.isOnline || !providers?.length) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/providers/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  /* ── Transfers API ────────────────────────────────────── */

  async getTransfers() {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/transfers`);
      if (res.ok) {
        const data = await res.json();
        return data.transfers || [];
      }
    } catch (e) {
      console.warn('API getTransfers failed:', e);
    }
    return null;
  }

  async createTransfer(fileId, sourceProvider, destProvider) {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, sourceProvider, destProvider })
      });
      if (res.ok) {
        const data = await res.json();
        return data.transfer;
      }
    } catch (e) {
      console.warn('API createTransfer failed:', e);
    }
    return null;
  }

  async cancelTransfer(transferId) {
    if (!this.isOnline) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/transfers/${encodeURIComponent(transferId)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async clearTransfers() {
    if (!this.isOnline) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/transfers/clear`, {
        method: 'POST'
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  /* ── Auth API ─────────────────────────────────────────── */

  async login(email, password) {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async register(name, email, password) {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async me() {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/me`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    return null;
  }

  /* ── System / Drive Scanning API ──────────────────────── */

  async scanLocalDisk(path = '') {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/system/scan-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('API scanLocalDisk failed:', e);
    }
    return null;
  }

  async getDiskStats() {
    if (!this.isOnline) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/system/storage`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    return null;
  }
}

const api = new OmniCloudAPI();
