import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { firebaseConfig, firebaseEnvironment } from './firebase-config.js';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

console.info(`HCMAI Firebase environment: ${firebaseEnvironment}`);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

const appState = {
  isAuthenticated: false,
  isAdmin: false
};

function setAuthState(nextState) {
  appState.isAuthenticated = nextState.isAuthenticated;
  appState.isAdmin = nextState.isAdmin;
  renderAuthUI();
}

function getAuthErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/account-exists-with-different-credential': 'This email already uses another sign-in method. Sign in with that method, then link Google from Profile.',
    'auth/credential-already-in-use': 'That Google account is already connected to another HCMAI account.',
    'auth/operation-not-allowed': 'Google sign-in is not enabled for this Firebase project yet.',
    'auth/popup-blocked': 'Allow popups for this site and try Google sign-in again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/unauthorized-domain': 'This site domain is not enabled for sign-in in Firebase Authentication.'
  };

  return messages[error.code] || 'Authentication failed. Please try again.';
}

async function hasAdminClaim(user) {
  if (!user) return false;

  const tokenResult = await user.getIdTokenResult();
  return tokenResult.claims.admin === true;
}

function renderAuthUI() {
  const loginButtons = document.querySelectorAll('.auth-button');
  const adminControls = document.querySelectorAll('[data-admin-only]');

  loginButtons.forEach((loginButton) => {
    if (appState.isAuthenticated) {
      loginButton.textContent = appState.isAdmin ? 'Admin' : 'Profile';
      loginButton.classList.add('is-logged-in');
    } else {
      loginButton.textContent = 'Log in';
      loginButton.classList.remove('is-logged-in');
    }
  });

  adminControls.forEach((el) => {
    el.classList.toggle('visible', appState.isAdmin);
  });
}

function validateCredentials({ email, password, confirmPassword, isSignup }) {
  if (!email || !password) {
    return 'Please enter both email and password.';
  }
  if (!EMAIL_PATTERN.test(email)) {
    return 'Please enter a valid email address.';
  }
  if (isSignup) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match.';
    }
  }
  return '';
}

function closeModal(modal) {
  modal.remove();
  document.removeEventListener('keydown', modal._onKeydown);
}

