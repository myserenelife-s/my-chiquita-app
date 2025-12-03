const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Send push notification when a message is sent
exports.sendChatNotification = functions.firestore
  .document('push_notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    
    if (data.processed) {
      return null;
    }

    try {
      // Get all user tokens except the sender
      const tokensSnapshot = await admin.firestore()
        .collection('user_tokens')
        .where('userId', '!=', data.senderId)
        .get();

      if (tokensSnapshot.empty) {
        console.log('No recipient tokens found');
        await snap.ref.update({ processed: true });
        return null;
      }

      const tokens = [];
      tokensSnapshot.forEach(doc => {
        tokens.push(doc.data().token);
      });

      // Prepare the notification payload
      const payload = {
        notification: {
          title: '💬 New Message from Partner',
          body: data.message,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'chat-message',
          requireInteraction: false
        },
        data: {
          senderId: data.senderId,
          timestamp: Date.now().toString(),
          click_action: '/my-chiquita-app/'
        }
      };

      // Send to all recipient devices
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokens,
        notification: payload.notification,
        data: payload.data,
        webpush: {
          notification: {
            ...payload.notification,
            vibrate: [100, 50, 100],
            timestamp: Date.now()
          },
          fcmOptions: {
            link: '/my-chiquita-app/'
          }
        }
      });

      console.log(`Successfully sent ${response.successCount} notifications`);
      console.log(`Failed to send ${response.failureCount} notifications`);

      // Mark as processed
      await snap.ref.update({ 
        processed: true,
        sentCount: response.successCount,
        failureCount: response.failureCount
      });

      // Clean up old notifications (keep last 100)
      const oldNotifications = await admin.firestore()
        .collection('push_notifications')
        .where('processed', '==', true)
        .orderBy('timestamp', 'desc')
        .offset(100)
        .get();

      const batch = admin.firestore().batch();
      oldNotifications.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      return response;
    } catch (error) {
      console.error('Error sending notification:', error);
      await snap.ref.update({ 
        processed: true,
        error: error.message 
      });
      return null;
    }
  });

// Clean up old tokens (optional)
exports.cleanupOldTokens = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    const oldTokens = await admin.firestore()
      .collection('user_tokens')
      .where('timestamp', '<', new Date(cutoffTime))
      .get();

    const batch = admin.firestore().batch();
    oldTokens.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Cleaned up ${oldTokens.size} old tokens`);
    return null;
  });
