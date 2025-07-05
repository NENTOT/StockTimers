// Configuration file for the Stock Timers & Inventory application
const CONFIG = {
  // API Configuration
  API_BASE_URL: 'https://grow-a-garden-api-4ses.onrender.com/api',
  
  // Update intervals
  UPDATE_INTERVAL: 1000, // 1 second for timers
  STOCK_AUTO_REFRESH_DELAY: 30000, // 30 seconds for stock auto-refresh
  
  // Firebase Configuration - Uses environment variables with fallbacks
  // Note: In Netlify, these should be set as environment variables
  FIREBASE_CONFIG: {
    apiKey: window.FIREBASE_API_KEY || "AIzaSyAALOGLNNT9SOG4ypxrLH6ZbPd-bubakYA",
    authDomain: window.FIREBASE_AUTH_DOMAIN || "gagstockdb.firebaseapp.com",
    projectId: window.FIREBASE_PROJECT_ID || "gagstockdb",
    storageBucket: window.FIREBASE_STORAGE_BUCKET || "gagstockdb.firebasestorage.app",
    messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || "66513958029",
    appId: window.FIREBASE_APP_ID || "1:66513958029:web:eb8bc26fd8694644719ec4",
    measurementId: "G-3VF58SPQ72"
  },
  
  // Timer Configuration - Known restock intervals (in minutes)
  RESTOCK_INTERVALS: {
    seed: 5,      // Seeds restock every 5 minutes
    gear: 5,      // Gear restocks every 5 minutes  
    egg: 30,      // Eggs restock every 30 minutes
    cosmetic: 180 // Cosmetics restock every 3 hours
  },
  
  // Stock Categories Configuration
  STOCK_CATEGORIES: [
    { key: 'seedsStock', name: 'Seeds', emoji: '🌱' },
    { key: 'gearStock', name: 'Gears', emoji: '⚙️' },
    { key: 'eggStock', name: 'Eggs', emoji: '🥚' },
    { key: 'cosmeticsStock', name: 'Cosmetics', emoji: '💄' }
  ],
  
  // Timer Mapping for UI elements
  TIMER_MAPPING: {
    'seedTimer': 'seed',
    'gearTimer': 'gear',
    'eggTimer': 'egg',
    'cosmeticTimer': 'cosmetic'
  },
  
  // Firebase Collections
  FIREBASE_COLLECTIONS: {
    STOCK_HISTORY: 'stock_history',
    STOCK_CHANGES: 'stock_changes'
  },
  
  // UI Configuration
  UI_CONFIG: {
    HISTORY_LIMIT: 50,
    STOCK_DISPLAY_LIMIT: 100
  }
};

// Make config available globally
window.CONFIG = CONFIG;