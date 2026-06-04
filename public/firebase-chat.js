const firebaseChatConfig = {
  apiKey: "AIzaSyCC1h97K_Q_IW8S5rvoCVZbnSGDNDrEKqU",
  authDomain: "routehub-auth.firebaseapp.com",
  projectId: "routehub-auth",
  storageBucket: "routehub-auth.firebasestorage.app",
  messagingSenderId: "900321120973",
  appId: "1:900321120973:web:4fd1b7bc0e1699ed3b0f84"
};

let firebaseChatDb = null;
let firebaseChatAuth = {
  currentUser: null,
  signOut: async () => {}
};
let cachedSessionUser = null;

function escapeChatHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getSessionUser() {
  if (cachedSessionUser) {
    return cachedSessionUser;
  }

  const response = await fetch('/api/me', {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });

  if (!response.ok) {
    throw new Error('UNAUTHORIZED');
  }

  cachedSessionUser = await response.json();
  return cachedSessionUser;
}

async function ensureFirebaseUser() {
  if (!firebaseChatAuth || typeof firebaseChatAuth.signInAnonymously !== 'function') {
    return null;
  }

  if (!firebaseChatAuth.currentUser) {
    await firebaseChatAuth.signInAnonymously();
  }

  return new Promise((resolve) => {
    const unsub = firebaseChatAuth.onAuthStateChanged((user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
  });
}

function getAppChatUserId(userId) {
  return `app_${String(userId)}`;
}

function getLoadChatId(loadId, clientUserId, carrierUserId) {
  return `load_${String(loadId)}_client_${getAppChatUserId(clientUserId)}_carrier_${getAppChatUserId(carrierUserId)}`;
}

if (typeof window.firebase !== 'undefined') {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseChatConfig);
  }

  firebaseChatDb = firebase.firestore();
  firebaseChatAuth = firebase.auth();
} else {
  console.warn('Firebase SDK is unavailable, chat helpers will run in fallback mode.');
}

window.RouteHubFirebaseChat = {
  auth: firebaseChatAuth,
  db: firebaseChatDb,
  ensureFirebaseUser,
  escapeHtml: escapeChatHtml,
  getAppChatUserId,
  getLoadChatId,
  getSessionUser
};
