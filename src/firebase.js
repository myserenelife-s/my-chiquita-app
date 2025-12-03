// Firebase Configuration and Initialization
// Free Firebase project for cross-device real-time chat syncing + Push Notifications
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

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

// Initialize Firebase Cloud Messaging
let messaging = null;
try {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
} catch (error) {
  console.log('FCM not supported:', error);
}

// Request notification permission and get FCM token
export const requestFCMToken = async () => {
  if (!messaging) {
    console.log('Messaging not initialized');
    return null;
  }

  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('Service Worker registered:', registration);

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Get FCM token
      const token = await getToken(messaging, {
        vapidKey: 'BK0qLFEME26BeKsVME8JzXKnKYVCFCrnwKqByPO0PGzsRBH4jRqCeBeoWDJm1H5OFm8jbes2Y7cWLDOlkPQkPds',
        serviceWorkerRegistration: registration
      });
      
      console.log('FCM Token:', token);
      return token;
    } else {
      console.log('Notification permission denied');
      return null;
    }
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
};

// Handle foreground messages
export const onForegroundMessage = (callback) => {
  if (!messaging) return () => {};
  
  return onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);
    callback(payload);
  });
};

export { db, auth, signInAnonymously, messaging };
