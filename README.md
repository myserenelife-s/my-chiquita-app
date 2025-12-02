# My Serene Life PWA

A private, holistic Progressive Web App for daily life and secure connection.

## Features

- 📖 Daily Quranic reflections
- 🕌 Prayer time notifications
- 📅 Period cycle tracker
- 💆‍♀️ Natural beauty trends
- 📸 Secure moments storage
- 💬 Private partner chat
- 📿 Dhikr counter
- 🙏 Gratitude logging
- 🔊 Quran recitation (TTS)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and add your credentials:

```bash
cp .env.example .env
```

Then edit `.env` with your:
- Firebase project credentials
- Gemini API key for TTS

### 3. Add Icons

Place your PWA icons in the `public` folder:
- `icon-192.png` (192x192px)
- `icon-512.png` (512x512px)

### 4. Run Development Server

```bash
npm run dev
```

Visits `http://localhost:3000`

### 5. Build for Production

```bash
npm run build
```

Output will be in the `dist` folder.

### 6. Preview Production Build

```bash
npm run preview
```

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **Firebase** - Backend (Auth, Firestore, Storage)
- **Tailwind CSS** - Styling (via inline classes)
- **Lucide React** - Icons
- **Workbox** - Service worker & PWA features

## Project Structure

```
my-serene-life/
├── src/
│   ├── App.jsx          # Main application component
│   └── main.jsx         # React entry point
├── public/
│   ├── icon-192.png     # PWA icon (add this)
│   └── icon-512.png     # PWA icon (add this)
├── index.html           # HTML template
├── vite.config.js       # Vite & PWA configuration
├── package.json         # Dependencies
└── .env                 # Environment variables (create from .env.example)
```

## Deployment

Deploy the `dist` folder to any static hosting service:
- **Firebase Hosting**: `firebase deploy`
- **Vercel**: Connect GitHub repo
- **Netlify**: Drag & drop `dist` folder
- **GitHub Pages**: Use GitHub Actions

## License

Private use only.
