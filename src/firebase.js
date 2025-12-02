// Firebase Configuration and Initialization
// Free Firebase project for cross-device real-time chat syncing
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

// Your Firebase configuration (safe to include in code for public apps)
const firebaseConfig = {
  apiKey: "AIzaSyAjkCxIkg5SuSN_nSLUIuvywR7_2CthnQo",
  authDomain: "my-serene-life.firebaseapp.com",
  projectId: "my-serene-life",
  storageBucket: "my-serene-life.firebasestorage.app",
  messagingSenderId: "501683494796",
  appId: "1:501683494796:web:a7a9d910ec98c2398680a9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Auth
const auth = getAuth(app);

export { db, auth, signInAnonymously };
