// FIX: Update Firebase imports to use the v8 compatibility layer.
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

// --- INSTRUCTIONS ---
// 1. Go to your Firebase project console: https://console.firebase.google.com/
// 2. In your Project settings, find your web app's configuration object.
// 3. Replace the placeholder values below with your actual Firebase config.
// For better security, use environment variables to store these keys.

export const firebaseConfig = {
  apiKey: "AIzaSyACXWA8amw_44P5sFaby8JvAh8bpV9TadY",
  authDomain: "yoobe-billing-app.firebaseapp.com",
  projectId: "yoobe-billing-app",
  storageBucket: "yoobe-billing-app.firebasestorage.app",
  messagingSenderId: "285613634227",
  appId: "1:285613634227:web:d1cfb4141282dd1ad176c6"
};

// A check to guide the user if the config is not set up
if (firebaseConfig.apiKey.startsWith("AIzaSy...")) {
    const warningStyle = 'color: red; font-size: 14px; font-weight: bold;';
    console.log("%cFirebase config is not set!", warningStyle);
    console.log("Please add your Firebase project configuration in 'services/firebase.ts'. The application will not work correctly without it.");
}


// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = firebase.firestore();

export { db };