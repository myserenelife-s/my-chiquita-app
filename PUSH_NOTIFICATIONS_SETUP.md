# 🔔 Push Notifications Setup Guide

## Overview
This guide will help you enable **background push notifications** that work even when the app is closed on iPhone, Android, and Desktop.

## ✅ What You Get
- 📱 **iPhone notifications** when app is closed/screen locked
- 🤖 **Android notifications** with custom sounds and vibration
- 💻 **Desktop notifications** even when browser is minimized
- 🔐 **End-to-end encrypted** messages with push notification preview
- 🌐 **Works across all devices** with Firebase Cloud Messaging

---

## 🚀 Setup Steps

### Step 1: Enable Firebase Cloud Messaging

1. **Go to Firebase Console**: https://console.firebase.google.com
2. **Select your project**: `my-serene-life`
3. **Navigate to** Project Settings (gear icon) > Cloud Messaging tab
4. **Generate VAPID Key** (Web Push certificates):
   - Click "Generate key pair" under "Web Push certificates"
   - Copy the generated key (starts with `B...`)

5. **Update `src/firebase.js`**:
   - Replace the VAPID key on line ~45:
   ```javascript
   vapidKey: 'YOUR_ACTUAL_VAPID_KEY_HERE'
   ```

### Step 2: Deploy Cloud Functions

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase in your project** (if not done):
   ```bash
   cd "/Users/nexteach360/Documents/My Serene Life App for Wife/My chiquita app"
   firebase init
   ```
   - Select: Firestore, Functions, Hosting
   - Choose existing project: my-serene-life
   - Accept defaults for Firestore
   - Choose JavaScript for Functions
   - Accept default for Hosting

4. **Install Function Dependencies**:
   ```bash
   cd functions
   npm install
   cd ..
   ```

5. **Deploy Functions**:
   ```bash
   firebase deploy --only functions
   ```

### Step 3: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Step 4: Test on iPhone

#### For Testing (Development):
1. **Open Safari** on iPhone
2. Navigate to your deployed app URL
3. Tap the **Share button** (square with arrow)
4. Tap **"Add to Home Screen"**
5. Open the app from home screen
6. **Allow notifications** when prompted
7. Test by sending a message from another device

#### For Production:
- Deploy to GitHub Pages or Firebase Hosting
- Users add to home screen for full PWA experience

---

## 🔧 Configuration Details

### Firebase Messaging Service Worker
Location: `public/firebase-messaging-sw.js`

This handles background notifications when app is closed.

### Cloud Function: `sendChatNotification`
Triggers when a new message is added to the `push_notifications` collection and sends push notifications to all other users.

### User Token Storage
Each device's FCM token is stored in `user_tokens` collection with:
- `token`: FCM registration token
- `userId`: User identifier
- `timestamp`: When token was registered

---

## 📱 How It Works

### Sending a Message Flow:
```
1. User types and sends message
   ↓
2. Message encrypted and saved to Firestore
   ↓
3. Notification trigger added to push_notifications collection
   ↓
4. Cloud Function detects new trigger
   ↓
5. Function retrieves recipient FCM tokens
   ↓
6. Function sends push notification via FCM
   ↓
7. Recipient receives notification (even if app is closed)
   ↓
8. Tap notification opens app to chat
```

### Token Registration Flow:
```
1. User logs in and grants notification permission
   ↓
2. App registers service worker
   ↓
3. App requests FCM token with VAPID key
   ↓
4. Token saved to Firestore user_tokens collection
   ↓
5. Token used by Cloud Function to send notifications
```

---

## 🎯 Testing Checklist

### Desktop (Chrome/Firefox/Edge)
- [ ] Enable notifications when prompted
- [ ] Send message - notification appears
- [ ] Minimize browser - notification still works
- [ ] Close browser tab - notification still works

### Android
- [ ] Add app to home screen
- [ ] Enable notifications
- [ ] Lock screen - notifications appear
- [ ] Custom sound and vibration work

### iPhone (Safari)
- [ ] Add app to home screen (REQUIRED)
- [ ] Enable notifications
- [ ] Lock iPhone - notifications appear
- [ ] Tap notification - app opens to chat
- [ ] Background notifications work

---

## 🔍 Troubleshooting

### No Notifications on iPhone
**Issue**: Not receiving notifications when app is closed

**Solutions**:
1. ✅ **MUST add app to Home Screen** - This is required for iOS
2. ✅ Check notification settings: Settings > Safari > Notifications
3. ✅ Ensure app was added from Safari (not Chrome/Firefox)
4. ✅ Grant notification permission when app asks

