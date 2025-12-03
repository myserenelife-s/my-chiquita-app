// Firebase Cloud Messaging Service Worker
// This handles background push notifications when the app is closed

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyAjkCxIkg5SuSN_nSLUIuvywR7_2CthnQo",
  authDomain: "my-serene-life.firebaseapp.com",
  projectId: "my-serene-life",
  storageBucket: "my-serene-life.firebasestorage.app",
  messagingSenderId: "501683494796",
  appId: "1:501683494796:web:a7a9d910ec98c2398680a9"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);

  const notificationTitle = payload.notification?.title || '💬 New Message';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'chat-message',
    requireInteraction: false,
    data: payload.data,
    vibrate: [100, 50, 100],
    timestamp: Date.now()
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  // Open the app when notification is clicked
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes('my-chiquita-app') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow('/my-chiquita-app/');
        }
      })
  );
});
