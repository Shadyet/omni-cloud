/* ==========================================================================
   OmniCloud — Built-in Sign-In / Sign-Up & Session Manager
   ========================================================================== */

class AuthManager {
  constructor() {
    this.STORAGE_KEY = 'omnicloud_auth_session_v1';
    this.currentUser = null;
  }

  /* ── Session ─────────────────────────────────────────── */

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try { this.currentUser = JSON.parse(saved); }
      catch { this.currentUser = null; }
    }

    // Default demo user when nothing is stored
    if (!this.currentUser) {
      this.currentUser = {
        name: 'Alex Dev',
        email: 'alex.dev@gmail.com',
        initials: 'AD'
      };
      this._save();
    }

    this._updateUI();
    this._bindEvents();
  }

  _save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentUser));
  }

  signIn(email, password) {
    if (!email || password.length < 1) return { ok: false, msg: 'Please enter a valid email and password.' };
    const name = email.split('@')[0].replace(/[._-]/g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    this.currentUser = { name, email, initials };
    this._save();
    this._updateUI();
    return { ok: true };
  }

  signUp(name, email, password) {
    if (!name || !email) return { ok: false, msg: 'Name and email are required.' };
    if (password.length < 6) return { ok: false, msg: 'Password must be at least 6 characters.' };
    const initials = name.trim().split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'OC';
    this.currentUser = { name: name.trim(), email: email.trim(), initials };
    this._save();
    this._updateUI();
    return { ok: true };
  }

  signOut() {
    this.currentUser = null;
    localStorage.removeItem(this.STORAGE_KEY);
    this._updateUI();
  }

  /* ── DOM helpers ─────────────────────────────────────── */

  _el(id) { return document.getElementById(id); }

  _updateUI() {
    const u = this.currentUser;

    // Header avatar + name
    const avatarEl   = this._el('user-avatar');
    const nameEl     = this._el('user-name');
    const ddAvatar   = this._el('profile-dropdown-avatar');
    const ddName     = this._el('profile-dropdown-name');
    const ddEmail    = this._el('profile-dropdown-email');
    const pdSignin   = this._el('pd-signin');
    const pdSignout  = this._el('pd-signout');

    if (u) {
      if (avatarEl)  avatarEl.textContent  = u.initials || 'AD';
      if (nameEl)    nameEl.textContent    = u.name || 'Account';
      if (ddAvatar)  ddAvatar.textContent  = u.initials || 'AD';
      if (ddName)    ddName.textContent    = u.name || 'Account';
      if (ddEmail)   ddEmail.textContent   = u.email || '';
      if (pdSignin)  pdSignin.style.display  = 'none';
      if (pdSignout) pdSignout.style.display = '';
    } else {
      if (avatarEl)  avatarEl.textContent  = '?';
      if (nameEl)    nameEl.textContent    = 'Sign In';
      if (ddAvatar)  ddAvatar.textContent  = '?';
      if (ddName)    ddName.textContent    = 'Guest';
      if (ddEmail)   ddEmail.textContent   = 'Not signed in';
      if (pdSignin)  pdSignin.style.display  = '';
      if (pdSignout) pdSignout.style.display = 'none';
    }
  }

  /* ── Event Wiring ────────────────────────────────────── */

  _bindEvents() {
    /* --- Profile dropdown toggle --- */
    const profileBtn = this._el('user-profile-btn');
    const dropdown   = this._el('profile-dropdown');

    if (profileBtn && dropdown) {
      profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', () => dropdown.classList.remove('open'));
    }

    /* --- Dropdown items --- */
    const pdSignin  = this._el('pd-signin');
    const pdSignout = this._el('pd-signout');

    if (pdSignin) {
      pdSignin.addEventListener('click', () => {
        dropdown?.classList.remove('open');
        this._openModal('signin');
      });
    }
    if (pdSignout) {
      pdSignout.addEventListener('click', () => {
        dropdown?.classList.remove('open');
        this.signOut();
        // Show a quick toast if app is available
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast('Signed out successfully.', 'info');
        }
      });
    }

    /* --- Auth Modal tabs --- */
    const tabSignin = this._el('auth-tab-signin');
    const tabSignup = this._el('auth-tab-signup');

    if (tabSignin) tabSignin.addEventListener('click', () => this._switchTab('signin'));
    if (tabSignup) tabSignup.addEventListener('click', () => this._switchTab('signup'));

    /* --- Modal close buttons --- */
    const authModal = this._el('auth-modal');
    if (authModal) {
      authModal.querySelectorAll('.modal-close, .modal-cancel').forEach(el => {
        el.addEventListener('click', () => authModal.classList.remove('active'));
      });
      authModal.addEventListener('click', (e) => {
        if (e.target === authModal) authModal.classList.remove('active');
      });
    }

    /* --- Submit button --- */
    const submitBtn = this._el('auth-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this._handleSubmit());
    }

    /* --- Enter key in inputs --- */
    ['signin-email','signin-password','signup-name','signup-email','signup-password'].forEach(id => {
      const el = this._el(id);
      if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._handleSubmit(); });
    });
  }

  _currentTab = 'signin';

  _openModal(tab = 'signin') {
    const modal = this._el('auth-modal');
    if (!modal) return;
    this._switchTab(tab);
    modal.classList.add('active');
    // Focus first input
    setTimeout(() => {
      const firstInput = tab === 'signin' ? this._el('signin-email') : this._el('signup-name');
      if (firstInput) firstInput.focus();
    }, 80);
  }

  _switchTab(tab) {
    this._currentTab = tab;

    const tabSignin  = this._el('auth-tab-signin');
    const tabSignup  = this._el('auth-tab-signup');
    const panelSignin = this._el('auth-panel-signin');
    const panelSignup = this._el('auth-panel-signup');
    const label       = this._el('auth-submit-label');
    const titleText   = this._el('auth-modal-title-text');

    if (tab === 'signin') {
      tabSignin?.classList.add('active');
      tabSignup?.classList.remove('active');
      if (panelSignin) panelSignin.style.display = '';
      if (panelSignup) panelSignup.style.display = 'none';
      if (label)     label.textContent     = 'Sign In';
      if (titleText) titleText.textContent = 'Sign In to OmniCloud';
    } else {
      tabSignup?.classList.add('active');
      tabSignin?.classList.remove('active');
      if (panelSignup) panelSignup.style.display = '';
      if (panelSignin) panelSignin.style.display = 'none';
      if (label)     label.textContent     = 'Create Account';
      if (titleText) titleText.textContent = 'Create Your Account';
    }

    // Clear errors
    const errSignin = this._el('signin-error');
    const errSignup = this._el('signup-error');
    if (errSignin) errSignin.style.display = 'none';
    if (errSignup) errSignup.style.display = 'none';
  }

  _handleSubmit() {
    if (this._currentTab === 'signin') {
      const email    = this._el('signin-email')?.value?.trim() || '';
      const password = this._el('signin-password')?.value || '';
      const result   = this.signIn(email, password);
      if (!result.ok) {
        const errEl = this._el('signin-error');
        if (errEl) { errEl.textContent = result.msg; errEl.style.display = ''; }
        return;
      }
    } else {
      const name     = this._el('signup-name')?.value?.trim() || '';
      const email    = this._el('signup-email')?.value?.trim() || '';
      const password = this._el('signup-password')?.value || '';
      const result   = this.signUp(name, email, password);
      if (!result.ok) {
        const errEl = this._el('signup-error');
        if (errEl) { errEl.textContent = result.msg; errEl.style.display = ''; }
        return;
      }
    }

    // Close modal on success
    this._el('auth-modal')?.classList.remove('active');

    if (typeof app !== 'undefined' && app.showToast) {
      const greeting = this._currentTab === 'signin' ? 'Welcome back' : 'Account created';
      app.showToast(`${greeting}, ${this.currentUser?.name}! 🎉`, 'success');
    }
  }
}

const authManager = new AuthManager();
document.addEventListener('DOMContentLoaded', () => authManager.init());