### VAPID Key Error
**Issue**: Console shows VAPID key error

**Solution**:
1. Go to Firebase Console > Project Settings > Cloud Messaging
2. Generate new Web Push certificate
3. Copy the key and update `src/firebase.js` line ~45

### Cloud Function Not Deploying
**Issue**: `firebase deploy --only functions` fails

**Solutions**:
1. Check you're logged in: `firebase login`
2. Check project ID: `firebase use my-serene-life`
3. Check Node version: `node --version` (should be 18+)
4. Install dependencies: `cd functions && npm install`

### Notifications Not Sending
**Issue**: Message sent but no notification received

**Debug Steps**:
1. Check Firebase Console > Functions > Logs
2. Verify FCM token is saved in Firestore `user_tokens` collection
3. Check `push_notifications` collection for processed: true
4. Check browser console for errors

---

## 💰 Cost Considerations

### Firebase Free Tier (Spark Plan)
- ✅ **Firestore**: 50K reads, 20K writes per day
- ✅ **Cloud Functions**: 125K invocations per month
- ✅ **FCM**: Unlimited messages

**Your Usage** (2 users, ~100 messages/day):
- Firestore writes: ~200/day (well under limit)
- Function calls: ~100/day (3K/month - under limit)
- FCM messages: ~100/day (unlimited)

**Result**: Completely FREE for your use case! 🎉

### If You Need More (Optional Upgrade to Blaze Plan)
Only pay for what you use beyond free tier:
- Functions: $0.40 per million invocations
- Firestore: $0.06 per 100K reads
- Still extremely cheap for personal use

---

## 📊 Monitoring

### Check Notification Delivery
1. **Firebase Console** > Functions > Logs
2. Look for: `Successfully sent X notifications`

### Check User Tokens
1. **Firebase Console** > Firestore > `user_tokens` collection
2. Should see one document per device

### Check Notification Queue
1. **Firestore** > `push_notifications` collection
2. Check `processed: true` and `sentCount`

---

## 🎨 Customization

### Change Notification Sound
Edit `public/firebase-messaging-sw.js`:
```javascript
vibrate: [200, 100, 200], // Custom vibration pattern
```

### Change Notification Icon
Replace `/public/icon-192.png` with your custom icon (192x192px)

### Change Notification Title
Edit `functions/index.js` line ~33:
```javascript
title: 'Your Custom Title',
```

---

## 🔐 Security

### End-to-End Encryption
- ✅ Messages are encrypted BEFORE sending to Firebase
- ✅ Encryption key derived from your password
- ✅ Only you and your wife can decrypt messages
- ✅ Firebase/Google cannot read message content

### Push Notification Security
- ✅ Only shows message preview (not full content)
- ✅ Requires authentication to send messages
- ✅ FCM tokens tied to authenticated users
- ✅ Cloud Functions validate sender

### Firestore Rules
- ✅ All data requires authentication
- ✅ Users can only access their own tokens
- ✅ Only Cloud Functions can delete notifications

---

## 📱 Production Deployment

### Option 1: Firebase Hosting (Recommended)
```bash
npm run build
firebase deploy --only hosting
```

Your app will be live at:
`https://my-serene-life.web.app`

### Option 2: GitHub Pages
1. Build: `npm run build`
2. Push to GitHub
3. Enable GitHub Pages in repository settings
4. Add CNAME if using custom domain

### Post-Deployment
1. Test on real devices (iPhone, Android)
2. Verify notifications work when app is closed
3. Share URL with your wife
4. Both add to home screen for best experience

---

## 🎉 Success Indicators

You've successfully set up push notifications when:

✅ Notification permission granted on device
✅ FCM token visible in Firestore `user_tokens`
✅ Sending message creates entry in `push_notifications`
✅ Cloud Function logs show "Successfully sent X notifications"
✅ Notification received on locked/closed device
✅ Tapping notification opens app to chat

---

## 📞 Support

### Firebase Issues
- Firebase Console: https://console.firebase.google.com
- Firebase Documentation: https://firebase.google.com/docs
- Firebase Support: https://firebase.google.com/support

### PWA Issues
- MDN Web Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- Can I Use PWA: https://caniuse.com/push-api

### App-Specific Issues
Check the browser console (F12) for error messages and logs.

---

**Status**: 🟡 Setup Required (Follow steps above)
**Estimated Setup Time**: 15-20 minutes
**Complexity**: Medium (requires Firebase CLI)
