import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';

// Firebase configuration via environment variables (VITE_ prefix for Vite exposure).
// Fallback values are provided for backward compatibility but should be replaced
// by setting the corresponding VITE_FIREBASE_* variables in .env.local.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyACXWA8amw_44P5sFaby8JvAh8bpV9TadY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "yoobe-billing-app.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "yoobe-billing-app",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "yoobe-billing-app.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "285613634227",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:285613634227:web:d1cfb4141282dd1ad176c6"
};


// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = firebase.firestore();

// Initialize Cloud Storage and get a reference to the service
const storage = firebase.storage();

export { db, storage };