/* ==========================================================================
   OmniCloud - Google Drive Auth
   Real OAuth flow - works exactly like WPS Office Google Drive connection.
   One authorization screen first time → automatic forever after.
   ========================================================================== */

// ─── PRODUCTION CLIENT ID ────────────────────────────────────────────────────
// Registered Client ID for OmniCloud Google Drive integration
const OMNICLOUD_GOOGLE_CLIENT_ID = '533884227066-4dv87arq7vrar2tqg571svv83nvkr3b8.apps.googleusercontent.com';
// ─────────────────────────────────────────────────────────────────────────────

class GoogleDriveAuth {
  constructor() {
    this.tokenClient       = null;
    this.accessToken       = null;
    this.onSuccessCallback = null;
    this.onErrorCallback   = null;
    this.SCOPE = 'https://www.googleapis.com/auth/drive.readonly ' +
                 'https://www.googleapis.com/auth/drive.metadata.readonly ' +
                 'https://www.googleapis.com/auth/userinfo.email ' +
                 'https://www.googleapis.com/auth/userinfo.profile';
  }

  /* ── Client ID storage ───────────────────────────────── */
  getClientId() {
    // Production ID (hardcoded) takes priority — works for ALL users on ALL devices
    if (OMNICLOUD_GOOGLE_CLIENT_ID) return OMNICLOUD_GOOGLE_CLIENT_ID;
    // Fallback: user's own Client ID (stored from first-time setup)
    return localStorage.getItem('omnicloud_gdrive_client_id') || '';
  }
  setClientId(id) {
    localStorage.setItem('omnicloud_gdrive_client_id', id.trim());
    this.tokenClient = null;
  }
  hasClientId() { return !!this.getClientId(); }

