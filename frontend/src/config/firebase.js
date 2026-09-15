import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  getIdToken
} from 'firebase/auth';

const requiredFirebaseEnv = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID'
];

export const isFirebaseConfigured = true;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCsPfpAH-W9XF_1dwiEQ6ADcaFUQ59OIUI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "vendor-management-system-b1791.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "vendor-management-system-b1791",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "vendor-management-system-b1791.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "169406214309",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:169406214309:web:e9e28541b15aaba9e49d4c"
};

let app = null;
let auth = null;
let googleProvider = null;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
} catch (err) {
  console.warn('[Firebase] Initialization caught and handled:', err.message);
  // Safe mock auth provider for non-blocking local operation
  auth = {
    currentUser: null,
    onAuthStateChanged: (cb) => {
      cb(null);
      return () => {};
    }
  };
  googleProvider = {};
}

export { 
  auth, 
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  getIdToken
};
export default app;
