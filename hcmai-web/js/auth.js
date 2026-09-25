import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { firebaseConfig, firebaseEnvironment } from './firebase-config.js';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

console.info(`HCMAI Firebase environment: ${firebaseEnvironment}`);

const appState = {
  isAuthenticated: false,
  isAdmin: false,
  errorMessage: ''
};

function setAuthState(nextState) {
  appState.isAuthenticated = nextState.isAuthenticated;
  appState.isAdmin = nextState.isAdmin;
  appState.errorMessage = nextState.errorMessage || '';
  renderAuthUI();
}

function getAuthErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.'
  };

  return messages[error.code] || 'Authentication failed. Please try again.';
}

async function hasAdminClaim(user) {
  if (!user) return false;

  const tokenResult = await user.getIdTokenResult();
  return tokenResult.claims.admin === true;
}

function renderAuthUI() {
  const loginButton = document.querySelector('.auth-button');
  const adminControls = document.querySelectorAll('[data-admin-only]');

  if (loginButton) {
    if (appState.isAuthenticated) {
      loginButton.textContent = appState.isAdmin ? 'Admin' : 'Profile';
      loginButton.classList.add('is-logged-in');
    } else {
      loginButton.textContent = 'Log in';
      loginButton.classList.remove('is-logged-in');
    }
  }

  adminControls.forEach((el) => {
    el.classList.toggle('visible', appState.isAdmin);
  });
}

function openAuthModal(mode = 'login') {
  const existing = document.getElementById('auth-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'auth-modal';

  const isLoginMode = mode === 'login';
  modal.innerHTML = `
    <div class="auth-sheet">
      <div class="auth-header">
        <h3>${isLoginMode ? 'Library Access' : 'Create Account'}</h3>
        <button class="close-auth" type="button" aria-label="Close">✕</button>
      </div>

      <div class="auth-form">
        <label>
          <span>Email</span>
          <input type="email" id="auth-email" placeholder="you@example.com" />
        </label>

        <label>
          <span>Password</span>
          <input type="password" id="auth-password" placeholder="••••••••" />
        </label>

        ${appState.errorMessage ? `<p class="auth-error">${appState.errorMessage}</p>` : ''}

        <button class="primary-btn auth-submit" type="button">${isLoginMode ? 'Sign In' : 'Sign Up'}</button>

        <button class="text-link auth-toggle" type="button">
          ${isLoginMode ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('.close-auth');
  const submitBtn = modal.querySelector('.auth-submit');
  const toggleBtn = modal.querySelector('.auth-toggle');

  closeBtn.addEventListener('click', () => modal.remove());

  submitBtn.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
      setAuthState({
        isAuthenticated: false,
        isAdmin: false,
        errorMessage: 'Please enter both email and password.'
      });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isLoginMode ? 'Signing in...' : 'Creating account...';

    try {
      await setPersistence(auth, browserLocalPersistence);
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      modal.remove();
    } catch (error) {
      setAuthState({
        isAuthenticated: false,
        isAdmin: false,
        errorMessage: getAuthErrorMessage(error)
      });
      modal.remove();
      openAuthModal(mode);
    }
  });

  toggleBtn.addEventListener('click', () => {
    const nextMode = isLoginMode ? 'signup' : 'login';
    modal.remove();
    openAuthModal(nextMode);
  });
}

function bindAuth() {
  const loginButtons = document.querySelectorAll('.auth-button');
  loginButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (appState.isAuthenticated) {
        signOut(auth).catch((error) => {
          setAuthState({
            isAuthenticated: true,
            isAdmin: appState.isAdmin,
            errorMessage: getAuthErrorMessage(error)
          });
        });
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
        return;
      }
      alert('Admin add-raag flow');
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

  setAuthState({
    isAuthenticated: Boolean(user),
    isAdmin,
    errorMessage: ''
  });
});

export { auth };
