/**
 * Firebase client SDK initialization for browser-side real-time data.
 *
 * Used for onSnapshot listeners that make the heatmap update live as
 * Cloud Functions sync new GitHub data into Firestore.
 *
 * Config is injected at build time from Firebase Hosting env or .env.local.
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize only on the client. During SSR / static export build, these
// remain null and the real-time hook guards against null before subscribing.
let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (typeof window !== 'undefined') {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export { app, db };
