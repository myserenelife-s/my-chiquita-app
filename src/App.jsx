import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Home, Calendar, Heart, Send, Moon, MessageCircle, CloudSun, UploadCloud, ChevronRight, Check, Target, RefreshCw, Plus, Clock, Volume2, Mic, Book, Star, Sparkles, Scissors, ExternalLink, Bookmark, Compass, Bell, Navigation, Lock } from 'lucide-react';
import { ALLAH_NAMES, getTodaysName } from './allahNames';
import { HIJAB_STYLES, getTodaysStyle } from './hijabStyles';
import { db, auth, signInAnonymously } from './firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';

// --- CONFIGURATION AND SETUP ---
// Firebase syncs: period tracking, dhikr, gratitude across devices
// Local-only (private): chat messages and moments stay on each device
const USE_FIREBASE = true; // Firebase active for non-private data

// Simple password protection (just for you and your wife)
// Change this password to whatever you want!
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || "fallback";

// Encryption key for end-to-end encryption (shared between you and your wife)
// This is derived from your password - only you two know it!
const ENCRYPTION_KEY_MATERIAL = APP_PASSWORD + '_serene_life_e2e_2024';

// --- ENCRYPTION UTILITIES ---
// Encrypt and decrypt messages so Google/Firebase cannot read them
const getEncryptionKey = async () => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(ENCRYPTION_KEY_MATERIAL),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    
    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode('serene_life_salt_2024'),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

const encryptMessage = async (text) => {
    try {
        const encoder = new TextEncoder();
        const key = await getEncryptionKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoder.encode(text)
        );
        
        // Combine IV and encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);
        
        // Convert to base64 for storage
        return btoa(String.fromCharCode(...combined));
    } catch (error) {
        console.error('Encryption error:', error);
        return null;
    }
};

const decryptMessage = async (text) => {
    // Check if message is already plain text (old messages before encryption)
    // Encrypted messages are base64 and typically longer than 50 chars
    try {
        // Try to decode as base64 first
        const testDecode = atob(text);
        // If it's not base64, it will throw an error and we return plain text
    } catch (e) {
        // Not base64, likely plain text from before encryption was added
        return text;
    }
    
    // If it's too short, it's probably plain text
    if (text.length < 20) {
        return text;
    }
    
    try {
        const decoder = new TextDecoder();
        const key = await getEncryptionKey();
        
        // Decode from base64
        const combined = Uint8Array.from(atob(text), c => c.charCodeAt(0));
        
        // Check if data is long enough to have IV
        if (combined.length < 13) {
            return text; // Too short to be encrypted, return as-is
        }
        
        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encrypted
        );
        
        return decoder.decode(decrypted);
    } catch (error) {
        // If decryption fails, it might be plain text, return as-is
        console.log('Decryption failed, showing as plain text:', error.message);
        return text;
    }
};

// Helper functions for localStorage
const STORAGE_KEYS = {
    PERIOD_DATA: 'serene_life_period_data',
    MOMENTS: 'serene_life_moments',
    CHAT_MESSAGES: 'serene_life_chat',
    DHIKR_COUNT: 'serene_life_dhikr',
    GRATITUDE: 'serene_life_gratitude',
    LEARNED_NAMES: 'serene_life_learned_names',
    SAVED_OUTFITS: 'serene_life_saved_outfits'
};

const saveToStorage = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('Storage error:', e);
    }
};

const getFromStorage = (key, defaultValue = []) => {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
        console.error('Storage error:', e);
        return defaultValue;
    }
};

// Prayer times will be fetched from Aladhan API based on user location
// This is a free, no-authentication-required API for accurate Islamic prayer times

// 30 Rotating Daily Quran Verses - Real verses with proper references (English & Turkish)
const DAILY_QURAN_VERSES = [
    { theme: "Patience (Sabr)", themeTr: "Sabır", verse: "And seek help through patience and prayer, and indeed, it is difficult except for the humbly submissive [to Allah].", verseTr: "Sabır ve namazla yardım dileyin. Şüphesiz bu, huşû duyanlardan başkasına zor gelir.", reference: "Quran 2:45", referenceTr: "Kur'an 2:45" },
    { theme: "Gratitude (Shukr)", themeTr: "Şükür", verse: "If you are grateful, I will certainly give you increase; but if you are ungrateful, My punishment is truly severe.", verseTr: "Eğer şükrederseniz, size (nimetimi) elbette artırırım. Eğer nankörlük ederseniz, şüphesiz azabım çok şiddetlidir.", reference: "Quran 14:7", referenceTr: "Kur'an 14:7" },
    { theme: "Trust (Tawakkul)", themeTr: "Tevekkül", verse: "And whoever relies upon Allah - then He is sufficient for him. Indeed, Allah will accomplish His purpose.", verseTr: "Kim Allah'a tevekkül ederse, O kendisine yeter. Şüphesiz Allah, emrini yerine getirendir.", reference: "Quran 65:3", referenceTr: "Kur'an 65:3" },
    { theme: "Kindness", themeTr: "İyilik", verse: "Show kindness to parents, and to kindred, and orphans, and the needy, and to the neighbor who is near of kin.", verseTr: "Ana babaya, akrabaya, yetimlere, yoksullara, yakın komşuya, uzak komşuya iyilik edin.", reference: "Quran 4:36", referenceTr: "Kur'an 4:36" },
    { theme: "Forgiveness", themeTr: "Af", verse: "And let them pardon and overlook. Would you not like that Allah should forgive you? And Allah is Forgiving and Merciful.", verseTr: "Affetsinler ve kusurları örtbas etsinler. Allah'ın sizi bağışlamasını istemez misiniz? Allah Bağışlayıcı'dır, Merhametli'dir.", reference: "Quran 24:22", referenceTr: "Kur'an 24:22" },
    { theme: "Hope", themeTr: "Ümit", verse: "So verily, with the hardship, there is relief. Verily, with the hardship, there is relief.", verseTr: "Şüphesiz zorlukla beraber bir kolaylık vardır. Şüphesiz zorlukla beraber bir kolaylık vardır.", reference: "Quran 94:5-6", referenceTr: "Kur'an 94:5-6" },
    { theme: "Charity", themeTr: "Sadaka", verse: "The example of those who spend their wealth in the way of Allah is like a seed of grain that grows seven ears.", verseTr: "Mallarını Allah yolunda harcayanların durumu, yedi başak bitiren ve her başakta yüz tane bulunan bir tohum gibidir.", reference: "Quran 2:261", referenceTr: "Kur'an 2:261" },
    { theme: "Honesty", themeTr: "Dürüstlük", verse: "O you who have believed, fear Allah and be with those who are true.", verseTr: "Ey iman edenler! Allah'tan korkun ve doğru olanlarla beraber olun.", reference: "Quran 9:119", referenceTr: "Kur'an 9:119" },
    { theme: "Knowledge", themeTr: "İlim", verse: "Say, 'Are those who know equal to those who do not know?' Only they will remember who are people of understanding.", verseTr: "De ki: 'Bilenlerle bilmeyenler bir olur mu?' Ancak akıl sahipleri öğüt alır.", reference: "Quran 39:9", referenceTr: "Kur'an 39:9" },
    { theme: "Peace", themeTr: "Huzur", verse: "And the servants of the Most Merciful are those who walk upon the earth in humility.", verseTr: "Rahman'ın kulları, yeryüzünde alçak gönüllülükle yürürler.", reference: "Quran 25:63", referenceTr: "Kur'an 25:63" },
    { theme: "Prayer", themeTr: "Namaz", verse: "Guard strictly your prayers, especially the middle prayer. And stand before Allah with obedience.", verseTr: "Namazları ve orta namazı koruyun. Allah için tam bir boyun eğişle kalkın.", reference: "Quran 2:238", referenceTr: "Kur'an 2:238" },
    { theme: "Faith", themeTr: "İman", verse: "Indeed, those who have believed and done righteous deeds - the Most Merciful will appoint for them affection.", verseTr: "İman edip salih amel işleyenlere, Rahman onlar için bir sevgi yaratacaktır.", reference: "Quran 19:96", referenceTr: "Kur'an 19:96" },
    { theme: "Mercy", themeTr: "Merhamet", verse: "And My mercy encompasses all things. So I will decree it for those who fear Me and give zakah.", verseTr: "Benim rahmetim her şeyi kaplamıştır. Onu Benden korkan, zekat veren kimselere yazacağım.", reference: "Quran 7:156", referenceTr: "Kur'an 7:156" },
    { theme: "Justice", themeTr: "Adalet", verse: "O you who have believed, be persistently standing firm in justice, witnesses for Allah.", verseTr: "Ey iman edenler! Allah için şahitler olarak adaleti ayakta tutan kimseler olun.", reference: "Quran 4:135", referenceTr: "Kur'an 4:135" },
    { theme: "Humility", themeTr: "Tevazu", verse: "And do not turn your cheek in contempt toward people and do not walk through the earth exultantly.", verseTr: "İnsanlara karşı küçümseyerek yüz çevirme ve yeryüzünde böbürlenerek yürüme.", reference: "Quran 31:18", referenceTr: "Kur'an 31:18" },
    { theme: "Repentance", themeTr: "Tevbe", verse: "And turn to Allah in repentance, all of you, O believers, that you might succeed.", verseTr: "Ey müminler! Hepiniz Allah'a tevbe edin ki kurtuluşa eresiniz.", reference: "Quran 24:31", referenceTr: "Kur'an 24:31" },
    { theme: "Remembrance", themeTr: "Zikir", verse: "Those who have believed and whose hearts are assured by the remembrance of Allah. Unquestionably, by the remembrance of Allah hearts are assured.", verseTr: "O kimseler ki iman ettiler ve kalpleri Allah'ın zikriyle mutmain oldu. Bilin ki kalpler ancak Allah'ın zikri ile huzur bulur.", reference: "Quran 13:28", referenceTr: "Kur'an 13:28" },
    { theme: "Family", themeTr: "Aile", verse: "And We have enjoined upon man goodness to parents. But if they endeavor to make you associate with Me that of which you have no knowledge, do not obey them.", verseTr: "İnsana anne babasına iyi davranmasını emrettik. Fakat sana hakkında bilgin olmayan bir şeyi Bana ortak koşman için çaba gösterirlerse, onlara itaat etme.", reference: "Quran 29:8", referenceTr: "Kur'an 29:8" },
    { theme: "Righteousness", themeTr: "Takva", verse: "It is not righteousness that you turn your faces toward the east or the west, but righteousness is in one who believes in Allah.", verseTr: "İyilik, yüzünüzü doğuya ve batıya çevirmeniz değildir. Asıl iyilik, Allah'a iman edenin iyiliğidir.", reference: "Quran 2:177", referenceTr: "Kur'an 2:177" },
    { theme: "Perseverance", themeTr: "Sebat", verse: "O you who have believed, persevere and endure and remain stationed and fear Allah that you may be successful.", verseTr: "Ey iman edenler! Sabredin, sabirda yarışın, sebat edin ve Allah'tan korkun ki kurtuluşa eresiniz.", reference: "Quran 3:200", referenceTr: "Kur'an 3:200" },
    { theme: "Brotherhood", themeTr: "Kardeşlik", verse: "The believers are but brothers, so make settlement between your brothers. And fear Allah that you may receive mercy.", verseTr: "Müminler ancak kardeştirler. Öyleyse kardeşlerinizin arasını düzeltin ve Allah'tan korkun ki size merhamet edilsin.", reference: "Quran 49:10", referenceTr: "Kur'an 49:10" },
    { theme: "Guidance", themeTr: "Hidayet", verse: "This is the Book about which there is no doubt, a guidance for those conscious of Allah.", verseTr: "Bu, kendisinde şüphe olmayan Kitap'tır; Allah'tan korkanlar için bir hidayettir.", reference: "Quran 2:2", referenceTr: "Kur'an 2:2" },
    { theme: "Protection", themeTr: "Koruma", verse: "For him are successive angels before and behind him who protect him by the decree of Allah.", verseTr: "Onun için önünden ve arkasından takip eden melekler vardır ki, Allah'ın emriyle onu korurlar.", reference: "Quran 13:11", referenceTr: "Kur'an 13:11" },
    { theme: "Contentment", themeTr: "Kanaat", verse: "Allah does not burden a soul beyond that it can bear. It will have what it has gained, and it will bear what it has earned.", verseTr: "Allah bir kimseyi ancak gücünün yettiği şeyle yükümlü kılar. Onun kazandığı lehine, yaptığı da aleyhinedir.", reference: "Quran 2:286", referenceTr: "Kur'an 2:286" },
    { theme: "Good Character", themeTr: "Güzel Ahlak", verse: "And indeed, you are of a great moral character.", verseTr: "Ve şüphesiz sen, yüce bir ahlak üzeresin.", reference: "Quran 68:4", referenceTr: "Kur'an 68:4" },
    { theme: "Worship", themeTr: "İbadet", verse: "And I did not create the jinn and mankind except to worship Me.", verseTr: "Ben cinleri ve insanları, ancak Bana ibadet etsinler diye yarattım.", reference: "Quran 51:56", referenceTr: "Kur'an 51:56" },
    { theme: "Steadfastness", themeTr: "İstikamet", verse: "So remain on a right course as you have been commanded, you and those who have turned back with you to Allah.", verseTr: "Öyleyse emrolunduğun gibi sen ve seninle beraber tevbe edenler dosdoğru olun.", reference: "Quran 11:112", referenceTr: "Kur'an 11:112" },
    { theme: "Generosity", themeTr: "Cömertlik", verse: "Who is it that would loan Allah a goodly loan so He will multiply it for him and he will have a noble reward?", verseTr: "Allah'a güzel bir borç verecek kimdir ki, Allah onu kat kat arttırsın ve onun için değerli bir mükafat olsun?", reference: "Quran 57:11", referenceTr: "Kur'an 57:11" },
    { theme: "Truth", themeTr: "Hak", verse: "And say, 'Truth has come, and falsehood has departed. Indeed, falsehood is ever bound to depart.'", verseTr: "Ve de ki: 'Hak geldi, batıl yok oldu. Şüphesiz batıl, yok olmaya mahkumdur.'", reference: "Quran 17:81", referenceTr: "Kur'an 17:81" },
    { theme: "Love", themeTr: "Sevgi", verse: "And of His signs is that He created for you from yourselves mates that you may find tranquility in them; and He placed between you affection and mercy.", verseTr: "O'nun ayetlerinden biri de, size nefislerinizden eşler yaratması, onlara huzur bulmanız ve aranızda sevgi ve merhamet var etmesidir.", reference: "Quran 30:21", referenceTr: "Kur'an 30:21" }
];