  /* ── Initialize Google Identity Services ─────────────── */
  init() {
    const clientId = this.getClientId();
    if (!clientId || !window.google?.accounts?.oauth2) return false;
    try {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope:     this.SCOPE,
        callback:  (resp) => {
          if (resp?.access_token) this._handleSuccess(resp.access_token);
          else if (this.onErrorCallback) this.onErrorCallback('No token in response');
        },
        error_callback: (err) => {
          if (this.onErrorCallback) this.onErrorCallback(err?.message || 'cancelled');
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ── Main sign-in entry point ────────────────────────── */
  signIn(onSuccess, onError) {
    this.onSuccessCallback = onSuccess;
    this.onErrorCallback   = onError;

    if (!this.hasClientId()) {
      this._showAuthorizationScreen(() => this._requestToken());
      return;
    }
    this._requestToken();
  }

  _requestToken() {
    if (!this.tokenClient) this.init();
    if (this.tokenClient) {
      try {
        this.tokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (e) { /* fall through */ }
    }
    // Fallback: implicit popup
    this._openImplicitPopup();
  }

  _openImplicitPopup() {
    const id  = this.getClientId();
    const uri = encodeURIComponent(`${location.origin}/oauth_callback.html`);
    const sc  = encodeURIComponent(this.SCOPE);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(id)}&redirect_uri=${uri}&response_type=token&scope=${sc}&prompt=select_account`;
    const w = 520, h = 640,
          l = Math.round(screen.width  / 2 - w / 2),
          t = Math.round(screen.height / 2 - h / 2);
    window.open(url, 'GDriveAuth', `width=${w},height=${h},left=${l},top=${t}`);
  }

  _handleSuccess(token) {
    this.accessToken = token;
    if (this.onSuccessCallback) this.onSuccessCallback(token);
  }

  /* ── Authorization / one-time setup screen ───────────── */

  _showAuthorizationScreen(onAuthorized) {
    document.getElementById('gauth-screen')?.remove();

    const el = document.createElement('div');
    el.id = 'gauth-screen';
    el.innerHTML = `
    <style>
      #gauth-screen {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.82); backdrop-filter: blur(10px);
        z-index: 99999; display: flex; align-items: center; justify-content: center;
        font-family: 'Inter', sans-serif;
        animation: gfadeIn .2s ease;
      }
      @keyframes gfadeIn { from { opacity:0 } to { opacity:1 } }
      @keyframes gslideUp { from { transform:translateY(24px); opacity:0 } to { transform:translateY(0); opacity:1 } }
      #gauth-card {
        background: #fff; border-radius: 12px; width: 100%; max-width: 420px;
        overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,0.5);
        animation: gslideUp .25s ease;
      }
      #gauth-card .g-header {
        padding: 28px 32px 20px;
        display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
        border-bottom: 1px solid #e8eaed;
      }
      #gauth-card .g-logo { display: flex; align-items: center; gap: 10px; }
      #gauth-card .g-logo svg { width: 24px; height: 24px; }
      #gauth-card .g-logo span { font-size: 18px; color: #202124; font-weight: 500; letter-spacing: -.3px; }
      #gauth-card h2 { font-size: 22px; font-weight: 400; color: #202124; margin: 0; line-height: 1.3; }
      #gauth-card .g-sub { font-size: 14px; color: #5f6368; margin: 0; line-height: 1.5; }
      #gauth-card .g-body { padding: 20px 32px 24px; }
      #gauth-card .g-step {
        display: flex; align-items: flex-start; gap: 12px;
        margin-bottom: 14px; font-size: 14px; color: #202124; line-height: 1.5;
      }
      #gauth-card .g-num {
        width: 24px; height: 24px; border-radius: 50%; background: #4285f4;
        color: #fff; font-weight: 700; font-size: 12px;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
      }
      #gauth-card .g-input-row { margin: 18px 0 6px; }
      #gauth-card .g-label { font-size: 12px; font-weight: 500; color: #5f6368; margin-bottom: 6px; }
      #gauth-card input {
        width: 100%; box-sizing: border-box; padding: 10px 14px;
        border: 1.5px solid #dadce0; border-radius: 6px;
        font-size: 14px; color: #202124; outline: none; transition: border-color .15s;
      }
      #gauth-card input:focus { border-color: #4285f4; }
      #gauth-card .g-error { color: #d93025; font-size: 12px; margin-top: 6px; display: none; }
      #gauth-card .g-footer {
        padding: 16px 24px 20px; display: flex; justify-content: flex-end; gap: 10px;
        border-top: 1px solid #e8eaed;
      }
      #gauth-cancel-btn {
        padding: 9px 22px; border: none; background: transparent;
        color: #1a73e8; font-size: 14px; font-weight: 500; cursor: pointer;
        border-radius: 6px; transition: background .15s;
      }
      #gauth-cancel-btn:hover { background: rgba(26,115,232,.08); }
      #gauth-authorize-btn {
        padding: 9px 22px; border: none; background: #1a73e8;
        color: #fff; font-size: 14px; font-weight: 500; cursor: pointer;
        border-radius: 6px; transition: background .15s;
      }
      #gauth-authorize-btn:hover { background: #1765cc; }
    </style>
    <div id="gauth-card">
      <div class="g-header">
        <div class="g-logo">
          <svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          <span>OmniCloud</span>
        </div>
        <h2>Connect Google Drive</h2>
        <p class="g-sub">OmniCloud needs permission to access your Google Drive. This is a one-time authorization.</p>
      </div>

      <div class="g-body">
        <div class="g-step">
          <div class="g-num">1</div>
          <div>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:#1a73e8;">Google Cloud Console → Credentials</a><br>
          <span style="color:#5f6368;font-size:13px;">Sign in with any Google account (free)</span></div>
        </div>
        <div class="g-step">
          <div class="g-num">2</div>
          <div>Click <b>+ Create Credentials → OAuth 2.0 Client ID</b><br>
          Type: <b>Web application</b> &nbsp;·&nbsp; Redirect URI: <code style="font-size:12px; background:#f1f3f4; padding:1px 5px; border-radius:4px;">${location.origin}/oauth_callback.html</code></div>
        </div>
        <div class="g-step">
          <div class="g-num">3</div>
          <div>Copy the <b>Client ID</b> and paste it below</div>
        </div>

        <div class="g-input-row">
          <div class="g-label">GOOGLE OAUTH CLIENT ID</div>
          <input id="gauth-client-input" type="text" placeholder="123456789-xxxx.apps.googleusercontent.com" autocomplete="off" spellcheck="false" />
          <div class="g-error" id="gauth-error">Please enter a valid Client ID</div>
        </div>
      </div>

      <div class="g-footer">
        <button id="gauth-cancel-btn">Cancel</button>
        <button id="gauth-authorize-btn">Authorize OmniCloud</button>
      </div>
    </div>`;

    document.body.appendChild(el);
    setTimeout(() => el.querySelector('#gauth-client-input')?.focus(), 150);

    el.querySelector('#gauth-cancel-btn').onclick = () => el.remove();

    el.querySelector('#gauth-authorize-btn').onclick = () => {
      const val = el.querySelector('#gauth-client-input').value.trim();
      const err = el.querySelector('#gauth-error');
      if (!val || !val.includes('.apps.googleusercontent.com')) {
        err.style.display = 'block';
        el.querySelector('#gauth-client-input').focus();
        return;
      }
      err.style.display = 'none';
      this.setClientId(val);
      el.remove();
      if (onAuthorized) onAuthorized();
    };

    // Enter key on input
    el.querySelector('#gauth-client-input').onkeydown = (e) => {
      if (e.key === 'Enter') el.querySelector('#gauth-authorize-btn').click();
    };
  }
}

/* ── Receive token from OAuth popup callback ─────────── */
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin) return;
  if (ev.data?.type === 'OMNICLOUD_OAUTH_TOKEN' && ev.data.access_token) {
    googleDriveAuth.accessToken = ev.data.access_token;
    if (googleDriveAuth.onSuccessCallback) {
      googleDriveAuth.onSuccessCallback(ev.data.access_token);
    }
  }
});

const googleDriveAuth = new GoogleDriveAuth();
window.addEventListener('load', () => {
  if (window.google?.accounts?.oauth2) googleDriveAuth.init();
});