function openAuthModal(mode = 'login') {
  document.getElementById('auth-modal')?.remove();

  const isLoginMode = mode === 'login';
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'auth-modal';

  modal.innerHTML = `
    <div class="auth-sheet" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div class="auth-header">
        <h3 id="auth-title">${isLoginMode ? 'Library Access' : 'Create Account'}</h3>
        <button class="close-auth" type="button" aria-label="Close">✕</button>
      </div>

      <button class="secondary-btn google-sign-in" type="button">Continue with Google</button>
      <p class="auth-divider">Or continue with email</p>

      <form class="auth-form" novalidate>
        <label>
          <span>Email</span>
          <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email" required />
        </label>

        <label>
          <span>Password</span>
          <div class="auth-password-field">
            <input type="password" id="auth-password" placeholder="••••••••" autocomplete="${isLoginMode ? 'current-password' : 'new-password'}" required />
            <button type="button" class="toggle-password" aria-label="Show password">Show</button>
          </div>
        </label>

        ${isLoginMode ? '' : `
        <label>
          <span>Confirm password</span>
          <input type="password" id="auth-confirm-password" placeholder="••••••••" autocomplete="new-password" required />
        </label>`}

        <p class="auth-error" role="alert" hidden></p>

        <button class="primary-btn auth-submit" type="submit">${isLoginMode ? 'Sign In' : 'Sign Up'}</button>

        <div class="auth-links">
          ${isLoginMode ? '<button type="button" class="text-link auth-forgot">Forgot password?</button>' : ''}
          <button type="button" class="text-link auth-toggle">
            ${isLoginMode ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('.auth-form');
  const errorEl = modal.querySelector('.auth-error');
  const submitBtn = modal.querySelector('.auth-submit');
  const emailInput = modal.querySelector('#auth-email');
  const passwordInput = modal.querySelector('#auth-password');
  const confirmInput = modal.querySelector('#auth-confirm-password');
  const togglePasswordBtn = modal.querySelector('.toggle-password');
  const googleButton = modal.querySelector('.google-sign-in');

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  modal.querySelector('.close-auth').addEventListener('click', () => closeModal(modal));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal(modal);
  });

  modal._onKeydown = (event) => {
    if (event.key === 'Escape') closeModal(modal);
  };
  document.addEventListener('keydown', modal._onKeydown);

  togglePasswordBtn.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePasswordBtn.textContent = isHidden ? 'Hide' : 'Show';
    togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });

  googleButton.addEventListener('click', async () => {
    googleButton.disabled = true;
    showError('');
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, googleProvider);
      closeModal(modal);
    } catch (error) {
      showError(getAuthErrorMessage(error));
    } finally {
      googleButton.disabled = false;
    }
  });

  modal.querySelector('.auth-toggle').addEventListener('click', () => {
    closeModal(modal);
    openAuthModal(isLoginMode ? 'signup' : 'login');
  });

  modal.querySelector('.auth-forgot')?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!EMAIL_PATTERN.test(email)) {
      showError('Enter your account email above, then tap "Forgot password?" again.');
      emailInput.focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      closeModal(modal);
      alert(`Password reset email sent to ${email}.`);
    } catch (error) {
      showError(getAuthErrorMessage(error));
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmInput?.value;

    const validationError = validateCredentials({ email, password, confirmPassword, isSignup: !isLoginMode });
    if (validationError) {
      showError(validationError);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isLoginMode ? 'Signing in...' : 'Creating account...';
    showError('');

    try {
      await setPersistence(auth, browserLocalPersistence);
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      closeModal(modal);
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
      showError(getAuthErrorMessage(error));
    }
  });

  emailInput.focus();
}

function closeProfileMenu() {
  const existing = document.getElementById('profile-menu');
  if (!existing) return;
  existing.remove();
  document.removeEventListener('keydown', existing._onKeydown);
  document.removeEventListener('click', existing._onOutsideClick);
}

function openProfileMenu(anchorButton) {
  closeProfileMenu();

  const menu = document.createElement('div');
  menu.id = 'profile-menu';
  menu.className = 'profile-menu';
  const email = auth.currentUser?.email || 'Signed in';
  const hasGoogleProvider = auth.currentUser?.providerData.some((provider) => provider.providerId === 'google.com');

  menu.innerHTML = `
    <p class="profile-menu-email">${appState.isAdmin ? 'Admin account' : 'Signed in as'}</p>
    <p class="profile-menu-email-value"></p>
    <p class="profile-menu-status" role="status" hidden></p>
    ${hasGoogleProvider ? '' : '<button type="button" class="text-link profile-google-link">Link Google account</button>'}
    <button type="button" class="text-link profile-logout">Log out</button>
  `;
  menu.querySelector('.profile-menu-email-value').textContent = email;

  menu.querySelector('.profile-google-link')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const status = menu.querySelector('.profile-menu-status');
    button.disabled = true;
    button.textContent = 'Connecting...';
    status.hidden = true;
    try {
      await linkWithPopup(auth.currentUser, googleProvider);
      closeProfileMenu();
    } catch (error) {
      status.textContent = getAuthErrorMessage(error);
      status.hidden = false;
      button.disabled = false;
      button.textContent = 'Link Google account';
    }
  });

  document.body.appendChild(menu);

  const rect = anchorButton.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.top = `${window.scrollY + rect.bottom + 8}px`;
  menu.style.right = `${document.documentElement.clientWidth - (rect.right + window.scrollX)}px`;

  menu.querySelector('.profile-logout').addEventListener('click', () => {
    closeProfileMenu();
    signOut(auth).catch((error) => {
      console.error('Sign out failed.', error);
    });
  });

  menu._onKeydown = (event) => {
    if (event.key === 'Escape') closeProfileMenu();
  };
  menu._onOutsideClick = (event) => {
    if (!menu.contains(event.target) && event.target !== anchorButton) closeProfileMenu();
  };
  document.addEventListener('keydown', menu._onKeydown);
  // Deferred so the opening click doesn't immediately trigger the outside-click handler.
  setTimeout(() => document.addEventListener('click', menu._onOutsideClick), 0);
}

function bindAuth() {
  const loginButtons = document.querySelectorAll('.auth-button');
  loginButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (appState.isAuthenticated) {
        const isMenuOpen = document.getElementById('profile-menu');
        if (isMenuOpen) {
          closeProfileMenu();
        } else {
          openProfileMenu(button);
        }
        return;
      }
      openAuthModal('login');
    });
  });

  const adminControls = document.querySelectorAll('[data-admin-only]');
  adminControls.forEach((button) => {
    button.addEventListener('click', () => {
      if (!appState.isAdmin) {
        openAuthModal('login');
      }
    });
  });
}

bindAuth();
renderAuthUI();

onAuthStateChanged(auth, async (user) => {
  let isAdmin = false;

  try {
    isAdmin = await hasAdminClaim(user);
  } catch (error) {
    console.error('Unable to verify account claims.', error);
  }

  closeProfileMenu();
  setAuthState({
    isAuthenticated: Boolean(user),
    isAdmin
  });
});

export { auth };
