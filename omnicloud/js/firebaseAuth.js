/* ==========================================================================
   OmniCloud — Firebase Auth Integration
   Handles Google Drive + OneDrive sign-in via Firebase popup flow.
   The user sets up their Firebase project once; after that it's one-click.
   ========================================================================== */

const FIREBASE_CONFIG_KEY = 'omnicloud_firebase_config_v1';

class FirebaseAuthManager {
  constructor() {
    this.app      = null;
    this.auth     = null;
    this.ready    = false;
    this._config  = null;
  }

  /* ── Config storage ──────────────────────────────────── */

  loadConfig() {
    try {
      const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  saveConfig(config) {
    localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
    this._config = config;
  }

  clearConfig() {
    localStorage.removeItem(FIREBASE_CONFIG_KEY);
    this._config  = null;
    this.app      = null;
    this.auth     = null;
    this.ready    = false;
  }

  /* ── Dynamic Firebase initialisation ────────────────── */

  async init() {
    this._config = this.loadConfig();
    if (!this._config) return false;   // no config yet — show setup screen

    try {
      // Load Firebase modules from CDN (module scripts)
      const { initializeApp, getApps, getApp } =
        await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
      const { getAuth } =
        await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');

      // Avoid re-initializing on hot reload
      this.app  = getApps().length ? getApp() : initializeApp(this._config);
      this.auth = getAuth(this.app);
      this.ready = true;
      return true;
    } catch (err) {
      console.error('Firebase init failed:', err);
      return false;
    }
  }

  /* ── Sign-In flows ───────────────────────────────────── */

  /**
   * Sign in with Google via Firebase popup.
   * Returns { token, email, name } on success, null on failure.
   * Requests drive.readonly + drive.file scopes → token works with Drive API.
   */
  async signInWithGoogle() {
    if (!this.ready) throw new Error('Firebase not initialised');

    const { GoogleAuthProvider, signInWithPopup } =
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');

    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.readonly');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(this.auth, provider);
    const cred   = GoogleAuthProvider.credentialFromResult(result);
    return {
      token: cred.accessToken,
      email: result.user.email,
      name:  result.user.displayName
    };
  }

  /**
   * Sign in with Microsoft via Firebase popup.
   * Returns { token, email, name } on success, null on failure.
   * Token works with Microsoft Graph API (Files.Read).
   */
  async signInWithMicrosoft() {
    if (!this.ready) throw new Error('Firebase not initialised');

    const { OAuthProvider, signInWithPopup } =
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');

    const provider = new OAuthProvider('microsoft.com');
    provider.addScope('Files.Read');
    provider.addScope('Files.Read.All');
    provider.addScope('User.Read');
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(this.auth, provider);
    const cred   = OAuthProvider.credentialFromResult(result);
    return {
      token: cred.accessToken,
      email: result.user.email,
      name:  result.user.displayName
    };
  }

  /* ── Config from JSON string (paste from Firebase console) ── */

  parseConfigFromText(text) {
    // Handle both raw JSON and the Firebase SDK snippet format
    // e.g.: const firebaseConfig = { apiKey: "...", ... };
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      // Replace single-line comments and trailing commas
      const cleaned = jsonMatch[0]
        .replace(/\/\/.*$/gm, '')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleaned);
    } catch { return null; }
  }

  isValidConfig(cfg) {
    return cfg && cfg.apiKey && cfg.projectId && cfg.authDomain;
  }
}

const firebaseAuth = new FirebaseAuthManager();
