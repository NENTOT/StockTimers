// Configuration file for Stock Timers Dashboard
// This file contains all configurable settings for the application

const config = {
  // API Configuration
  api: {
    baseUrl: 'https://grow-a-garden-api-4ses.onrender.com/api',
    endpoints: {
      stock: '/stock/GetStock'
    },
    timeout: 30000, // 30 seconds
    retryAttempts: 3,
    retryDelay: 1000 // 1 second
  },

  // Firebase Configuration
  // Use environment variables or fallback to defaults
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAALOGLNNT9SOG4ypxrLH6ZbPd-bubakYA",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "gagstockdb.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "gagstockdb",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "gagstockdb.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "66513958029",
    appId: process.env.FIREBASE_APP_ID || "1:66513958029:web:eb8bc26fd8694644719ec4"
  },

  // Timer Configuration
  timers: {
    // Update intervals in milliseconds
    displayUpdate: 1000,    // Update timer display every 1 second
    stockRefresh: 30000,    // Auto-refresh stock every 30 seconds if unchanged
    timerRecalculation: 60000, // Recalculate timers every minute
    
    // Restock intervals in minutes
    restockIntervals: {
      seed: 5,        // Seeds restock every 5 minutes
      gear: 5,        // Gear restocks every 5 minutes
      egg: 30,        // Eggs restock every 30 minutes
      cosmetic: 180   // Cosmetics restock every 3 hours
    },

    // Timer categories with display information
    categories: {
      seed: {
        name: 'Seed Restock',
        emoji: '🌱',
        element: 'seedTimer',
        container: 'seed-timer'
      },
      gear: {
        name: 'Gear Restock',
        emoji: '⚙️',
        element: 'gearTimer',
        container: 'gear-timer'
      },
      egg: {
        name: 'Egg Restock',
        emoji: '🥚',
        element: 'eggTimer',
        container: 'egg-timer'
      },
      cosmetic: {
        name: 'Cosmetic Restock',
        emoji: '💄',
        element: 'cosmeticTimer',
        container: 'cosmetic-timer'
      }
    }
  },

  // Stock Configuration
  stock: {
    // Stock categories with display information
    categories: [
      {
        key: 'seedsStock',
        name: 'Seeds',
        emoji: '🌱',
        color: '#28a745'
      },
      {
        key: 'gearStock',
        name: 'Gears',
        emoji: '⚙️',
        color: '#007bff'
      },
      {
        key: 'eggStock',
        name: 'Eggs',
        emoji: '🥚',
        color: '#ffc107'
      },
      {
        key: 'cosmeticsStock',
        name: 'Cosmetics',
        emoji: '💄',
        color: '#e83e8c'
      }
    ],

    // Auto-refresh settings
    autoRefresh: {
      enabled: true,
      onTimerExpiry: true,
      onStockChange: true,
      onNoChange: true,
      noChangeDelay: 30000 // 30 seconds
    }
  },

  // History Configuration
  history: {
    maxEntries: 50,
    collections: {
      stockHistory: 'stock_history',
      stockChanges: 'stock_changes'
    },
    displayLimit: 20,
    autoSave: true
  },

  // UI Configuration
  ui: {
    // Theme colors
    colors: {
      primary: '#007bff',
      success: '#28a745',
      warning: '#ffc107',
      danger: '#dc3545',
      info: '#17a2b8',
      light: '#f8f9fa',
      dark: '#343a40'
    },

    // Animation settings
    animations: {
      enabled: true,
      duration: 300,
      easing: 'ease-in-out'
    },

    // Layout settings
    layout: {
      maxWidth: '1200px',
      gridGap: '30px',
      mobileBreakpoint: '768px',
      compactBreakpoint: '480px'
    },

    // Status messages
    messages: {
      connected: 'Connected to stock service',
      disconnected: 'Disconnected from stock service',
      loading: 'Loading stock data...',
      error: 'Error loading stock data',
      noChanges: 'Stock unchanged - Auto-refresh in 30 seconds',
      changes: 'Stock updated - {count} changes detected!'
    }
  },

  // Debug Configuration
  debug: {
    enabled: false, // Set to true for development
    logLevel: 'info', // 'error', 'warn', 'info', 'debug'
    showTimestamps: true,
    showCategories: true
  },

  // Performance Configuration
  performance: {
    // Optimize for mobile devices
    reducedMotion: false,
    lowEndDevice: false,
    
    // Memory management
    maxHistoryItems: 100,
    cleanupInterval: 300000, // 5 minutes
    
    // Network optimization
    compression: true,
    caching: true,
    prefetch: false
  },

  // Security Configuration
  security: {
    // API security
    validateResponses: true,
    sanitizeInput: true,
    
    // Firebase security
    enableOfflineMode: true,
    maxRetries: 3,
    
    // Client-side security
    preventXSS: true,
    secureHeaders: true
  },

  // Feature flags
  features: {
    firebase: true,
    history: true,
    notifications: false,
    sounds: false,
    darkMode: false,
    exportData: false,
    importData: false
  }
};

// Environment-specific overrides
if (typeof window !== 'undefined') {
  // Browser environment
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    config.debug.enabled = true;
    config.debug.logLevel = 'debug';
  }
  
  // Override with window environment variables if available
  if (window.FIREBASE_API_KEY) {
    config.firebase.apiKey = window.FIREBASE_API_KEY;
  }
  if (window.FIREBASE_AUTH_DOMAIN) {
    config.firebase.authDomain = window.FIREBASE_AUTH_DOMAIN;
  }
  if (window.FIREBASE_PROJECT_ID) {
    config.firebase.projectId = window.FIREBASE_PROJECT_ID;
  }
  if (window.FIREBASE_STORAGE_BUCKET) {
    config.firebase.storageBucket = window.FIREBASE_STORAGE_BUCKET;
  }
  if (window.FIREBASE_MESSAGING_SENDER_ID) {
    config.firebase.messagingSenderId = window.FIREBASE_MESSAGING_SENDER_ID;
  }
  if (window.FIREBASE_APP_ID) {
    config.firebase.appId = window.FIREBASE_APP_ID;
  }
}

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = config;
} else {
  // Browser environment
  window.StockTimersConfig = config;
}

// Validation function
function validateConfig(config) {
  const required = [
    'api.baseUrl',
    'firebase.apiKey',
    'firebase.projectId',
    'timers.restockIntervals'
  ];
  
  const missing = required.filter(path => {
    const value = path.split('.').reduce((obj, key) => obj?.[key], config);
    return value === undefined || value === null || value === '';
  });
  
  if (missing.length > 0) {
    console.error('Missing required configuration:', missing);
    return false;
  }
  
  return true;
}

// Auto-validate configuration
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (!validateConfig(config)) {
      console.error('Configuration validation failed');
    }
  });
}