// Function to get today's verse based on day of month (rotates every 30 days)
const getTodaysVerse = () => {
    const dayOfMonth = new Date().getDate(); // 1-31
    const index = (dayOfMonth - 1) % DAILY_QURAN_VERSES.length;
    return DAILY_QURAN_VERSES[index];
};

const BEAUTY_TRENDS_KEYS = [
    { titleKey: "trend1Title", descKey: "trend1Desc" },
    { titleKey: "trend2Title", descKey: "trend2Desc" },
    { titleKey: "trend3Title", descKey: "trend3Desc" },
];

// Data for the TTS component (Surahs/Duas) - Stored outside translations as it's Arabic
const QURAN_PRAYERS = [
    { name: "Surah Al-Fatiha (The Opening)", text: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ مَٰلِكِ يَوْمِ ٱلدِّينِ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ" },
    { name: "Ayat al-Kursi (The Throne Verse)", text: "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ وَلَا يُحِيطُونَ بِشَىْءٍ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتُ وَٱٱلْأَرْضَ وَلَا يَئُودُهُۥ حِفْظُهُمَا وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ" },
    { name: "Surah Al-Ikhlas (Sincerity)", text: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ هُوَ ٱللَّهُ أَحَدٌ ٱللَّهُ ٱلصَّمَدُ لَمْ يَلِدْ وَلَمْ يُولَدْ وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌ" },
    { name: "Dua for Worldly and Hereafter Good", text: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ" },
];


// --- TRANSLATIONS OBJECT ---
const TRANSLATIONS = {
    en: {
        appName: "My Serene Life",
        statusConnected: "Connected",
        statusConnecting: "Connecting...",
        loadingServices: "Connecting to secure services...",
        tabQuran: "Home",
        tabPrayer: "Prayer",
        tabPeriod: "Period",
        tabBeauty: "Beauty", 
        tabMoments: "Moments",
        tabChat: "Chat",
        tabDhikr: "Dhikr", 
        tabTTS: "Recitation",
        tabNames: "Names",
        dailyReflectionTitle: "Daily Quranic Reflection",
        dailyReflectionSubtitle: "A moment of peace and guidance.",
        prayerTitle: "Prayer Times & Notifications",
        prayerCurrentTime: "Current Local Time:",
        prayerNote: "(Note: These are mock times. For real world usage, an external API is needed to calculate exact times based on location.)",
        periodTrackerTitle: "Period Tracker",
        periodTrackerSubtitle: "Log your cycle start dates to predict future cycles.",
        logButton: "Log",
        cyclePredictionsTitle: "Cycle Predictions",
        lastRecorded: "Last Recorded Date:",
        predictedNext: "Predicted Next Period:",
        estimatedOvulation: "Estimated Ovulation:",
        calculating: "Calculating...",
        historyTitle: "History",
        noPeriods: "No periods logged yet.",
        beautyTitle: "Natural Beauty Trends",
        beautySubtitle: "Timeless, natural, and gentle care inspired by nature.",
        earthquakeTitle: "Earthquake Advisories",
        importantNotice: "Important Notice",
        advisoryNote1: "Live earthquake data is typically fetched from external APIs (like USGS). As direct external API calls for this sensitive data are restricted in this environment, we are showing a secure advisory message.",
        advisoryNote2: "ADVISORY: Please rely on official government sources and emergency services for real-time safety information.",
        checklistTitle: "Preparedness Checklist",
        checklist1: "Keep an emergency kit ready.",
        checklist2: "Know your safe spots (Drop, Cover, Hold On).",
        checklist3: "Secure heavy items (shelves, cabinets).",
        momentsUploadTitle: "Upload Special Moments",
        momentsUploadSubtitle: "Securely upload private pictures and videos (max 1MB for demo) using Firebase Storage.",
        momentsTitle: "Your Moments",
        noMoments: "No moments uploaded yet.",
        chatTitle: "Private Chat with Partner",
        chatRoomId: "Room ID:",
        chatStart: "Start your secure conversation!",
        chatPlaceholder: "Type your secure message...",
        messageErrorDate: "Please select a valid date.",
        messageUploading: "Uploading moment... please wait.",
        messageUploadSuccess: "Moment uploaded successfully!",
        messageUploadFail: "Failed to upload moment. Check console for details.",
        messageSendFail: "Failed to send message.",
        messageFirebaseError: "Firebase Setup Error:",
        mockAyah: "(Mock Ayah)",
        reading1Title: "Day 1: Patience (Sabr)",
        reading1Verse: "And seek help through patience and prayer, and indeed, it is difficult except for the humbly submissive [to Allah].",
        reading2Title: "Day 2: Gratitude (Shukr)",
        reading2Verse: "If you are grateful, I will certainly give you increase; but if you are ungrateful, My punishment is truly severe.",
        reading3Title: "Day 3: Trust (Tawakkul)",
        reading3Verse: "And whoever relies upon Allah - then He is sufficient for him. Indeed, Allah will accomplish His purpose.",
        reading4Title: "Day 4: Kindness",
        reading4Verse: "Show kindness to parents, and to kindred, and orphans, and the needy, and to the neighbor who is near of kin and the neighbor who is a stranger.",
        trend1Title: "Rose Water Face Mist",
        trend1Desc: "A natural toner made from distilled rose petals. Keeps the skin hydrated and pH balanced. A timeless classic rediscovered.",
        trend2Title: "Honey & Turmeric Mask",
        trend2Desc: "Use raw, unfiltered honey for its antibacterial properties mixed with a pinch of turmeric for natural glow and anti-inflammation.",
        trend3Title: "Argan Oil Hair Treatment",
        trend3Desc: "Apply warm argan oil to scalp and ends for a deep conditioning treatment. Known as liquid gold for hair health.",
        // DHIKR/GRATITUDE KEYS
        dhikrTitle: "Dhikr & Tasbeeh Counter",
        dhikrSubtitle: "Track your daily remembrance and spiritual goals.",
        dhikrTotal: "Total Today:",
        resetButton: "Reset",
        gratitudeTitle: "Daily Gratitude Log (Partner)",
        gratitudePlaceholder: "What are you grateful for about your partner today?",
        gratitudeLogSuccess: "Gratitude logged successfully!",
        noGratitude: "No gratitude entries yet. Start logging the blessings!",
        logGratitudeButton: "Log Gratitude",
        // NEW TTS KEYS
        recitationTitle: "Quran Recitation (TTS)",
        recitationSubtitle: "Generate spoken audio for Surahs or Duas using a clear Arabic voice.",
        chooseText: "Choose a Quranic Text",
        textToReciteLabel: "Arabic Text to Recite",
        reciteButton: "Recite Text",
        messageGenerating: "Generating audio... This may take a moment.",
        messageReciteFail: "Failed to generate audio. Please try again.",
        // NAMES OF ALLAH KEYS
        namesTitle: "99 Names of Allah (Asma-ul-Husna)",
        namesSubtitle: "Learn and reflect on the beautiful names of Allah.",
        todaysName: "Today's Name",
        nameNumber: "Name",
        markLearned: "Mark as Learned",
        markUnlearned: "Unmark",
        progressTitle: "Learning Progress",
        browseAll: "Browse All 99 Names",
        searchNames: "Search names...",
        learned: "Learned",
        allNames: "All Names",
        // HIJAB STYLES KEYS
        hijabTitle: "Hijab Style Ideas",
        hijabSubtitle: "Daily style inspiration and tutorials",
        todaysStyle: "Today's Style Inspiration",
        watchTutorial: "Watch Tutorial",
        saveOutfit: "Save to Planner",
        saved: "Saved",
        myOutfitPlanner: "My Outfit Planner",
        noSavedOutfits: "No saved outfits yet. Start saving your favorite styles!",
        styleCategories: "Style Categories",
        casual: "Casual",
        formal: "Formal",
        elegant: "Elegant",
        sporty: "Sporty",
        modest: "Modest",
        modern: "Modern",
        allStyles: "All Styles",
        difficulty: "Difficulty",
        easy: "Easy",
        medium: "Medium",
        advanced: "Advanced",
        tabHijab: "Style",
        tips: "Tips",
        occasions: "Occasions",
        qiblaTitle: "Qibla Direction Finder",
        qiblaSubtitle: "Find the direction to Mecca using your device compass",
        compassHeading: "Compass Heading",
        qiblaDirection: "Qibla Direction",
        rotatePhone: "Rotate your phone until the arrow points to Qibla",
        locationRequired: "Location access required for accurate Qibla direction",
        enableLocation: "Enable Location",
        nextPrayer: "Next Prayer",
        timeUntilPrayer: "Time Until Prayer",
        prayerNotification: "Prayer time is approaching!",
        enableNotifications: "Enable Notifications",
    },
    tr: {
        appName: "Huzurlu Hayatım",
        statusConnected: "Bağlandı",
        statusConnecting: "Bağlanıyor...",
        loadingServices: "Güvenli servislere bağlanılıyor...",
        tabQuran: "Giriş",
        tabPrayer: "Namaz",
        tabPeriod: "Regl",
        tabBeauty: "Güzellik", 
        tabMoments: "Anlar",
        tabChat: "Sohbet",
        tabDhikr: "Zikir", 
        tabTTS: "Okuma", // NEW
        dailyReflectionTitle: "Günlük Kur'an Düşüncesi",
        dailyReflectionSubtitle: "Bir anlık huzur ve rehberlik.",
        prayerTitle: "Namaz Vakitleri ve Bildirimler",
        prayerCurrentTime: "Mevcut Yerel Saat:",
        prayerNote: "(Not: Bunlar deneme saatleridir. Gerçek kullanım için konuma dayalı kesin saatler hesaplanmalıdır.)",
        periodTrackerTitle: "Regl Takibi",
        periodTrackerSubtitle: "Gelecek döngüleri tahmin etmek için regl başlangıç tarihlerini kaydet.",
        logButton: "Kaydet",
        cyclePredictionsTitle: "Döngü Tahminleri",
        lastRecorded: "Son Kaydedilen Tarih:",
        predictedNext: "Tahmini Sonraki Regl:",
        estimatedOvulation: "Tahmini Yumurtlama:",
        calculating: "Hesaplanıyor...",
        historyTitle: "Geçmiş",
        noPeriods: "Henüz regl kaydedilmedi.",
        beautyTitle: "Doğal Güzellik Trendleri",
        beautySubtitle: "Doğadan ilham alan zamansız, doğal ve nazik bakım.",
        earthquakeTitle: "Deprem Uyarıları",
        importantNotice: "Önemli Uyarı",
        advisoryNote1: "Canlı deprem verileri genellikle harici API'lerden (USGS gibi) alınır. Bu hassas veriler için doğrudan harici API çağrıları bu ortamda kısıtlandığından, güvenli bir uyarı mesajı gösteriyoruz.",
        advisoryNote2: "UYARI: Lütfen gerçek zamanlı güvenlik bilgileri için resmi devlet kaynaklarına ve acil servislerine güvenin.",
        checklistTitle: "Hazırlık Kontrol Listesi",
        checklist1: "Acil durum kiti hazır bulundurun.",
        checklist2: "Güvenli noktalarınızı bilin (Çök, Kapan, Tutun).",
        checklist3: "Ağır eşyaları sabitleyin (raflar, dolaplar).",
        momentsUploadTitle: "Özel Anları Yükle",
        momentsUploadSubtitle: "Firebase Storage kullanarak özel resimleri ve videoları güvenle yükleyin (demo için maks. 1MB).",
        momentsTitle: "Anlarınız",
        noMoments: "Henüz an yüklenmedi.",
        chatTitle: "Partnerle Özel Sohbet",
        chatRoomId: "Oda Kimliği:",
        chatStart: "Güvenli sohbetinize başlayın!",
        chatPlaceholder: "Güvenli mesajınızı yazın...",
        messageErrorDate: "Lütfen geçerli bir tarih seçin.",
        messageUploading: "An yükleniyor... lütfen beklen.",
        messageUploadSuccess: "An başarıyla yüklendi!",
        messageUploadFail: "An yüklenemedi. Ayrıntılar için konsolu kontrol edin.",
        messageSendFail: "Mesaj gönderilemedi.",
        messageFirebaseError: "Firebase Kurulum Hatası:",
        mockAyah: "(Örnek Ayet)",
        reading1Title: "Gün 1: Sabır",
        reading1Verse: "Sabır ve namazla yardım dileyin. Şüphesiz bu, huşû duyanlardan başkasına zor gelir.",
        reading2Title: "Gün 2: Şükür",
        reading2Verse: "Eğer şükrederseniz, size (nimetimi) elbette artırırım. Eğer nankörlük ederseniz, şüphesiz azabım çok şiddetlidir.",
        reading3Title: "Gün 3: Tevekkül",
        reading3Verse: "Kim Allah'a tevekkül ederse, O kendisine yeter. Şüphesiz Allah, emrini yerine getirendir.",
        reading4Title: "Gün 4: Nezaket",
        reading4Verse: "Ana babaya, akrabaya, yetimlere, yoksullara, yakın komşuya, uzak komşuya iyilik edin.",
        trend1Title: "Gül Suyu Yüz Spreyi",
        trend1Desc: "Damıtılmış gül yapraklarından yapılan doğal bir tonik. Cildi nemli ve pH dengeli tutar. Yeniden keşfedilen zamansız bir klasik.",
        trend2Title: "Bal & Zerdeçal Maskesi",
        trend2Desc: "Doğal ışıltı ve iltihap önleyici özellikler için bir tutam zerdeçalla karıştırılmış filtresiz, ham bal kullanın.",
        trend3Title: "Argan Yağı Saç Bakımı",
        trend3Desc: "Sağlıklı saçlar için sıvı altın olarak bilinen ılık argan yağını saç derinize ve uçlarına derinlemesine bakım için uygulayın.",
        // DHIKR/GRATITUDE KEYS
        dhikrTitle: "Zikir ve Tesbih Sayacı",
        dhikrSubtitle: "Günlük zikir ve manevi hedeflerinizi takip edin.",
        dhikrTotal: "Bugünkü Toplam:",
        resetButton: "Sıfırla",
        gratitudeTitle: "Günlük Şükür Kaydı (Partner)",
        gratitudePlaceholder: "Bugün partnerin hakkında neye şükrediyorsun?",
        gratitudeLogSuccess: "Şükür kaydı başarıyla eklendi!",
        noGratitude: "Henüz şükür kaydı yok. Nimetleri kaydetmeye başlayın!",
        logGratitudeButton: "Şükrü Kaydet",
        // NEW TTS KEYS
        recitationTitle: "Kur'an Okuma (TTS)",
        recitationSubtitle: "Net bir Arapça ses kullanarak Sureler veya Dualar için sesli okuma oluşturun.",
        chooseText: "Kur'an Metni Seçin",
        textToReciteLabel: "Okunacak Arapça Metin",
        reciteButton: "Metni Oku",
        messageGenerating: "Ses oluşturuluyor... Bu biraz zaman alabilir.",
        messageReciteFail: "Ses oluşturulamadı. Lütfen tekrar deneyin.",
        // ALLAH İSİMLERİ KEYS
        namesTitle: "Allah'ın 99 İsmi (Esmaül Hüsna)",
        namesSubtitle: "Allah'ın güzel isimlerini öğrenin ve üzerinde düşünün.",
        todaysName: "Bugünün İsmi",
        nameNumber: "İsim",
        markLearned: "Öğrendim",
        markUnlearned: "İşareti Kaldır",
        progressTitle: "Öğrenme İlerlemesi",
        browseAll: "Tüm 99 İsmi Görüntüle",
        searchNames: "İsimleri ara...",
        learned: "Öğrenildi",
        allNames: "Tüm İsimler",
        tabNames: "İsimler",
        // HİCAB STİL FİKİRLERİ
        hijabTitle: "Hijab Stil Fikirleri",
        hijabSubtitle: "Günlük stil ilhamı ve eğitimler",
        todaysStyle: "Bugünün Stil İlhamı",
        watchTutorial: "Eğitimi İzle",
        saveOutfit: "Planlamaya Kaydet",
        saved: "Kaydedildi",
        myOutfitPlanner: "Kıyafet Planlayıcım",
        noSavedOutfits: "Henüz kaydedilmiş kıyafet yok. Favori stillerinizi kaydetmeye başlayın!",
        styleCategories: "Stil Kategorileri",
        casual: "Günlük",
        formal: "Resmi",
        elegant: "Zarif",
        sporty: "Sportif",
        modest: "Mütevazı",
        modern: "Modern",
        allStyles: "Tüm Stiller",
        difficulty: "Zorluk",
        easy: "Kolay",
        medium: "Orta",
        advanced: "İleri",
        tabHijab: "Stil",
        tips: "İpuçları",
        occasions: "Durumlar",
        qiblaTitle: "Kıble Yön Bulucu",
        qiblaSubtitle: "Cihaz pusulasını kullanarak Mekke yönünü bulun",
        compassHeading: "Pusula Yönü",
        qiblaDirection: "Kıble Yönü",
        rotatePhone: "Ok Kıble'ye işaret edene kadar telefonunuzu döndürün",
        locationRequired: "Doğru Kıble yönü için konum erişimi gerekli",
        enableLocation: "Konumu Etkinleştir",
        nextPrayer: "Sonraki Namaz",
        timeUntilPrayer: "Namaza Kalan Süre",
        prayerNotification: "Namaz vakti yaklaşıyor!",
        enableNotifications: "Bildirimleri Etkinleştir",
    },
};

/**
 * Converts Base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Converts 16-bit PCM audio data to a playable WAV Blob.
 */
function pcmToWav(pcm16, sampleRate) {
    const numChannels = 1;
    const sampleBits = 16;
    const byteRate = sampleRate * numChannels * (sampleBits / 8);
    const blockAlign = numChannels * (sampleBits / 8);

    const dataLength = pcm16.length * 2; // 2 bytes per sample (16-bit)
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    let offset = 0;

    // RIFF chunk
    view.setUint32(offset, 0x52494646, false); offset += 4; // "RIFF"
    view.setUint32(offset, 36 + dataLength, true); offset += 4; // ChunkSize
    view.setUint32(offset, 0x57415645, false); offset += 4; // "WAVE"

    // fmt chunk
    view.setUint32(offset, 0x666d7420, false); offset += 4; // "fmt "
    view.setUint32(offset, 16, true); offset += 4; // Subchunk1Size (16 for PCM)
    view.setUint16(offset, 1, true); offset += 2; // AudioFormat (1 for PCM)
    view.setUint16(offset, numChannels, true); offset += 2; // NumChannels
    view.setUint32(offset, sampleRate, true); offset += 4; // SampleRate
    view.setUint32(offset, byteRate, true); offset += 4; // ByteRate
    view.setUint16(offset, blockAlign, true); offset += 2; // BlockAlign
    view.setUint16(offset, sampleBits, true); offset += 2; // BitsPerSample

    // data chunk
    view.setUint32(offset, 0x64617461, false); offset += 4; // "data"
    view.setUint32(offset, dataLength, true); offset += 4; // Subchunk2Size

    // Write PCM data
    for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(offset, pcm16[i], true); // Write 16-bit sample (little-endian)
        offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
}


// --- MAIN APP COMPONENT ---
export default function App() {
    const [activeTab, setActiveTab] = useState('Home');
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        // Check if user was previously authenticated
        return localStorage.getItem('serene_life_authenticated') === 'true';
    });
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [chatInput, setChatInput] = useState('');
    const [dhikrCount, setDhikrCount] = useState(0); 
    const [language, setLanguage] = useState(() => getFromStorage('serene_life_language', 'en'));

    // Translation function
    const t = useCallback((key) => {
        return TRANSLATIONS[language][key] || key;
    }, [language]);

    const [periodData, setPeriodData] = useState(() => getFromStorage(STORAGE_KEYS.PERIOD_DATA, []));
    const [newPeriodDate, setNewPeriodDate] = useState('');
    const [moments, setMoments] = useState(() => getFromStorage(STORAGE_KEYS.MOMENTS, []));
    const [chatMessages, setChatMessages] = useState([]);
    const [decryptedMessages, setDecryptedMessages] = useState({});
    const [userId] = useState(() => {
        let id = localStorage.getItem('serene_life_user_id');
        if (!id) {
            id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('serene_life_user_id', id);
        }
        return id;
    });
    const [gratitudeEntries, setGratitudeEntries] = useState(() => getFromStorage(STORAGE_KEYS.GRATITUDE, []));
    const [prayerTimes, setPrayerTimes] = useState(null);
    const [prayerTimesLoading, setPrayerTimesLoading] = useState(true);

    // Handle password authentication
    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (passwordInput === APP_PASSWORD) {
            try {
                // Sign in anonymously to Firebase
                await signInAnonymously(auth);
                setIsAuthenticated(true);
                setIsAuthReady(true);
                localStorage.setItem('serene_life_authenticated', 'true');
                setPasswordError('');
            } catch (error) {
                console.error('Auth error:', error);
                setPasswordError('Authentication failed. Please try again.');
            }
        } else {
            setPasswordError('Incorrect password. Please try again.');
            setPasswordInput('');
        }
    };

    // Initialize Firebase auth on mount if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            signInAnonymously(auth)
                .then(() => setIsAuthReady(true))
                .catch((error) => {
                    console.error('Auth error:', error);
                    setIsAuthenticated(false);
                    localStorage.removeItem('serene_life_authenticated');
                });
        }
    }, [isAuthenticated]); 

    // 1. Load initial data from localStorage
    useEffect(() => {
        const savedDhikr = getFromStorage(STORAGE_KEYS.DHIKR_COUNT, { count: 0 });
        setDhikrCount(savedDhikr.count || 0);
    }, []);

    // Real-time Firebase listener for period data
    useEffect(() => {
        if (!isAuthReady) return;

        const unsubscribe = onSnapshot(collection(db, 'period_data'), (snapshot) => {
            const periods = snapshot.docs.map(doc => doc.data().date).sort((a, b) => new Date(b) - new Date(a));
            setPeriodData(periods);
        }, (error) => {
            console.error('Error fetching period data:', error);
        });

        return () => unsubscribe();
    }, [isAuthReady]);

    // Real-time Firebase listener for dhikr count
    useEffect(() => {
        if (!isAuthReady) return;

        const unsubscribe = onSnapshot(doc(db, 'user_data', 'dhikr'), (docSnap) => {
            if (docSnap.exists()) {
                setDhikrCount(docSnap.data().count || 0);
            }
        }, (error) => {
            console.error('Error fetching dhikr count:', error);
        });

        return () => unsubscribe();
    }, [isAuthReady]);

    // Real-time Firebase listener for chat messages
    useEffect(() => {
        if (!isAuthReady) return;

        const chatQuery = query(collection(db, 'chat_messages'), orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(chatQuery, async (snapshot) => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Decrypt all messages
            const newDecrypted = {};
            for (const msg of messages) {
                if (msg.text) {
                    newDecrypted[msg.id] = await decryptMessage(msg.text);
                }
            }
            setDecryptedMessages(newDecrypted);
            
            // Check for new messages from other user for notifications
            for (const change of snapshot.docChanges()) {
                if (change.type === 'added') {
                    const msg = { id: change.doc.id, ...change.doc.data() };
                    if (msg.senderId !== userId && chatMessages.length > 0) {
                        // Decrypt for notification
                        const decryptedText = await decryptMessage(msg.text);
                        showNotification('New Message', decryptedText);
                    }
                }
            }
            
            setChatMessages(messages);
        }, (error) => {
            console.error('Error fetching chat messages:', error);
        });

        return () => unsubscribe();
    }, [isAuthReady, userId]);

    // Real-time Firebase listener for gratitude entries
    useEffect(() => {
        if (!isAuthReady) return;

        const gratitudeQuery = query(collection(db, 'gratitude'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(gratitudeQuery, (snapshot) => {
            const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setGratitudeEntries(entries);
        }, (error) => {
            console.error('Error fetching gratitude:', error);
        });

        return () => unsubscribe();
    }, [isAuthReady]);

    // Fetch prayer times from Aladhan API based on user location
    useEffect(() => {
        const fetchPrayerTimes = async () => {
            setPrayerTimesLoading(true);
            try {
                // Get user's location
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            const { latitude, longitude } = position.coords;
                            
                            // Fetch from Aladhan API (free, no auth required)
                            const response = await fetch(
                                `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=2`
                            );
                            
                            if (response.ok) {
                                const data = await response.json();
                                const timings = data.data.timings;
                                
                                // Convert 24h to 12h format
                                const convert24to12 = (time24) => {
                                    const [hours, minutes] = time24.split(':');
                                    const hour = parseInt(hours);
                                    const ampm = hour >= 12 ? 'PM' : 'AM';
                                    const hour12 = hour % 12 || 12;
                                    return `${hour12}:${minutes} ${ampm}`;
                                };
                                
                                setPrayerTimes({
                                    Fajr: convert24to12(timings.Fajr),
                                    Dhuhr: convert24to12(timings.Dhuhr),
                                    Asr: convert24to12(timings.Asr),
                                    Maghrib: convert24to12(timings.Maghrib),
                                    Isha: convert24to12(timings.Isha)
                                });
                            }
                            setPrayerTimesLoading(false);
                        },
                        (error) => {
                            console.log('Location error:', error);
                            // Fallback to default times if location unavailable
                            setPrayerTimes({
                                Fajr: "05:15 AM",
                                Dhuhr: "01:00 PM",
                                Asr: "04:30 PM",
                                Maghrib: "07:10 PM",
                                Isha: "08:45 PM"
                            });
                            setPrayerTimesLoading(false);
                        }
                    );
                } else {
                    // Fallback if geolocation not supported
                    setPrayerTimes({
                        Fajr: "05:15 AM",
                        Dhuhr: "01:00 PM",
                        Asr: "04:30 PM",
                        Maghrib: "07:10 PM",
                        Isha: "08:45 PM"
                    });
                    setPrayerTimesLoading(false);
                }
            } catch (error) {
                console.error('Prayer times fetch error:', error);
                // Fallback times
                setPrayerTimes({
                    Fajr: "05:15 AM",
                    Dhuhr: "01:00 PM",
                    Asr: "04:30 PM",
                    Maghrib: "07:10 PM",
                    Isha: "08:45 PM"
                });
                setPrayerTimesLoading(false);
            }
        };

        fetchPrayerTimes();
    }, []);

    // 2. Save language preference
    useEffect(() => {
        saveToStorage('serene_life_language', language);
    }, [language]);


    // --- HANDLERS ---

    // Handler for Period Tracking
    const handleAddPeriodDate = async () => {
        if (!newPeriodDate) {
            setStatusMessage(t("messageErrorDate"));
            return;
        }

        try {
            // Add to Firebase
            await addDoc(collection(db, 'period_data'), {
                date: newPeriodDate,
                timestamp: serverTimestamp()
            });
            setNewPeriodDate('');
            setStatusMessage(`Date logged successfully!`);
            setTimeout(() => setStatusMessage(''), 3000);
        } catch (error) {
            console.error('Error adding period date:', error);
            // Fallback to localStorage
            const updatedData = [newPeriodDate, ...periodData].sort((a, b) => new Date(b) - new Date(a));
            setPeriodData(updatedData);
            saveToStorage(STORAGE_KEYS.PERIOD_DATA, updatedData);
            setNewPeriodDate('');
            setStatusMessage(`Date logged successfully!`);
            setTimeout(() => setStatusMessage(''), 3000);
        }
    };

    // Handler for Special Moments Upload (Local Only - Private)
    const handleMomentUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Check file size (limit to 2MB for localStorage)
        if (file.size > 2 * 1024 * 1024) {
            setStatusMessage("File too large. Max 2MB for local storage.");
            setTimeout(() => setStatusMessage(''), 3000);
            return;
        }

        setStatusMessage("Uploading moment...");
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const newMoment = {
                id: Date.now().toString(),
                fileName: file.name,
                fileType: file.type,
                url: e.target.result, // base64 data URL
                timestamp: new Date().toISOString()
            };
            
            const updatedMoments = [newMoment, ...moments];
            setMoments(updatedMoments);
            saveToStorage(STORAGE_KEYS.MOMENTS, updatedMoments);
            setStatusMessage("Moment uploaded successfully!");
            setTimeout(() => setStatusMessage(''), 3000);
        };
        
        reader.onerror = () => {
            setStatusMessage("Failed to upload moment.");
            setTimeout(() => setStatusMessage(''), 3000);
        };
        
        reader.readAsDataURL(file);
    };

    // Handler for Sending Chat Message (Encrypted & Synced via Firebase)
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;

        try {
            // Encrypt the message before sending
            const encryptedText = await encryptMessage(chatInput.trim());
            
            if (!encryptedText) {
                setStatusMessage('Failed to encrypt message.');
                setTimeout(() => setStatusMessage(''), 3000);
                return;
            }

            const newMessage = {
                text: encryptedText, // Store encrypted text
                senderId: userId,
                timestamp: serverTimestamp()
            };
            
            await addDoc(collection(db, 'chat_messages'), newMessage);
            setChatInput('');
        } catch (error) {
            console.error('Error sending message:', error);
            setStatusMessage('Failed to send message. Please try again.');
            setTimeout(() => setStatusMessage(''), 3000);
        }
    };

    // Show browser notification
    const showNotification = (title, body) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'chat-message',
                requireInteraction: false
            });
            // Play notification sound
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDGH0fPTgjMGHm7A7+OZSA0PVKXh8bllHAU2jdXzzn0pBSh+zPLaizsKGGS56+mvVxYLRJre8L9nIAQxhtLz1YU2Bhxqvu7mnEgPDlOk4PG5ZRwFNo3V882AKgUpfs3y2oo5CRdkvOzpr1cWC0Sa3vC/ZyAEMYbS89WFNgYcar7u5pxIDw5TpODxuWUcBTaN1fPNgCoFKX7N8tqKOQkXZLzs6a9XFgtEmt7wv2cgBDGG0vPVhTYGHGq+7uacSA8OU6Tg8bllHAU2jdXzzYAqBSl+zfLaijkJF2S87OmvVxYLRJre8L9nIAQxhtLz1YU2BRxqvu7mnEgPDlOk4PG5ZRwFNo3V882AKgUpfs3y2oo5CRdkvOzpr1cWC0Sa3vC/ZyAEMYbS89WFNgYcar7u5pxIDw5TpODxuWUcBTaN1fPNgCoFKX7N8tqKOQkXZLzs6a9XFgtEmt7wv2cgBDGG0vPVhTYGHGq+7uacSA8OU6Tg8bllHAU2jdXzzYAqBSl+zfLaijkJF2S87OmvVxYLRJre8L9nIAQxhtLz1YU2BRxqvu7mnEgPDlOk4PG5ZRwFNo3V882AKgUpfs3y2oo5CRdkvOzpr1cWC0Sa3vC/ZyAEMYbS89WFNgYcar7u5pxIDw5TpODxuWUcBTaN1fPNgCoFKX7N8tqKOQkXZLzs6a9XFgtEmt7wv2cgBDGG0vPVhTYGHGq+7uacSA8OU6Tg8bllHAU2jdXzzYAqBSl+zfLaijkJF2S87OmvVxYLRJre8L9nIAQxhtLz1YU2BRxqvu7mnEgPDlOk4PG5ZRwFNo3V882AKgUpfs3y2oo5CRdkvOzpr1cWC0Sa3vC/ZyAEMYbS89WFNgYcar7u5pxIDw5TpODxuWUcBTaN1fPNgCoFKX7N8tqKOQkXZLzs6a9XFgtEmt7wv2cgBDGG0vPVhTYGHGq+7uacSA8OU6Tg8bllHAU2jdXzzYAqBSl+zfLaijkJF2S87OmvVxYLRJre8L9nIAQxhtLz1YU2BRxqvu7mnEgPDlOk4PG5ZRwFNo3V882AKgUpfs3y2oo5CRdkvOzpr1cWC0Sa3vC/ZyAEMYbS89WFNgYcar7u5pxIDw5TpODxuWUcBTaN1fPNgCoFKX7N8tqKOQkXZLzs6a9XFgtEmt7wv2cgBDGG0vPVhTYGHGq+7uacSA8OU6Tg8bllHAU2jdXzzYAqBSl+zfLaijkJF2S87OmvVxYLRJre8L9nIAQxhtLz1YU2BRxqvu7mnEgPDlOk4PG5ZRwFNo3V882AKgUpfs3y2oo5CRdkvOzpr1cWC0Sa3vC/ZyAEMYbS89WFNgYcar7u5pxIDw5TpODxuWU=');
                audio.play().catch(e => console.log('Audio play failed:', e));
            } catch (e) {
                console.log('Notification sound failed:', e);
            }
        }
    };

    // DHIKR HANDLERS
    const handleDhikrClick = async () => {
        const newCount = dhikrCount + 1;
        setDhikrCount(newCount);
        try {
            await setDoc(doc(db, 'user_data', 'dhikr'), {
                count: newCount,
                lastUpdated: serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating dhikr:', error);
            saveToStorage(STORAGE_KEYS.DHIKR_COUNT, { count: newCount, lastUpdated: new Date().toISOString() });
        }
    };

    const handleResetDhikr = async () => {
        setDhikrCount(0);
        try {
            await setDoc(doc(db, 'user_data', 'dhikr'), {
                count: 0,
                lastReset: serverTimestamp()
            });
        } catch (error) {
            console.error('Error resetting dhikr:', error);
            saveToStorage(STORAGE_KEYS.DHIKR_COUNT, { count: 0, lastReset: new Date().toISOString() });
        }
    };

    // GRATITUDE HANDLER
    const handleLogGratitude = async (entry) => {
        if (!entry.trim()) return;

        const newEntry = {
            entry: entry.trim(),
            timestamp: serverTimestamp(),
            date: new Date().toDateString()
        };
        
        try {
            await addDoc(collection(db, 'gratitude'), newEntry);
            setStatusMessage(t("gratitudeLogSuccess"));
            setTimeout(() => setStatusMessage(''), 3000);
        } catch (error) {
            console.error('Error logging gratitude:', error);
            // Fallback to localStorage
            const localEntry = { id: Date.now().toString(), ...newEntry, timestamp: new Date().toISOString() };
            const updatedEntries = [localEntry, ...gratitudeEntries];
            setGratitudeEntries(updatedEntries);
            saveToStorage(STORAGE_KEYS.GRATITUDE, updatedEntries);
            setStatusMessage(t("gratitudeLogSuccess"));
            setTimeout(() => setStatusMessage(''), 3000);
        }
    };

    // Helper function to calculate next period/ovulation dates
    const getCycleInfo = useMemo(() => {
        if (periodData.length === 0) return { nextPeriod: null, ovulation: null };
        
        // Assume an average cycle length of 28 days for calculation
        const cycleLength = 28; 
        const lastPeriod = new Date(periodData[0]);
        
        const nextPeriodDate = new Date(lastPeriod);
        nextPeriodDate.setDate(lastPeriod.getDate() + cycleLength);

        const ovulationDate = new Date(lastPeriod);
        ovulationDate.setDate(lastPeriod.getDate() + 14); // 14 days after start

        return { nextPeriod: nextPeriodDate.toDateString(), ovulation: ovulationDate.toDateString() };

    }, [periodData]);

    // --- SUB-COMPONENTS ---

    const TabButton = ({ icon: Icon, label, tabName }) => (
        <button
            className={`flex flex-col items-center p-2 transition-all duration-300 ${
                activeTab === tabName
                    ? 'text-amber-700 border-t-2 border-amber-600 bg-gradient-to-b from-amber-50/60 to-transparent'
                    : 'text-stone-400 hover:text-amber-600'
            }`}
            onClick={() => setActiveTab(tabName)}
        >
            <Icon size={24} strokeWidth={2} className="mb-0.5" />
            <span className="text-xs font-medium">{label}</span>
        </button>
    );

    const Card = ({ title, children, className = '' }) => (
        <div className={`p-6 mb-4 bg-stone-50/60 backdrop-blur-xl rounded-2xl shadow-lg border border-stone-200/20 ${className}`}>
            <h2 className="mb-4 text-xl font-semibold bg-gradient-to-r from-amber-700 to-stone-600 bg-clip-text text-transparent border-b border-stone-200/50 pb-3">{title}</h2>
            {children}
        </div>
    );
    
    // NEW COMPONENT: DHIKR COUNTER
    const DhikrCounter = () => (
        <div className="space-y-4 text-center">
            <Card title={t("dhikrTitle")} className="bg-gradient-to-br from-lime-50/40 to-green-50/40">
                <p className="text-sm italic text-stone-600 mb-6">
                    {t("dhikrSubtitle")}
                </p>
                <div className="my-8">
                    <p className="text-xl font-medium bg-gradient-to-r from-lime-600 to-green-600 bg-clip-text text-transparent">{t("dhikrTotal")}</p>
                    <p className="text-8xl font-extrabold bg-gradient-to-br from-lime-600 via-green-600 to-emerald-600 bg-clip-text text-transparent font-mono tracking-tighter">
                        {dhikrCount}
                    </p>
                </div>
                
                <div className="flex justify-center space-x-4">
                    <button
                        onClick={handleDhikrClick}
                        className="p-8 bg-gradient-to-br from-lime-500 to-green-600 text-white rounded-full shadow-2xl hover:shadow-lime-500/50 transition-all transform hover:scale-105 active:scale-95"
                        aria-label="Increment Dhikr Count"
                    >
                        <Plus size={36} />
                    </button>
                    <button
                        onClick={handleResetDhikr}
                        className="p-3 bg-stone-100/80 backdrop-blur-sm text-lime-700 rounded-full shadow-md hover:bg-stone-200/80 transition-all flex items-center justify-center border border-stone-200"
                        aria-label="Reset Dhikr Count"
                    >
                        <RefreshCw size={24} />
                        <span className="ml-2 font-medium hidden sm:inline">{t("resetButton")}</span>
                    </button>
                </div>
            </Card>
        </div>
    );

    // NEW COMPONENT: 99 NAMES OF ALLAH (ASMAUL HUSNA)
    const AsmaulHusna = () => {
        const [learnedNames, setLearnedNames] = useState(() => getFromStorage(STORAGE_KEYS.LEARNED_NAMES, []));
        const [showAll, setShowAll] = useState(false);
        const [searchTerm, setSearchTerm] = useState('');

        const todaysName = getTodaysName();

        const toggleLearned = (number) => {
            const updated = learnedNames.includes(number)
                ? learnedNames.filter(n => n !== number)
                : [...learnedNames, number];
            setLearnedNames(updated);
            saveToStorage(STORAGE_KEYS.LEARNED_NAMES, updated);
        };

        const filteredNames = ALLAH_NAMES.filter(name => 
            name.transliteration.toLowerCase().includes(searchTerm.toLowerCase()) ||
            name.meaning.toLowerCase().includes(searchTerm.toLowerCase()) ||
            name.arabic.includes(searchTerm)
        );

        const progress = Math.round((learnedNames.length / ALLAH_NAMES.length) * 100);

        return (
            <div className="space-y-4">
                {/* Today's Name Card */}
                <Card title={t("todaysName")} className="bg-gradient-to-br from-amber-50/40 to-orange-50/40">
                    <div className="text-center py-6">
                        <div className="mb-2">
                            <span className="inline-block px-3 py-1 bg-amber-100/60 text-amber-800 text-xs font-semibold rounded-full">
                                {t("nameNumber")} {todaysName.number}/99
                            </span>
                        </div>
                        <h2 className="text-6xl font-bold text-amber-900 mb-3 font-serif">{todaysName.arabic}</h2>
                        <p className="text-2xl font-semibold bg-gradient-to-r from-amber-700 to-orange-600 bg-clip-text text-transparent mb-1">
                            {todaysName.transliteration}
                        </p>
                        <p className="text-lg text-stone-700 mb-4 italic">"{todaysName.meaning}"</p>
                        <div className="bg-stone-50/50 backdrop-blur-sm p-4 rounded-xl border border-amber-100/40 mb-4">
                            <p className="text-sm text-stone-600 leading-relaxed">{todaysName.reflection}</p>
                        </div>
                        <button
                            onClick={() => toggleLearned(todaysName.number)}
                            className={`px-6 py-3 rounded-full font-semibold transition-all shadow-lg ${
                                learnedNames.includes(todaysName.number)
                                    ? 'bg-gradient-to-r from-lime-500 to-green-500 text-white'
                                    : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:shadow-amber-500/50'
                            }`}
                        >
                            {learnedNames.includes(todaysName.number) ? (
                                <><Check size={16} className="inline mr-2" />{t("learned")}</>
                            ) : (
                                <><Star size={16} className="inline mr-2" />{t("markLearned")}</>
                            )}
                        </button>
                    </div>
                </Card>

                {/* Progress Card */}
                <Card title={t("progressTitle")} className="bg-gradient-to-br from-rose-50/40 to-orange-50/40">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-stone-700">{learnedNames.length}/99 {t("learned")}</span>
                        <span className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-orange-600 bg-clip-text text-transparent">
                            {progress}%
                        </span>
                    </div>
                    <div className="w-full h-3 bg-stone-200 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-500 rounded-full"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </Card>

                {/* Browse All Names */}
                <Card title={t("allNames")} className="bg-gradient-to-br from-stone-50/40 to-amber-50/40">
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="w-full mb-4 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-amber-500/50 transition-all flex items-center justify-center"
                    >
                        <Book size={18} className="mr-2" />
                        {showAll ? 'Hide' : t("browseAll")}
                    </button>

                    {showAll && (
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder={t("searchNames")}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full p-3 border border-amber-200/40 bg-stone-50/40 backdrop-blur-sm rounded-xl focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 transition-all"
                            />
                            <div className="max-h-96 overflow-y-auto space-y-2">
                                {filteredNames.map(name => (
                                    <div 
                                        key={name.number}
                                        className={`p-4 rounded-xl border transition-all ${
                                            learnedNames.includes(name.number)
                                                ? 'bg-gradient-to-r from-lime-50/60 to-green-50/60 border-lime-200/60'
                                                : 'bg-stone-50/70 backdrop-blur-sm border-stone-200 hover:border-amber-300'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-bold text-stone-500">#{name.number}</span>
                                                    <span className="text-2xl font-bold text-amber-900 font-serif">{name.arabic}</span>
                                                </div>
                                                <p className="text-lg font-semibold text-orange-700">{name.transliteration}</p>
                                                <p className="text-sm text-stone-600 italic">"{name.meaning}"</p>
                                            </div>
                                            <button
                                                onClick={() => toggleLearned(name.number)}
                                                className={`p-2 rounded-full transition-all ${
                                                    learnedNames.includes(name.number)
                                                        ? 'bg-lime-600 text-white'
                                                        : 'bg-stone-200 text-stone-600 hover:bg-amber-500 hover:text-white'
                                                }`}
                                            >
                                                {learnedNames.includes(name.number) ? <Check size={16} /> : <Star size={16} />}
                                            </button>
                                        </div>
                                        <p className="text-xs text-stone-500 mt-2">{name.reflection}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        );
    };

    // NEW COMPONENT: HIJAB STYLES
    const HijabStyles = () => {
        const [savedOutfits, setSavedOutfits] = useState(() => getFromStorage(STORAGE_KEYS.SAVED_OUTFITS, []));
        const [selectedCategory, setSelectedCategory] = useState('all');
        const [showPlanner, setShowPlanner] = useState(false);

        const todaysStyle = getTodaysStyle();

        const toggleSaved = (styleId) => {
            const updated = savedOutfits.includes(styleId)
                ? savedOutfits.filter(id => id !== styleId)
                : [...savedOutfits, styleId];
            setSavedOutfits(updated);
            saveToStorage(STORAGE_KEYS.SAVED_OUTFITS, updated);
        };

        const filteredStyles = selectedCategory === 'all' 
            ? HIJAB_STYLES 
            : HIJAB_STYLES.filter(style => style.category === selectedCategory);

        const savedStyles = HIJAB_STYLES.filter(style => savedOutfits.includes(style.id));

        const getDifficultyColor = (difficulty) => {
            switch(difficulty) {
                case 'easy': return 'bg-green-100 text-green-700';
                case 'medium': return 'bg-yellow-100 text-yellow-700';
                case 'advanced': return 'bg-rose-100 text-rose-700';
                default: return 'bg-slate-100 text-slate-700';
            }
        };

        const getCategoryColor = (category) => {
            switch(category) {
                case 'casual': return 'from-sky-500 to-blue-500';
                case 'formal': return 'from-rose-500 to-orange-500';
                case 'elegant': return 'from-amber-500 to-orange-500';
                case 'sporty': return 'from-lime-500 to-green-500';
                case 'modest': return 'from-stone-500 to-neutral-600';
                case 'modern': return 'from-rose-500 to-pink-500';
                default: return 'from-amber-500 to-orange-500';
            }
        };

        return (
            <div className="space-y-4">
                {/* Today's Style Inspiration */}
                <Card title={t("todaysStyle")} className="bg-gradient-to-br from-rose-50/40 to-orange-50/40">
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <h3 className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-orange-600 bg-clip-text text-transparent mb-2">
                                    {todaysStyle.name}
                                </h3>
                                <div className="flex gap-2 mb-3">
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getDifficultyColor(todaysStyle.difficulty)}`}>
                                        {t(todaysStyle.difficulty)}
                                    </span>
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${getCategoryColor(todaysStyle.category)} text-white`}>
                                        {t(todaysStyle.category)}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => toggleSaved(todaysStyle.id)}
                                className={`p-2 rounded-full transition-all ${
                                    savedOutfits.includes(todaysStyle.id)
                                        ? 'bg-rose-500 text-white'
                                        : 'bg-stone-200 text-stone-600 hover:bg-rose-500 hover:text-white'
                                }`}
                            >
                                <Bookmark size={18} fill={savedOutfits.includes(todaysStyle.id) ? 'white' : 'none'} />
                            </button>
                        </div>

                        <div className="bg-stone-50/50 backdrop-blur-sm p-4 rounded-xl border border-rose-100/40">
                            <p className="text-sm text-stone-700 leading-relaxed mb-3">{todaysStyle.description}</p>
                            <div className="mb-3">
                                <p className="text-xs font-semibold text-rose-700 mb-1">💡 {t("tips")}:</p>
                                <p className="text-xs text-stone-600 italic">{todaysStyle.tips}</p>
                            </div>
                            <div className="mb-3">
                                <p className="text-xs font-semibold text-orange-700 mb-1">📅 {t("occasions")}:</p>
                                <p className="text-xs text-stone-600">{todaysStyle.occasions}</p>
                            </div>
                        </div>

                        <a
                            href={todaysStyle.tutorial}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-rose-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-rose-500/50 transition-all"
                        >
                            <ExternalLink size={18} />
                            {t("watchTutorial")}
                        </a>
                    </div>
                </Card>

                {/* My Outfit Planner */}
                <Card title={t("myOutfitPlanner")} className="bg-gradient-to-br from-orange-50/40 to-amber-50/40">
                    <button
                        onClick={() => setShowPlanner(!showPlanner)}
                        className="w-full mb-4 px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-orange-500/50 transition-all flex items-center justify-center gap-2"
                    >
                        <Bookmark size={18} />
                        {showPlanner ? 'Hide Planner' : `${t("myOutfitPlanner")} (${savedStyles.length})`}
                    </button>

                    {showPlanner && (
                        <div className="space-y-3">
                            {savedStyles.length === 0 ? (
                                <p className="text-sm text-stone-500 italic text-center py-6">{t("noSavedOutfits")}</p>
                            ) : (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {savedStyles.map(style => (
                                        <div 
                                            key={style.id}
                                            className="p-4 bg-stone-50/70 backdrop-blur-sm rounded-xl border border-orange-200/60 hover:border-orange-300 transition-all"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-orange-700 mb-1">{style.name}</h4>
                                                    <div className="flex gap-2 mb-2">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs ${getDifficultyColor(style.difficulty)}`}>
                                                            {t(style.difficulty)}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                                                            {t(style.category)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-stone-600 mb-2">{style.occasions}</p>
                                                </div>
                                                <button
                                                    onClick={() => toggleSaved(style.id)}
                                                    className="p-2 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-all"
                                                >
                                                    <Bookmark size={14} fill="white" />
                                                </button>
                                            </div>
                                            <a
                                                href={style.tutorial}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1 font-medium"
                                            >
                                                <ExternalLink size={12} />
                                                {t("watchTutorial")}
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </Card>

                {/* Browse All Styles */}
                <Card title={t("allStyles")} className="bg-gradient-to-br from-stone-50/40 to-sky-50/40">
                    <div className="mb-4">
                        <p className="text-sm font-medium text-stone-700 mb-2">{t("styleCategories")}</p>
                        <div className="flex flex-wrap gap-2">
                            {['all', 'casual', 'formal', 'elegant', 'sporty', 'modest', 'modern'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                        selectedCategory === cat
                                            ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-md'
                                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                                    }`}
                                >
                                    {cat === 'all' ? t("allStyles") : t(cat)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto space-y-2">
                        {filteredStyles.map(style => (
                            <div 
                                key={style.id}
                                className="p-4 bg-stone-50/70 backdrop-blur-sm rounded-xl border border-stone-200 hover:border-rose-300 transition-all"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1">
                                        <h4 className="font-semibold bg-gradient-to-r from-stone-700 to-amber-600 bg-clip-text text-transparent mb-1">
                                            {style.name}
                                        </h4>
                                        <div className="flex gap-2 mb-2">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${getDifficultyColor(style.difficulty)}`}>
                                                {t(style.difficulty)}
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100/60 text-amber-800">
                                                {t(style.category)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-stone-600 mb-2">{style.description}</p>
                                        <p className="text-xs text-stone-500 italic">📅 {style.occasions}</p>
                                    </div>
                                    <button
                                        onClick={() => toggleSaved(style.id)}
                                        className={`p-2 rounded-full transition-all ml-2 ${
                                            savedOutfits.includes(style.id)
                                                ? 'bg-rose-500 text-white'
                                                : 'bg-stone-200 text-stone-600 hover:bg-rose-500 hover:text-white'
                                        }`}
                                    >
                                        <Bookmark size={14} fill={savedOutfits.includes(style.id) ? 'white' : 'none'} />
                                    </button>
                                </div>
                                <a
                                    href={style.tutorial}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1 font-medium"
                                >
                                    <ExternalLink size={12} />
                                    {t("watchTutorial")}
                                </a>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        );
    };

    // NEW COMPONENT: GRATITUDE LOG
    const GratitudeLog = () => {
        const [entry, setEntry] = useState('');

        const handleSubmit = (e) => {
            e.preventDefault();
            if (entry.trim()) {
                handleLogGratitude(entry);
                setEntry('');
            }
        };

        // Filter and display only today's log entry at the top for easy access
        const today = new Date().toDateString();
        const todaysEntry = gratitudeEntries.find(e => new Date(e.timestamp).toDateString() === today);
        const pastEntries = gratitudeEntries.filter(e => new Date(e.timestamp).toDateString() !== today);

        return (
            <Card title={t("gratitudeTitle")} className="bg-gradient-to-br from-rose-100/40 via-orange-50/40 to-amber-50/40">
                <form onSubmit={handleSubmit} className="mb-4">
                    <textarea
                        value={entry}
                        onChange={(e) => setEntry(e.target.value)}
                        placeholder={t("gratitudePlaceholder")}
                        rows="3"
                        className="w-full p-3 border border-orange-200/40 bg-stone-50/50 backdrop-blur-sm rounded-xl focus:ring-2 focus:ring-orange-300/40 focus:border-orange-300 transition-all"
                    />
                    <button
                        type="submit"
                        className="mt-2 w-full py-3 text-white bg-gradient-to-r from-orange-400 to-amber-500 rounded-xl shadow-lg hover:shadow-orange-400/40 transition-all font-semibold disabled:opacity-50"
                        disabled={!entry.trim()}
                    >
                        {t("logGratitudeButton")}
                    </button>
                </form>

                <h3 className="text-lg font-semibold bg-gradient-to-r from-stone-600 to-amber-600 bg-clip-text text-transparent border-t border-stone-100 pt-2 mt-4">{t("historyTitle")}</h3>
                <ul className="max-h-40 overflow-y-auto space-y-2 mt-2 text-sm">
                    {todaysEntry && (
                        <li className="p-3 bg-gradient-to-r from-orange-100/60 to-amber-100/60 backdrop-blur-sm rounded-xl shadow-sm font-medium text-orange-900 flex items-center border border-orange-200/40">
                            <Clock size={16} className="mr-2" />
                            {todaysEntry.entry}
                        </li>
                    )}
                    {pastEntries.length > 0 ? (
                        pastEntries.map((log) => (
                            <li key={log.id} className="p-2 bg-stone-50/60 backdrop-blur-sm rounded-lg border-l-4 border-stone-300 text-stone-700">
                                <p className="text-xs italic text-stone-500 mb-1">{new Date(log.timestamp).toLocaleDateString()}</p>
                                {log.entry}
                            </li>
                        ))
                    ) : (
                        <p className="text-stone-500 italic">{t("noGratitude")}</p>
                    )}
                </ul>
            </Card>
        );
    };


    const BeautyTrends = () => (
        <div className="space-y-4">
            <Card title={t("beautyTitle")} className="bg-gradient-to-br from-orange-50/40 via-rose-50/40 to-amber-50/40">
                <p className="text-sm text-stone-600">
                    {t("beautySubtitle")}
                </p>
            </Card>
            {BEAUTY_TRENDS_KEYS.map((keys, index) => (
                <div key={index} className="p-4 bg-gradient-to-br from-rose-50/40 to-orange-50/40 backdrop-blur-sm rounded-xl shadow-md border border-rose-100/40 transition-shadow hover:shadow-lg">
                    <h3 className="mb-2 text-lg font-medium bg-gradient-to-r from-rose-600 to-orange-600 bg-clip-text text-transparent flex items-center">
                        <Heart size={20} className="mr-2 text-rose-400" /> {t(keys.titleKey)}
                    </h3>
                    <p className="text-stone-700 text-sm">{t(keys.descKey)}</p>
                </div>
            ))}
        </div>
    );

    const EarthquakeAdvisories = () => (
        <div className="space-y-4">
            <Card title={t("earthquakeTitle")} className="bg-gradient-to-br from-amber-50/40 via-yellow-50/40 to-orange-50/40">
                <div className="p-4 bg-gradient-to-r from-amber-50/60 to-yellow-50/60 backdrop-blur-sm rounded-xl border border-amber-200/40">
                    <p className="font-semibold text-amber-800 mb-2">{t("importantNotice")}</p>
                    <p className="text-sm text-stone-700">
                        {t("advisoryNote1")}
                    </p>
                    <p className="mt-3 text-sm text-red-600 font-bold">
                        {t("advisoryNote2")}
                    </p>
                </div>
                <Card title={t("checklistTitle")} className="bg-gradient-to-br from-lime-50/40 via-green-50/40 to-emerald-50/40">
                    <ul className="text-sm space-y-2 text-stone-700">
                        <li className="flex items-center"><Check size={16} className="text-lime-600 mr-2" /> {t("checklist1")}</li>
                        <li className="flex items-center"><Check size={16} className="text-lime-600 mr-2" /> {t("checklist2")}</li>
                        <li className="flex items-center"><Check size={16} className="text-lime-600 mr-2" /> {t("checklist3")}</li>
                    </ul>
                </Card>
            </Card>
        </div>
    );

    const QuranDaily = () => {
        // Get today's verse
        const todaysVerse = getTodaysVerse();
        
        return (
            <div className="space-y-4">
                <Card title={t("dailyReflectionTitle")} className="bg-gradient-to-br from-orange-50/50 via-amber-50/50 to-yellow-50/40">
                    <p className="text-sm italic text-stone-600 mb-4">
                        {t("dailyReflectionSubtitle")}
                    </p>
                    {/* Today's Rotating Verse */}
                    <div className="p-5 bg-gradient-to-br from-amber-50/50 to-orange-50/40 backdrop-blur-sm rounded-2xl border border-amber-100/40">
                        <h3 className="mb-2 text-lg font-medium bg-gradient-to-r from-amber-700 to-orange-600 bg-clip-text text-transparent">
                            {language === 'tr' ? todaysVerse.themeTr : todaysVerse.theme}
                        </h3>
                        <p className="text-stone-700 leading-relaxed italic mb-2">
                            "{language === 'tr' ? todaysVerse.verseTr : todaysVerse.verse}"
                        </p>
                        <p className="text-sm font-semibold bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent">
                            {language === 'tr' ? todaysVerse.referenceTr : todaysVerse.reference}
                        </p>
                    </div>
                </Card>
                <GratitudeLog /> 
                <BeautyTrends /> 
                <EarthquakeAdvisories />
            </div>
        );
    };

    const PrayerNotifications = () => {
        const now = new Date();
        const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const currentHour = now.getHours();
        
        // Qibla and Compass state
        const [heading, setHeading] = useState(0);
        const [qiblaAngle, setQiblaAngle] = useState(null);
        const [hasLocation, setHasLocation] = useState(false);
        const [hasCompass, setHasCompass] = useState(false);
        const [notificationsEnabled, setNotificationsEnabled] = useState(false);

        // Dynamic background based on time of day
        const getTimeBasedBackground = () => {
            if (currentHour >= 5 && currentHour < 12) {
                // Morning - sunrise colors
                return 'from-orange-100/60 via-amber-100/60 to-yellow-100/60';
            } else if (currentHour >= 12 && currentHour < 17) {
                // Afternoon - bright sky
                return 'from-sky-100/60 via-blue-100/60 to-cyan-100/60';
            } else if (currentHour >= 17 && currentHour < 20) {
                // Evening - sunset colors
                return 'from-rose-100/60 via-orange-100/60 to-amber-100/60';
            } else {
                // Night - dark with stars
                return 'from-indigo-900/90 via-purple-900/90 to-blue-900/90';
            }
        };

        const isNightTime = currentHour < 5 || currentHour >= 20;

        // Calculate Qibla direction from user's location
        const calculateQibla = (lat, lon) => {
            // Mecca coordinates
            const meccaLat = 21.4225;
            const meccaLon = 39.8262;
            
            const latRad = lat * Math.PI / 180;
            const lonRad = lon * Math.PI / 180;
            const meccaLatRad = meccaLat * Math.PI / 180;
            const meccaLonRad = meccaLon * Math.PI / 180;
            
            const dLon = meccaLonRad - lonRad;
            
            const y = Math.sin(dLon) * Math.cos(meccaLatRad);
            const x = Math.cos(latRad) * Math.sin(meccaLatRad) - 
                      Math.sin(latRad) * Math.cos(meccaLatRad) * Math.cos(dLon);
            
            let bearing = Math.atan2(y, x) * 180 / Math.PI;
            bearing = (bearing + 360) % 360;
            
            return bearing;
        };

        // Get user location and calculate Qibla
        useEffect(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const qibla = calculateQibla(
                            position.coords.latitude,
                            position.coords.longitude
                        );
                        setQiblaAngle(qibla);
                        setHasLocation(true);
                    },
                    (error) => {
                        console.log('Location error:', error);
                        setHasLocation(false);
                    }
                );
            }
        }, []);

        // Compass orientation
        useEffect(() => {
            const handleOrientation = (event) => {
                if (event.webkitCompassHeading) {
                    // iOS
                    setHeading(event.webkitCompassHeading);
                    setHasCompass(true);
                } else if (event.alpha) {
                    // Android
                    setHeading(360 - event.alpha);
                    setHasCompass(true);
                }
            };

            if (window.DeviceOrientationEvent) {
                window.addEventListener('deviceorientation', handleOrientation);
                setHasCompass(true);
            }

            return () => {
                window.removeEventListener('deviceorientation', handleOrientation);
            };
        }, []);

        // Request notification permission
        const requestNotifications = async () => {
            if ('Notification' in window) {
                const permission = await Notification.requestPermission();
                setNotificationsEnabled(permission === 'granted');
            }
        };

        // Calculate time until next prayer
        const getNextPrayer = () => {
            if (!prayerTimes) return { name: 'Loading...', timeLeft: '...' };
            const prayerTimesArray = Object.entries(prayerTimes);
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            
            for (const [name, time] of prayerTimesArray) {
                const [hours, minutes] = time.split(':').map(Number);
                const prayerMinutes = hours * 60 + minutes;
                
                if (prayerMinutes > currentMinutes) {
                    const diff = prayerMinutes - currentMinutes;
                    const hoursLeft = Math.floor(diff / 60);
                    const minutesLeft = diff % 60;
                    return { name, timeLeft: `${hoursLeft}h ${minutesLeft}m` };
                }
            }
            
            // If no more prayers today, return first prayer of tomorrow
            const [name] = prayerTimesArray[0];
            return { name, timeLeft: 'Tomorrow' };
        };

        const nextPrayer = getNextPrayer();
        const relativeDirection = qiblaAngle !== null ? ((qiblaAngle - heading + 360) % 360).toFixed(0) : 0;

        return (
            <div className="space-y-4">
                {/* Qibla Direction Finder */}
                <Card title={t("qiblaTitle")} className={`bg-gradient-to-br ${getTimeBasedBackground()} relative overflow-hidden`}>
                    {/* Stars for night time */}
                    {isNightTime && (
                        <div className="absolute inset-0 pointer-events-none">
                            {[...Array(50)].map((_, i) => (
                                <div
                                    key={i}
                                    className="absolute rounded-full bg-white animate-pulse"
                                    style={{
                                        width: Math.random() * 3 + 1 + 'px',
                                        height: Math.random() * 3 + 1 + 'px',
                                        top: Math.random() * 100 + '%',
                                        left: Math.random() * 100 + '%',
                                        animationDelay: Math.random() * 3 + 's',
                                        animationDuration: Math.random() * 2 + 2 + 's'
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    <div className="relative z-10">
                        <p className={`text-sm mb-4 ${isNightTime ? 'text-white' : 'text-stone-600'}`}>
                            {t("qiblaSubtitle")}
                        </p>

                        {!hasLocation ? (
                            <div className="text-center py-8">
                                <Navigation size={48} className={`mx-auto mb-4 ${isNightTime ? 'text-white' : 'text-stone-400'}`} />
                                <p className={`text-sm mb-4 ${isNightTime ? 'text-white' : 'text-stone-600'}`}>
                                    {t("locationRequired")}
                                </p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                                >
                                    {t("enableLocation")}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Compass Display */}
                                <div className="relative w-64 h-64 mx-auto">
                                    {/* Compass Circle */}
                                    <div className="absolute inset-0 rounded-full border-4 border-white/30 bg-white/10 backdrop-blur-md shadow-2xl">
                                        {/* Cardinal directions */}
                                        <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-2xl">
                                            <div className="absolute top-2">N</div>
                                            <div className="absolute right-2">E</div>
                                            <div className="absolute bottom-2">S</div>
                                            <div className="absolute left-2">W</div>
                                        </div>
                                        
                                        {/* Compass Needle */}
                                        <div 
                                            className="absolute inset-0 flex items-center justify-center transition-transform duration-300"
                                            style={{ transform: `rotate(${-heading}deg)` }}
                                        >
                                            <div className="w-1 h-32 bg-gradient-to-b from-red-500 to-red-700 rounded-full shadow-lg" />
                                        </div>

                                        {/* Qibla Arrow */}
                                        {qiblaAngle !== null && (
                                            <div 
                                                className="absolute inset-0 flex items-center justify-center transition-transform duration-300"
                                                style={{ transform: `rotate(${qiblaAngle - heading}deg)` }}
                                            >
                                                <div className="flex flex-col items-center">
                                                    <div className="text-4xl animate-bounce">🕋</div>
                                                    <div className="w-2 h-20 bg-gradient-to-b from-green-400 to-green-600 rounded-full shadow-lg" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Direction Info */}
                                <div className="text-center space-y-2">
                                    <div className={`text-sm ${isNightTime ? 'text-white' : 'text-stone-600'}`}>
                                        {t("compassHeading")}: <span className="font-bold text-lg">{Math.round(heading)}°</span>
                                    </div>
                                    {qiblaAngle !== null && (
                                        <div className={`text-sm ${isNightTime ? 'text-white' : 'text-stone-600'}`}>
                                            {t("qiblaDirection")}: <span className="font-bold text-lg">{Math.round(qiblaAngle)}°</span>
                                        </div>
                                    )}
                                    <p className={`text-xs italic ${isNightTime ? 'text-white/80' : 'text-stone-500'}`}>
                                        {t("rotatePhone")}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Prayer Times with Next Prayer Highlight */}
                <Card title={t("prayerTitle")} className="bg-gradient-to-br from-sky-50/40 via-blue-50/40 to-cyan-50/40">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-sm text-stone-600">
                                {t("prayerCurrentTime")}: <span className="font-mono bg-gradient-to-r from-amber-700 to-orange-600 bg-clip-text text-transparent font-bold">{currentTime}</span>
                            </p>
                        </div>
                        {!notificationsEnabled && (
                            <button
                                onClick={requestNotifications}
                                className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-sky-400 to-blue-400 text-white text-xs rounded-full font-semibold hover:shadow-lg transition-all"
                            >
                                <Bell size={12} />
                                {t("enableNotifications")}
                            </button>
                        )}
                    </div>

                    {/* Next Prayer Alert */}
                    <div className="mb-4 p-4 bg-gradient-to-r from-sky-100/60 to-blue-100/60 backdrop-blur-sm rounded-xl border-2 border-sky-300/60 shadow-lg">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-sky-700">{t("nextPrayer")}</p>
                                <p className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                    {nextPrayer.name}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-semibold text-sky-700">{t("timeUntilPrayer")}</p>
                                <p className="text-xl font-bold text-sky-600">{nextPrayer.timeLeft}</p>
                            </div>
                        </div>
                    </div>

                    <ul className="space-y-3">
                        {prayerTimesLoading ? (
                            <li className="text-center py-4 text-stone-500">
                                {t("calculating")}
                            </li>
                        ) : prayerTimes && Object.entries(prayerTimes).map(([name, time]) => {
                            const isNext = name === nextPrayer.name;
                            return (
                                <li 
                                    key={name} 
                                    className={`flex items-center justify-between p-4 backdrop-blur-sm rounded-xl shadow-sm border transition-all ${
                                        isNext 
                                            ? 'bg-gradient-to-r from-sky-100/60 to-blue-100/60 border-sky-300/60 shadow-md scale-105' 
                                            : 'bg-gradient-to-r from-stone-50/60 to-amber-50/60 border-stone-200/40'
                                    }`}
                                >
                                    <span className={`font-medium ${
                                        isNext ? 'text-sky-700' : 'text-stone-700'
                                    }`}>{name}</span>
                                    <span className={`text-lg font-semibold ${
                                        isNext 
                                            ? 'bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent' 
                                            : 'bg-gradient-to-r from-amber-700 to-orange-600 bg-clip-text text-transparent'
                                    }`}>{time}</span>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="mt-4 text-xs italic text-stone-500">
                        {prayerTimesLoading ? t("calculating") : 'Times based on your location using Aladhan API'}
                    </p>
                </Card>
            </div>
        );
    };

    const PeriodCalendar = () => (
        <div className="space-y-4">
            <Card title={t("periodTrackerTitle")} className="bg-gradient-to-br from-rose-50/40 via-orange-50/40 to-pink-50/40">
                <p className="mb-3 text-sm text-stone-600">{t("periodTrackerSubtitle")}</p>

                <div className="flex items-center space-x-2 p-3 bg-gradient-to-r from-rose-50/40 to-orange-50/40 backdrop-blur-sm rounded-xl mb-4 border border-rose-100/40">
                    <input
                        type="date"
                        value={newPeriodDate}
                        onChange={(e) => setNewPeriodDate(e.target.value)}
                        className="flex-grow p-2 border border-rose-200/40 bg-stone-50/40 backdrop-blur-sm rounded-lg focus:ring-2 focus:ring-rose-300/40 focus:border-rose-300"
                    />
                    <button
                        onClick={handleAddPeriodDate}
                        className="px-4 py-2 text-white bg-gradient-to-r from-rose-400 to-orange-400 rounded-lg shadow-lg hover:shadow-rose-400/40 transition-all flex items-center"
                    >
                        <Check size={20} className="mr-1" /> {t("logButton")}
                    </button>
                </div>
            </Card>

            <Card title={t("cyclePredictionsTitle")} className="bg-gradient-to-br from-amber-50/40 via-orange-50/40 to-yellow-50/40">
                <div className="text-stone-700 space-y-2">
                    <p>{t("lastRecorded")} <span className="font-semibold bg-gradient-to-r from-amber-700 to-orange-600 bg-clip-text text-transparent">{periodData.length > 0 ? new Date(periodData[0]).toDateString() : 'N/A'}</span></p>
                    <p>{t("predictedNext")} <span className="font-semibold bg-gradient-to-r from-amber-700 to-orange-600 bg-clip-text text-transparent">{getCycleInfo.nextPeriod || t("calculating")}</span></p>
                    <p>{t("estimatedOvulation")} <span className="font-semibold bg-gradient-to-r from-amber-700 to-orange-600 bg-clip-text text-transparent">{getCycleInfo.ovulation || t("calculating")}</span></p>
                </div>
            </Card>

            <Card title={t("historyTitle")} className="bg-gradient-to-br from-stone-50/40 via-neutral-50/40 to-amber-50/40">
                <ul className="max-h-40 overflow-y-auto space-y-1">
                    {periodData.length === 0 ? (
                        <p className="text-stone-500 italic">{t("noPeriods")}</p>
                    ) : (
                        periodData.map((date, index) => (
                            <li key={index} className="flex items-center justify-between text-sm p-1 border-b border-stone-100">
                                <span className="text-stone-600 font-mono">{new Date(date).toLocaleDateString()}</span>
                                <ChevronRight size={14} className="text-amber-500" />
                            </li>
                        ))
                    )}
                </ul>
            </Card>
        </div>
    );

    const SpecialMoments = () => (
        <div className="space-y-4">
            <Card title={t("momentsUploadTitle")} className="bg-gradient-to-br from-amber-50/40 via-orange-50/40 to-yellow-50/40">
                <p className="text-sm text-stone-600 mb-4">
                    {t("momentsUploadSubtitle")}
                </p>
                <label className="block">
                    <span className="sr-only">{t("momentsUploadTitle")}</span>
                    <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleMomentUpload}
                        className="block w-full text-sm text-amber-800 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-amber-50 file:to-orange-50 file:text-amber-800 hover:file:from-amber-100 hover:file:to-orange-100 file:transition-all"
                    />
                </label>
            </Card>

            <Card title={`${t("momentsTitle")} (${moments.length})`} className="bg-gradient-to-br from-stone-50/40 via-amber-50/40 to-orange-50/40">
                <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                    {moments.length === 0 ? (
                        <p className="text-stone-500 italic col-span-2">{t("noMoments")}</p>
                    ) : (
                        moments.map((moment) => (
                            <div key={moment.id} className="relative aspect-square rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-stone-100/60 to-amber-100/60 backdrop-blur-sm border border-stone-200/50">
                                {moment.fileType.startsWith('image/') ? (
                                    <img src={moment.url} alt="Moment" className="object-cover w-full h-full" loading="lazy" />
                                ) : (
                                    <video src={moment.url} controls className="object-cover w-full h-full" />
                                )}
                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-stone-900/70 via-stone-900/40 to-transparent backdrop-blur-sm">
                                    <span className="text-xs text-white font-medium drop-shadow-lg">{new Date(moment.timestamp).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );

    // Ref for chat auto-scroll
    const messagesEndRef = React.useRef(null);

    // Auto-scroll chat to bottom when new messages arrive
    useEffect(() => {
        if (activeTab === 'Chat' && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [chatMessages, activeTab]);

    // Quran Audio Player - Free API (no key needed)
    const QuranRecitationTTS = () => {
        const [selectedSurah, setSelectedSurah] = useState(1);
        const [selectedReciter, setSelectedReciter] = useState('ar.abdulbasitmurattal');
        const [isLoading, setIsLoading] = useState(false);
        const [audioUrls, setAudioUrls] = useState([]);
        const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
        const [error, setError] = useState('');
        const audioRef = React.useRef(null);

        // Popular Surahs for easy selection
        const popularSurahs = [
            { number: 1, name: "Al-Fatiha (The Opening)", ayahs: 7 },
            { number: 2, name: "Al-Baqarah (The Cow)", ayahs: 286 },
            { number: 18, name: "Al-Kahf (The Cave)", ayahs: 110 },
            { number: 36, name: "Ya-Sin", ayahs: 83 },
            { number: 55, name: "Ar-Rahman (The Most Merciful)", ayahs: 78 },
            { number: 56, name: "Al-Waqi'ah (The Event)", ayahs: 96 },
            { number: 67, name: "Al-Mulk (The Kingdom)", ayahs: 30 },
            { number: 112, name: "Al-Ikhlas (Sincerity)", ayahs: 4 },
            { number: 113, name: "Al-Falaq (The Daybreak)", ayahs: 5 },
            { number: 114, name: "An-Nas (Mankind)", ayahs: 6 }
        ];

        // Popular reciters from alquran.cloud
        const reciters = [
            { id: 'ar.abdulbasitmurattal', name: 'Abdul Basit (Murattal)' },
            { id: 'ar.misharyalafasy', name: 'Mishary Rashid Alafasy' },
            { id: 'ar.abdullahbasfar', name: 'Abdullah Basfar' },
            { id: 'ar.abdurrahmaansudais', name: 'Abdurrahman As-Sudais' },
            { id: 'ar.shaatree', name: 'Abu Bakr Ash-Shaatree' }
        ];

        // Auto-play next ayah when current one ends
        const handleAudioEnded = () => {
            if (currentAyahIndex < audioUrls.length - 1) {
                setCurrentAyahIndex(currentAyahIndex + 1);
            } else {
                // Surah completed
                setCurrentAyahIndex(0);
            }
        };

        // Update audio source when ayah index changes
        useEffect(() => {
            if (audioUrls.length > 0 && audioRef.current) {
                audioRef.current.load();
                audioRef.current.play().catch(e => console.log('Autoplay prevented:', e));
            }
        }, [currentAyahIndex, audioUrls]);

        const loadAudio = async () => {
            setIsLoading(true);
            setError('');
            setAudioUrls([]);
            setCurrentAyahIndex(0);

            try {
                // AlQuran.cloud API - Free, no key needed
                const response = await fetch(`https://api.alquran.cloud/v1/surah/${selectedSurah}/${selectedReciter}`);
                
                if (!response.ok) {
                    throw new Error('Failed to fetch audio');
                }

                const data = await response.json();
                
                if (data.status === 'OK' && data.data.ayahs && data.data.ayahs.length > 0) {
                    // Get all ayah audio URLs for continuous playback
                    const allAudioUrls = data.data.ayahs
                        .map(ayah => ayah.audio)
                        .filter(url => url && url.trim() !== '');
                    
                    if (allAudioUrls.length > 0) {
                        setAudioUrls(allAudioUrls);
                        // Audio will auto-play via useEffect
                    } else {
                        throw new Error('No audio available for this selection');
                    }
                } else {
                    throw new Error('Invalid response from API');
                }
            } catch (err) {
                console.error('Audio load error:', err);
                setError('Failed to load audio. Please check your internet connection.');
            } finally {
                setIsLoading(false);
            }
        };

        return (
            <div className="space-y-4">
                <Card title="Quran Recitation (Online)" className="bg-gradient-to-br from-amber-50/40 to-orange-50/40">
                    <p className="text-sm italic text-stone-600 mb-4">
                        Listen to complete Surah recitations from renowned reciters. Requires internet connection.
                    </p>

                    {/* Surah Selector */}
                    <div className="mb-4">
                        <label htmlFor="surahSelector" className="block text-sm font-medium text-stone-700 mb-2">
                            Choose Surah
                        </label>
                        <select 
                            id="surahSelector" 
                            value={selectedSurah}
                            onChange={(e) => setSelectedSurah(Number(e.target.value))}
                            className="w-full p-3 border border-amber-200/40 bg-stone-50/50 backdrop-blur-sm rounded-lg focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 appearance-none pr-8 cursor-pointer"
                        >
                            {popularSurahs.map((surah) => (
                                <option key={surah.number} value={surah.number}>
                                    {surah.number}. {surah.name} ({surah.ayahs} ayahs)
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Reciter Selector */}
                    <div className="mb-6">
                        <label htmlFor="reciterSelector" className="block text-sm font-medium text-stone-700 mb-2">
                            Choose Reciter
                        </label>
                        <select 
                            id="reciterSelector" 
                            value={selectedReciter}
                            onChange={(e) => setSelectedReciter(e.target.value)}
                            className="w-full p-3 border border-amber-200/40 bg-stone-50/50 backdrop-blur-sm rounded-lg focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 appearance-none pr-8 cursor-pointer"
                        >
                            {reciters.map((reciter) => (
                                <option key={reciter.id} value={reciter.id}>
                                    {reciter.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Load Audio Button */}
                    <button 
                        onClick={loadAudio}
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:shadow-amber-500/50 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg flex items-center justify-center disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Loading Audio...
                            </>
                        ) : (
                            <>
                                <Volume2 size={20} className="mr-2" />
                                Load & Play Recitation
                            </>
                        )}
                    </button>

                    {/* Error Message */}
                    {error && (
                        <div className="mt-4 p-3 bg-rose-50/80 backdrop-blur-sm text-rose-700 rounded-xl text-center font-medium border border-rose-200/50">
                            {error}
                        </div>
                    )}

                    {/* Audio Player */}
                    {audioUrls.length > 0 && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-amber-50/60 to-orange-50/60 backdrop-blur-sm rounded-xl border border-amber-200/40">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-semibold text-stone-800">Now Playing:</p>
                                <p className="text-xs text-stone-600">
                                    Ayah {currentAyahIndex + 1} / {audioUrls.length}
                                </p>
                            </div>
                            <audio 
                                ref={audioRef} 
                                controls 
                                className="w-full"
                                onEnded={handleAudioEnded}
                            >
                                <source src={audioUrls[currentAyahIndex]} type="audio/mpeg" />
                                Your browser does not support the audio element.
                            </audio>
                            <p className="text-xs text-stone-500 mt-2 italic">
                                ✨ Full Surah playback - Each ayah will play automatically one after another
                            </p>
                        </div>
                    )}

                    {/* Info Box */}
                    <div className="mt-4 p-3 bg-amber-50/50 rounded-lg border border-amber-100/40">
                        <p className="text-xs text-stone-600">
                            🌐 Audio provided by <strong>alquran.cloud</strong> - A free, open-source Quran API
                        </p>
                    </div>
                </Card>
            </div>
        );
    };

    const QuranRecitationTTS_OLD = () => {
        const [textToRecite, setTextToRecite] = useState(QURAN_PRAYERS[0].text);
        const [isLoading, setIsLoading] = useState(false);
        const [error, setError] = useState('');
        const [audioUrl, setAudioUrl] = useState('');
        const audioRef = React.useRef(null);

        const handlePrayerSelection = (e) => {
            const index = e.target.value;
            if (index === '') {
                setTextToRecite('');
            } else {
                setTextToRecite(QURAN_PRAYERS[parseInt(index)].text);
            }
            setError('');
            setAudioUrl('');
        };

        const generateSpeech = async () => {
            if (!textToRecite.trim()) {
                setError(t("textToReciteLabel"));
                return;
            }

            setError('');
            setIsLoading(true);
            setAudioUrl('');

            const apiUrl = `${API_BASE_URL}${MODEL_NAME}:generateContent?key=${API_KEY}`;
            let attempt = 0;

            const payload = {
                contents: [{
                    // Use a system instruction to guide the tone, language, and voice (Charon is the male voice)
                    parts: [{ text: `Say in a clear, formal male voice in Arabic (ar-EG) for Quranic recitation: ${textToRecite}` }]
                }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: "Charon" } // Formal male voice
                        },
                        languageCode: "ar-EG" 
                    }
                },
            };

            while (attempt < MAX_RETRIES) {
                try {
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error?.message || `API returned status ${response.status}`);
                    }

                    const result = await response.json();
                    
                    const part = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith("audio/L16"));
                    const audioData = part?.inlineData?.data;
                    const mimeType = part?.inlineData?.mimeType;

                    if (audioData && mimeType) {
                        const rateMatch = mimeType.match(/rate=(\d+)/);
                        const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000; 

                        const pcmDataBuffer = base64ToArrayBuffer(audioData);
                        const pcm16 = new Int16Array(pcmDataBuffer);
                        
                        const wavBlob = pcmToWav(pcm16, sampleRate);
                        const url = URL.createObjectURL(wavBlob);
                        
                        setAudioUrl(url);
                        // Autoplay if successful (this might not work on all mobile browsers)
                        if(audioRef.current) {
                            audioRef.current.load();
                            audioRef.current.play().catch(e => console.log("Autoplay blocked:", e));
                        }
                        setIsLoading(false);
                        return;
                    } else {
                        throw new Error("API response did not contain valid audio data.");
                    }

                } catch (e) {
                    console.error(`Attempt ${attempt + 1} failed:`, e);
                    attempt++;
                    if (attempt < MAX_RETRIES) {
                        const delay = Math.pow(2, attempt) * 1000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        setError(t("messageReciteFail"));
                        setIsLoading(false);
                    }
                }
            }
        };

        return (
            <div className="space-y-4">
                <Card title={t("recitationTitle")} className="bg-gradient-to-br from-amber-50/40 to-orange-50/40">
                    <p className="text-sm italic text-stone-600 mb-4">
                        {t("recitationSubtitle")}
                    </p>

                    {/* Selector */}
                    <div className="mb-4">
                        <label htmlFor="prayerSelector" className="block text-sm font-medium text-slate-700 mb-2">{t("chooseText")}</label>
                        <select 
                            id="prayerSelector" 
                            onChange={handlePrayerSelection}
                            className="w-full p-3 border border-indigo-200/50 bg-white/50 backdrop-blur-sm rounded-lg focus:ring-2 focus:ring-indigo-300/50 focus:border-indigo-300 appearance-none pr-8 cursor-pointer"
                            defaultValue={0}
                        >
                            <option value="">--- {t("chooseText")} ---</option>
                            {QURAN_PRAYERS.map((prayer, index) => (
                                <option key={index} value={index}>
                                    {prayer.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Textarea */}
                    <div className="mb-6">
                        <label htmlFor="quranText" className="block text-sm font-medium text-slate-700 mb-2">{t("textToReciteLabel")}</label>
                        <textarea 
                            id="quranText" 
                            rows="4" 
                            dir="rtl" 
                            value={textToRecite}
                            onChange={(e) => setTextToRecite(e.target.value)}
                            className="w-full p-3 border border-indigo-200/50 bg-white/50 backdrop-blur-sm rounded-lg focus:ring-2 focus:ring-indigo-300/50 focus:border-indigo-300 text-right text-lg resize-none" 
                            placeholder="بسم الله الرحمن الرحيم"
                            disabled={isLoading}
                        />
                    </div>
                    
                    {/* Recite Button */}
                    <button 
                        onClick={generateSpeech}
                        disabled={isLoading || !textToRecite.trim()}
                        className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:shadow-indigo-500/50 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg flex items-center justify-center disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {t("messageGenerating")}
                            </>
                        ) : (
                            <>
                                <Mic size={20} className="mr-2" />
                                {t("reciteButton")}
                            </>
                        )}
                    </button>

                    {/* Error Box */}
                    {error && (
                        <div className="mt-4 p-3 bg-rose-50/80 backdrop-blur-sm text-rose-700 rounded-xl text-center font-medium border border-rose-200/50">
                            {error}
                        </div>
                    )}

                    {/* Audio Player */}
                    {audioUrl && (
                        <div className="mt-6 bg-gray-100 p-4 rounded-lg shadow-inner">
                            <p className="text-sm font-semibold text-stone-800 mb-2">Playback:</p>
                            <audio ref={audioRef} controls className="w-full">
                                <source src={audioUrl} type="audio/wav" />
                                Your browser does not support the audio element.
                            </audio>
                        </div>
                    )}
                </Card>
            </div>
        );
    };


    const renderContent = () => {
        if (!isAuthReady) {
            return (
                <div className="p-6 text-center">
                    <svg className="animate-spin h-8 w-8 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p>{t("loadingServices")}</p>
                </div>
            );
        }

        switch (activeTab) {
            case 'Home':
                return <QuranDaily />;
            case 'Prayer':
                return <PrayerNotifications />;
            case 'Calendar':
                return <PeriodCalendar />;
            case 'Dhikr':
                return <DhikrCounter />;
            case 'TTS':
                return <QuranRecitationTTS />;
            case 'Names':
                return <AsmaulHusna />;
            case 'Hijab':
                return <HijabStyles />;
            case 'Moments':
                return <SpecialMoments />;
            case 'Chat':
                return (
                    <div className="flex flex-col h-[70vh] max-h-[70vh] bg-stone-50/60 backdrop-blur-xl rounded-2xl shadow-xl border border-stone-200/20">
                        <div className="p-4 border-b border-stone-200/50 bg-gradient-to-r from-amber-500/10 to-orange-500/10 backdrop-blur-sm rounded-t-2xl">
                            <h2 className="text-lg font-semibold bg-gradient-to-r from-amber-700 to-orange-600 bg-clip-text text-transparent">{t("chatTitle")}</h2>
                            <p className="text-xs text-stone-500">End-to-end encrypted 🔐 • Private & secure • Notifications enabled 🔔</p>
                        </div>
                        <div className="flex-grow p-4 space-y-4 overflow-y-auto custom-scrollbar">
                            {chatMessages.length === 0 ? (
                                <p className="text-center text-stone-500 italic mt-8">{t("chatStart")}</p>
                            ) : (
                                chatMessages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[75%] px-4 py-3 rounded-2xl shadow-lg backdrop-blur-sm ${
                                            msg.senderId === userId
                                                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-br-none'
                                                : 'bg-stone-100/80 text-stone-800 rounded-tl-none border border-stone-200/50'
                                        }`}>
                                            <p className="text-sm">{decryptedMessages[msg.id] || 'Decrypting...'}</p>
                                            <span className={`text-xs block mt-1 ${msg.senderId === userId ? 'text-amber-100' : 'text-stone-400'}`}>
                                                {msg.timestamp?.toDate ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        <form onSubmit={handleSendMessage} className="p-4 border-t flex space-x-2">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder={t("chatPlaceholder")}
                                className="flex-grow p-3 border border-stone-200/50 bg-stone-50/50 backdrop-blur-sm rounded-full focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300"
                                disabled={!isAuthReady}
                                autoComplete="off"
                            />
                            <button
                                type="submit"
                                className="p-3 text-white bg-gradient-to-r from-amber-500 to-orange-600 rounded-full shadow-xl hover:shadow-amber-500/50 transition-all disabled:opacity-50"
                                disabled={!isAuthReady || !chatInput.trim()}
                            >
                                <Send size={24} />
                            </button>
                        </form>
                    </div>
                );
            default:
                return <QuranDaily />;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-sky-50 flex flex-col font-sans">
            {/* Password Lock Screen */}
            {!isAuthenticated && (
                <div className="fixed inset-0 bg-gradient-to-br from-amber-100 via-stone-100 to-sky-100 flex items-center justify-center z-50 p-4">
                    <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 max-w-md w-full border border-amber-200/50">
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full mb-4 shadow-lg">
                                <Lock size={40} className="text-white" />
                            </div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-700 to-stone-600 bg-clip-text text-transparent mb-2">
                                My Serene Life
                            </h1>
                            <p className="text-sm italic text-rose-600">
                                With all my love for you my Queen ❤️
                            </p>
                        </div>
                        
                        <form onSubmit={handlePasswordSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-2">
                                    Enter Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={passwordInput}
                                    onChange={(e) => setPasswordInput(e.target.value)}
                                    placeholder="Enter your password"
                                    className="w-full p-4 border-2 border-amber-200/50 bg-stone-50/50 backdrop-blur-sm rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all text-center text-lg"
                                    autoFocus
                                />
                            </div>
                            
                            {passwordError && (
                                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm text-center">
                                    {passwordError}
                                </div>
                            )}
                            
                            <button
                                type="submit"
                                className="w-full p-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl hover:shadow-amber-500/50 transition-all transform hover:scale-105"
                            >
                                Unlock
                            </button>
                        </form>
                        
                        <p className="text-xs text-stone-500 text-center mt-6">
                            This app is private and for authorized users only
                        </p>
                    </div>
                </div>
            )}

            {/* Header/Status Bar */}
            <div className="sticky top-0 z-10 p-4 bg-stone-50/70 backdrop-blur-xl border-b border-stone-200/20 shadow-sm flex justify-between items-center">
                <div className="flex items-center">
                    <Moon size={28} className="mr-2 text-amber-600" />
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-amber-700 to-stone-600 bg-clip-text text-transparent">
                            {t('appName')}
                        </h1>
                        <p className="text-xs italic text-rose-600 mt-0.5">
                            With all my love for you my Queen ❤️
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setLanguage(language === 'en' ? 'tr' : 'en')}
                    className="px-4 py-2 text-sm font-semibold rounded-full bg-amber-100/60 backdrop-blur-md text-amber-800 hover:bg-amber-100/80 transition-all border border-amber-200/50 shadow-sm"
                >
                    {language === 'en' ? 'TR' : 'EN'}
                </button>
            </div>
            
            <div className="p-4 pt-0 bg-stone-50/50 backdrop-blur-md">
                <p className="text-xs text-stone-600 mt-1">
                    {t('status')}: {isAuthReady ? t('statusConnected') : t('statusConnecting')}
                </p>
                {/* Status Message Box */}
                {statusMessage && (
                    <div className="mt-2 p-3 text-sm bg-amber-50/80 backdrop-blur-sm text-amber-900 rounded-xl border border-amber-100">
                        {statusMessage}
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <main className="flex-grow p-4 overflow-y-auto pb-20">
                <div className="max-w-xl mx-auto">
                    {renderContent()}
                </div>
            </main>

            {/* Mobile Tab Navigation (Footer) */}
            <div className="fixed bottom-0 left-0 right-0 bg-stone-50/70 backdrop-blur-xl border-t border-stone-200/20 shadow-2xl z-20">
                <div className="max-w-xl mx-auto grid grid-cols-8 justify-around">
                    <TabButton icon={Home} label={t("tabQuran")} tabName="Home" />
                    <TabButton icon={CloudSun} label={t("tabPrayer")} tabName="Prayer" />
                    <TabButton icon={Volume2} label={t("tabTTS")} tabName="TTS" />
                    <TabButton icon={Book} label={t("tabNames")} tabName="Names" />
                    <TabButton icon={Scissors} label={t("tabHijab")} tabName="Hijab" />
                    <TabButton icon={Target} label={t("tabDhikr")} tabName="Dhikr" />
                    <TabButton icon={UploadCloud} label={t("tabMoments")} tabName="Moments" />
                    <TabButton icon={MessageCircle} label={t("tabChat")} tabName="Chat" />
                </div>
            </div>
        </div>
    );
}