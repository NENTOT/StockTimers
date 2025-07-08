// Firebase Configuration - Use environment variables or fallback to defaults
const firebaseConfig = {
    apiKey: window.FIREBASE_API_KEY || "AIzaSyAALOGLNNT9SOG4ypxrLH6ZbPd-bubakYA",
    authDomain: window.FIREBASE_AUTH_DOMAIN || "gagstockdb.firebaseapp.com",
    projectId: window.FIREBASE_PROJECT_ID || "gagstockdb",
    storageBucket: window.FIREBASE_STORAGE_BUCKET || "gagstockdb.firebasestorage.app",
    messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || "66513958029",
    appId: window.FIREBASE_APP_ID || "1:66513958029:web:eb8bc26fd8694644719ec4"
};

// Initialize Firebase
let db = null;
let firebaseApp = null;
 let notificationsEnabled = false;
let watchedItems = new Set();
let previousStockItems = new Set();


async function initializeFirebase() {
    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        
        // Test connection
        await db.collection('current_stock').limit(1).get();
        
        document.getElementById('firebase-status').textContent = '🔥 Firebase: Connected';
        document.getElementById('firebase-status').className = 'status firebase-connected';
        console.log('✅ Firebase initialized successfully');
        
        return true;
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        document.getElementById('firebase-status').textContent = '🔥 Firebase: Connection failed';
        document.getElementById('firebase-status').className = 'status disconnected';
        return false;
    }
}

// API Configuration
const API_BASE_URL = 'https://grow-a-garden-api-4ses.onrender.com/api';
const UPDATE_INTERVAL = 1000; // 1 second for timers

// State management
let timerUpdateInterval;
let stockRefreshTimeout = null;
let restockTimes = {};
let historyVisible = false;
let lastStockData = null; // Store last stock data for comparison

// Timer elements
const timerElements = {
    seedTimer: document.getElementById('seedTimer'),
    gearTimer: document.getElementById('gearTimer'),
    eggTimer: document.getElementById('eggTimer'),
    cosmeticTimer: document.getElementById('cosmeticTimer')
};

const timerContainers = {
    seedTimer: document.getElementById('seed-timer'),
    gearTimer: document.getElementById('gear-timer'),
    eggTimer: document.getElementById('egg-timer'),
    cosmeticTimer: document.getElementById('cosmetic-timer')
};

const stockStatusElement = document.getElementById('stock-status');
const stockContainer = document.getElementById('stock-container');
const stockTimestamp = document.getElementById('stock-timestamp');
const historyContainer = document.getElementById('history-container');
const historySection = document.getElementById('history-section');

// Timer mapping for calculated timers
const timerMapping = {
    'seedTimer': 'seed',
    'gearTimer': 'gear',
    'eggTimer': 'egg',
    'cosmeticTimer': 'cosmetic'
};

// Helper function to create a comparable stock signature
function createStockSignature(stockData) {
    const signature = {};
    
    // Create signatures for each category
    const categories = ['seedsStock', 'gearStock', 'eggStock', 'cosmeticsStock'];
    
    categories.forEach(category => {
        const items = stockData[category] || [];
        signature[category] = items.map(item => ({
            name: item.name,
            value: item.value
        })).sort((a, b) => a.name.localeCompare(b.name));
    });
    
    return signature;
}

// Helper function to compare stock signatures
function stockDataChanged(newStockData, oldStockData) {
    if (!oldStockData) {
        console.log('📦 No previous stock data, considering as changed');
        return true;
    }
    
    const newSignature = createStockSignature(newStockData);
    const oldSignature = createStockSignature(oldStockData);
    
    const newSigStr = JSON.stringify(newSignature);
    const oldSigStr = JSON.stringify(oldSignature);
    
    const hasChanged = newSigStr !== oldSigStr;
    
    if (!hasChanged) {
        console.log('📦 Detailed comparison:');
        console.log('📦 New signature length:', newSigStr.length);
        console.log('📦 Old signature length:', oldSigStr.length);
        console.log('📦 Signatures match exactly');
    }
    
    return hasChanged;
}


// Firebase Database Functions
async function saveCurrentStockToFirebase(stockData) {
    if (!db) return;
    
    try {
        // Only save if stock data has actually changed
        if (!stockDataChanged(stockData, lastStockData)) {
            console.log('📦 Stock data unchanged, skipping save to Firebase');
            return;
        }
        
        const docData = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            stockData: stockData,
            categories: {
                seeds: stockData.seedsStock || [],
                gear: stockData.gearStock || [],
                eggs: stockData.eggStock || [],
                cosmetics: stockData.cosmeticsStock || []
            },
            totalItems: {
                seeds: stockData.seedsStock?.length || 0,
                gear: stockData.gearStock?.length || 0,
                eggs: stockData.eggStock?.length || 0,
                cosmetics: stockData.cosmeticsStock?.length || 0
            }
        };

        await db.collection('current_stock').add(docData);
        console.log('✅ Stock changes saved to Firebase');
        
        // Update last stock data
        lastStockData = JSON.parse(JSON.stringify(stockData));
        
    } catch (error) {
        console.error('❌ Error saving current stock to Firebase:', error);
    }
}

async function getStockHistoryFromFirebase(limit = 50) {
    if (!db) return [];
    
    try {
        const snapshot = await db.collection('current_stock')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        const history = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            history.push({
                id: doc.id,
                timestamp: data.timestamp?.toDate() || new Date(),
                stockData: data.stockData,
                categories: data.categories,
                totalItems: data.totalItems
            });
        });

        return history;
    } catch (error) {
        console.error('❌ Error fetching stock history from Firebase:', error);
        return [];
    }
}

// Initialize last stock data from Firebase on startup
async function loadLastStockData() {
    if (!db) return;
    
    try {
        const snapshot = await db.collection('current_stock')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            lastStockData = data.stockData;
            console.log('📦 Loaded last stock data from Firebase');
        }
    } catch (error) {
        console.error('❌ Error loading last stock data:', error);
    }
}

// Utility functions
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
}

function updateStockStatus(connected, message = null) {
    if (connected) {
        stockStatusElement.textContent = message || 'Connected to stock service';
        stockStatusElement.className = 'status connected';
        document.getElementById('refreshAllBtn').disabled = false;
    } else {
        stockStatusElement.textContent = message || 'Disconnected from stock service';
        stockStatusElement.className = 'status disconnected';
        document.getElementById('refreshAllBtn').disabled = true;
    }
}

// Calculate timers based on known restock intervals
function calculateTimers() {
    try {
        const now = Date.now();
        
        // Known restock intervals (in minutes)
        const intervals = {
            seed: 5,    // Seeds restock every 5 minutes
            gear: 5,    // Gear restocks every 5 minutes  
            egg: 30,    // Eggs restock every 30 minutes
            cosmetic: 180 // Cosmetics restock every 3 hours
        };

        restockTimes = {};
        
        Object.entries(intervals).forEach(([key, intervalMinutes]) => {
            const intervalMs = intervalMinutes * 60 * 1000;
            const timeSinceEpoch = now;
            const timeIntoCurrentInterval = timeSinceEpoch % intervalMs;
            const nextRestockTime = now + (intervalMs - timeIntoCurrentInterval);
            const remaining = Math.max(0, Math.floor((nextRestockTime - now) / 1000));
            
            restockTimes[key] = {
                restockTime: nextRestockTime,
                remaining: remaining
            };
        });

        updateTimerDisplay();
        
    } catch (error) {
        console.error('Error calculating timers:', error);
    }
}

// Update timer display
function updateTimerDisplay() {
    const now = Date.now();
    
    Object.entries(timerMapping).forEach(([elementKey, apiKey]) => {
        const element = timerElements[elementKey];
        const container = timerContainers[elementKey];
        
        if (element && container && restockTimes[apiKey]) {
            const timerData = restockTimes[apiKey];
            const remaining = Math.max(0, Math.floor((timerData.restockTime - now) / 1000));
            const isExpired = remaining <= 0;

            element.textContent = isExpired ? 'Restocked!' : formatTime(remaining);
            element.className = isExpired ? 'timer-time expired' : 'timer-time';
            container.className = isExpired ? 'timer expired' : 'timer';

            // Auto-refresh stock when timer expires
            if (isExpired && element.dataset.expired !== 'true') {
                element.dataset.expired = 'true';
                console.log(`⏰ ${apiKey} expired, refreshing stock...`);
                fetchStock();
            } else if (!isExpired) {
                element.dataset.expired = '';
            }
        }
    });
}

// Stock functions
// Replace your existing fetchStock function with this one
async function fetchStock() {
    try {
        stockContainer.innerHTML = '<div class="loading">Loading stock data...</div>';
        
        // Add cache-busting parameter to ensure fresh data
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/stock/GetStock?_t=${timestamp}`, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const stockData = await response.json();
        
        // Log the fetch
        console.log('📦 Stock data fetched at:', new Date().toISOString());
        console.log('📦 Raw stock data:', stockData);
        
        // Always display the current stock data
        displayStock(stockData);
        
        // ALWAYS save to Firebase - remove the comparison check
        await saveCurrentStockToFirebase(stockData);
        console.log('✅ Stock data saved to Firebase (no comparison)');
        
        // Check for new items for notifications
        if (typeof checkForNewItems === 'function') {
            checkForNewItems(stockData);
        }
        
        stockTimestamp.textContent = `Last updated: ${new Date().toLocaleString()}`;
        updateStockStatus(true, `Stock data loaded successfully`);
        
        // Refresh history if visible
        if (historyVisible) {
            displayHistory();
        }
        
        return stockData;
    } catch (error) {
        console.error('❌ Error fetching stock:', error);
        stockContainer.innerHTML = `<div class="error">Error loading stock data: ${error.message}</div>`;
        updateStockStatus(false, `Error: ${error.message}`);
        return null;
    }
}

// Simplified saveCurrentStockToFirebase function - remove comparison
async function saveCurrentStockToFirebase(stockData) {
    if (!db) return;
    
    try {
        const docData = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            stockData: stockData,
            categories: {
                seeds: stockData.seedsStock || [],
                gear: stockData.gearStock || [],
                eggs: stockData.eggStock || [],
                cosmetics: stockData.cosmeticsStock || []
            },
            totalItems: {
                seeds: stockData.seedsStock?.length || 0,
                gear: stockData.gearStock?.length || 0,
                eggs: stockData.eggStock?.length || 0,
                cosmetics: stockData.cosmeticsStock?.length || 0
            }
        };

        await db.collection('current_stock').add(docData);
        console.log('✅ Stock snapshot saved to Firebase');
        
    } catch (error) {
        console.error('❌ Error saving stock to Firebase:', error);
    }
}

// Optional: Add a function to save only when stock actually changes
async function saveOnlyIfChanged(stockData) {
    if (!db) return;
    
    try {
        // Check if stock data has actually changed
        if (!stockDataChanged(stockData, lastStockData)) {
            console.log('📦 Stock data unchanged, skipping save to Firebase');
            return;
        }
        
        const docData = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            stockData: stockData,
            categories: {
                seeds: stockData.seedsStock || [],
                gear: stockData.gearStock || [],
                eggs: stockData.eggStock || [],
                cosmetics: stockData.cosmeticsStock || []
            },
            totalItems: {
                seeds: stockData.seedsStock?.length || 0,
                gear: stockData.gearStock?.length || 0,
                eggs: stockData.eggStock?.length || 0,
                cosmetics: stockData.cosmeticsStock?.length || 0
            },
            changeDetected: true // Mark this as a change-based save
        };

        await db.collection('current_stock').add(docData);
        console.log('✅ Stock changes saved to Firebase');
        
        // Update last stock data
        lastStockData = JSON.parse(JSON.stringify(stockData));
        
    } catch (error) {
        console.error('❌ Error saving stock changes to Firebase:', error);
    }
}

// Add a toggle function if you want to switch between modes
let saveAllFetches = true; // Set to false if you want to save only changes

async function toggleSaveMode() {
    saveAllFetches = !saveAllFetches;
    console.log('💾 Save mode changed to:', saveAllFetches ? 'Save all fetches' : 'Save only changes');
    
    // Update the save function reference
    if (saveAllFetches) {
        window.saveStockFunction = saveCurrentStockToFirebase;
    } else {
        window.saveStockFunction = saveOnlyIfChanged;
    }
    
    return saveAllFetches;
}

// Initialize save mode
window.saveStockFunction = saveCurrentStockToFirebase;

// Make toggle function available globally
window.toggleSaveMode = toggleSaveMode;

async function displayHistory() {
    try {
        historyContainer.innerHTML = '<div class="loading">Loading history...</div>';

        const history = await getStockHistoryFromFirebase(20);

        if (history.length === 0) {
            historyContainer.innerHTML = '<div class="loading">No history available</div>';
            return;
        }

        let html = '';
        history.forEach(entry => {
            const date = entry.timestamp.toLocaleString();
            
            html += `
                <div class="history-item">
                    <div class="history-timestamp">${date}</div>
            `;
            
            // Display items from each category using the stock design
            const categories = [
                { key: 'seeds', name: 'Seeds', emoji: '🌱' },
                { key: 'gear', name: 'Gear', emoji: '⚙️' },
                { key: 'eggs', name: 'Eggs', emoji: '🥚' },
                { key: 'cosmetics', name: 'Cosmetics', emoji: '💄' }
            ];
            
            categories.forEach(category => {
                const items = entry.categories[category.key] || [];
                if (items.length > 0) {
                    html += `
                        <div class="history-category">
                            <h4>${category.emoji} ${category.name} (${items.length} items)</h4>
                            <div class="history-items">
                    `;
                    
                    items.forEach(item => {
                        html += `
                            <div class="history-item-detail">
                                <span class="history-item-name">${item.name}</span>
                                <span class="history-item-quantity">${item.value}</span>
                            </div>
                        `;
                    });
                    
                    html += `
                            </div>
                        </div>
                    `;
                }
            });
            
            html += `</div>`;
        });

        historyContainer.innerHTML = html;
    } catch (error) {
        console.error('Error displaying history:', error);
        historyContainer.innerHTML = '<div class="error">Error loading history</div>';
    }
}

function displayStock(stockData) {
    let html = '';
    
    const categories = [
        { key: 'seedsStock', name: 'Seeds', emoji: '🌱' },
        { key: 'gearStock', name: 'Gears', emoji: '⚙️' },
        { key: 'eggStock', name: 'Eggs', emoji: '🥚' },
        { key: 'cosmeticsStock', name: 'Cosmetics', emoji: '💄' }
    ];

    categories.forEach(category => {
        const items = stockData[category.key];
        if (items && items.length > 0) {
            html += `
                <div class="stock-category">
                    <h3>${category.emoji} ${category.name} (${items.length} items)</h3>
                    <div class="stock-items">
            `;
            
            items.forEach(item => {
                html += `
                    <div class="stock-item">
                        <span class="stock-item-name">${item.name}</span>
                        <span class="stock-item-quantity">${item.value}</span>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
    });

    if (html === '') {
        html = '<div class="loading">No stock data available</div>';
    }

    stockContainer.innerHTML = html;
}

// Database cleanup function
// Updated database cleanup function
async function clearOldStockData() {
    if (!db) return;
    
    try {
        console.log('🗑️ Starting database cleanup...');
        
        // Since we're now saving every fetch, we need to be more aggressive with cleanup
        // Keep last 200 entries instead of 100, and also clean up by time
        
        // First, clean up by count - keep last 200 entries
        const countSnapshot = await db.collection('current_stock')
            .orderBy('timestamp', 'desc')
            .offset(200)
            .get();
        
        // Second, clean up entries older than 7 days regardless of count
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const timeSnapshot = await db.collection('current_stock')
            .where('timestamp', '<', sevenDaysAgo)
            .get();
        
        // Combine both cleanup operations
        const docsToDelete = new Set();
        
        countSnapshot.forEach(doc => docsToDelete.add(doc.id));
        timeSnapshot.forEach(doc => docsToDelete.add(doc.id));
        
        if (docsToDelete.size > 0) {
            console.log(`🗑️ Found ${docsToDelete.size} entries to clean up`);
            
            // Delete in batches of 500 (Firestore limit)
            const deletePromises = [];
            let batch = db.batch();
            let batchCount = 0;
            
            for (const docId of docsToDelete) {
                const docRef = db.collection('current_stock').doc(docId);
                batch.delete(docRef);
                batchCount++;
                
                if (batchCount >= 500) {
                    deletePromises.push(batch.commit());
                    batch = db.batch();
                    batchCount = 0;
                }
            }
            
            // Commit final batch if it has any operations
            if (batchCount > 0) {
                deletePromises.push(batch.commit());
            }
            
            await Promise.all(deletePromises);
            console.log(`✅ Cleaned up ${docsToDelete.size} old stock entries`);
        } else {
            console.log('✅ No old entries to clean up');
        }
        
        // Add cleanup log
        await db.collection('system_logs').add({
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            action: 'database_cleanup',
            entriesRemoved: docsToDelete.size,
            cleanupType: 'count_and_time_based'
        });
        
        console.log('✅ Database cleanup completed successfully');
        
        // Refresh history display if visible
        if (historyVisible) {
            displayHistory();
        }
        
    } catch (error) {
        console.error('❌ Error during database cleanup:', error);
        
        // Log the error
        try {
            await db.collection('system_logs').add({
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                action: 'database_cleanup_error',
                error: error.message
            });
        } catch (logError) {
            console.error('❌ Error logging cleanup error:', logError);
        }
    }
}

// Updated scheduling function - clean up more frequently since we're saving more
function scheduleDailyCleanup() {
    const now = new Date();
    
    // Run cleanup every 12 hours instead of daily
    const cleanupInterval = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    
    console.log('🕐 Database cleanup scheduled every 12 hours');
    
    // Run first cleanup after 1 hour
    setTimeout(async () => {
        await clearOldStockData();
        
        // Then run every 12 hours
        setInterval(async () => {
            await clearOldStockData();
        }, cleanupInterval);
        
    }, 60 * 60 * 1000); // Wait 1 hour before first cleanup
}

// Manual cleanup function for testing
async function runManualCleanup() {
    console.log('🧹 Running manual database cleanup...');
    await clearOldStockData();
    console.log('✅ Manual cleanup completed');
}

// Make manual cleanup available globally
window.runManualCleanup = runManualCleanup;

function toggleHistory() {
    historyVisible = !historyVisible;
    const historyBtn = document.getElementById('historyBtn');
    
    if (historyVisible) {
        historySection.style.display = 'block';
        historyBtn.textContent = '📊 Hide History';
        displayHistory();
    } else {
        historySection.style.display = 'none';
        historyBtn.textContent = '📊 Show History';
    }
}

async function checkAPIHealth() {
    try {
        console.log('🔍 Checking API health...');
        
        const response = await fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        if (response.ok) {
            const health = await response.json();
            console.log('✅ API Health:', health);
            return health;
        } else {
            console.log('⚠️ API health check failed:', response.status);
            return null;
        }
    } catch (error) {
        console.error('❌ API health check error:', error);
        return null;
    }
}

// Replace your existing refreshAll function with this one
function refreshAll() {
    console.log('🔄 Starting refresh all...');
    
    // Clear any pending auto-refresh
    if (stockRefreshTimeout) {
        clearTimeout(stockRefreshTimeout);
        stockRefreshTimeout = null;
    }
    
    // Ask user if they want to force refresh if data hasn't changed recently
    const lastUpdate = stockTimestamp.textContent;
    const shouldForce = confirm('Do you want to force refresh the stock data? This will bypass the "unchanged" detection.\n\nClick OK for Force Refresh, or Cancel for Regular Refresh.');
    
    if (shouldForce) {
        console.log('🔄 User requested force refresh');
        forceRefreshStock();
    } else {
        console.log('🔄 User requested regular refresh');
        // Check API health first
        checkAPIHealth();
        
        // Calculate timers and fetch stock
        calculateTimers();
        fetchStock();
    }
    
    // Refresh history if visible
    if (historyVisible) {
        displayHistory();
    }
    
    console.log('✅ Refresh all completed');
}

// Update intervals
function startUpdates() {
    calculateTimers();
    fetchStock();
    timerUpdateInterval = setInterval(() => {
        updateTimerDisplay(); // Update display every second
        // Recalculate timers every 60 seconds to handle any drift
        if (Date.now() % 60000 < 1000) {
            calculateTimers();
        }
    }, UPDATE_INTERVAL);
}

function stopUpdates() {
    if (timerUpdateInterval) {
        clearInterval(timerUpdateInterval);
        timerUpdateInterval = null;
    }
}

// Page visibility handling
// Modified page visibility handling for notifications
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        // Only stop visual updates, keep stock checking if notifications are enabled
        if (timerUpdateInterval) {
            clearInterval(timerUpdateInterval);
            timerUpdateInterval = null;
        }
        
        // Keep stock checking active if notifications are enabled
        if (notificationsEnabled && watchedItems.size > 0) {
            console.log('🔔 Keeping stock monitoring active for notifications');
            // Continue fetching stock but less frequently to save resources
            if (stockRefreshTimeout) {
                clearTimeout(stockRefreshTimeout);
            }
            stockRefreshTimeout = setTimeout(fetchStock, 60000); // Check every minute instead
        } else {
            // Stop everything if notifications are disabled
            if (stockRefreshTimeout) {
                clearTimeout(stockRefreshTimeout);
                stockRefreshTimeout = null;
            }
        }
    } else {
        // Resume full updates when tab becomes visible
        startUpdates();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', function () {
    stopUpdates();
    if (stockRefreshTimeout) {
        clearTimeout(stockRefreshTimeout);
        stockRefreshTimeout = null;
    }
});

// Initialize
async function initialize() {
    // Initialize Firebase first
    const firebaseConnected = await initializeFirebase();
    
    if (firebaseConnected) {
        console.log('🔥 Firebase connected, starting updates...');
        
        // Load last stock data to prevent immediate duplicate
        await loadLastStockData();
        
        // Schedule daily cleanup
        scheduleDailyCleanup();
    } else {
        console.log('⚠️ Firebase not connected, continuing without database features...');
    }
    
    // Start the main application
    startUpdates();
    
    // Set up manual refresh button
    const refreshBtn = document.getElementById('refreshAllBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshAll);
    }
    
    // Set up history button
    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
        historyBtn.addEventListener('click', toggleHistory);
    }
}

// Start when page is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Check if running in background
async function checkBackgroundStatus() {
    try {
        const response = await fetch('/.netlify/functions/monitor-stock');
        const data = await response.json();
        console.log('Background monitoring:', data);
    } catch (error) {
        console.error('Background monitoring error:', error);
    }
}

 function initializeNotificationSystem() {
// Load saved preferences
const savedNotifications = localStorage.getItem('notificationsEnabled');
const savedWatchedItems = localStorage.getItem('watchedItems');

if (savedNotifications) {
    notificationsEnabled = JSON.parse(savedNotifications);
    document.getElementById('notificationToggle').checked = notificationsEnabled;
}

if (savedWatchedItems) {
    watchedItems = new Set(JSON.parse(savedWatchedItems));
    updateSelectedItemsDisplay();
    updateCheckboxes();
}

// Request notification permission
if ('Notification' in window && notificationsEnabled) {
    Notification.requestPermission();
}
}

// Event listeners for notification system
document.getElementById('notificationToggle').addEventListener('change', function(e) {
notificationsEnabled = e.target.checked;
localStorage.setItem('notificationsEnabled', JSON.stringify(notificationsEnabled));

if (notificationsEnabled && 'Notification' in window) {
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            showNotificationAlert('Notifications enabled! You\'ll be alerted when watched items restock.', 'success');
        } else {
            showNotificationAlert('Please allow notifications in your browser settings.', 'warning');
        }
    });
} else if (!notificationsEnabled) {
    showNotificationAlert('Notifications disabled.', 'warning');
}
});

// Dropdown functionality
document.getElementById('itemSelector').addEventListener('click', function(e) {
e.stopPropagation();
const dropdown = document.getElementById('dropdownContent');
dropdown.classList.toggle('show');
});

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
const dropdown = document.getElementById('dropdownContent');
if (!e.target.closest('.notification-dropdown')) {
    dropdown.classList.remove('show');
}
});

// Handle checkbox changes
document.getElementById('dropdownContent').addEventListener('change', function(e) {
if (e.target.type === 'checkbox') {
    const itemName = e.target.value;
    const category = e.target.dataset.category;
    
    if (e.target.checked) {
        watchedItems.add(itemName);
    } else {
        watchedItems.delete(itemName);
    }
    
    updateSelectedItemsDisplay();
    localStorage.setItem('watchedItems', JSON.stringify([...watchedItems]));
}
});

// Update selected items display
function updateSelectedItemsDisplay() {
const container = document.getElementById('selectedItemsList');

if (watchedItems.size === 0) {
    container.innerHTML = '<span style="color: #666;">No items selected</span>';
    return;
}

container.innerHTML = '';
watchedItems.forEach(item => {
    const itemElement = document.createElement('span');
    itemElement.className = 'selected-item';
    itemElement.innerHTML = `
        ${item}
        <button class="remove-btn" onclick="removeWatchedItem('${item}')">×</button>
    `;
    container.appendChild(itemElement);
});
}

// Update checkboxes based on watched items
function updateCheckboxes() {
const checkboxes = document.querySelectorAll('#dropdownContent input[type="checkbox"]');
checkboxes.forEach(checkbox => {
    checkbox.checked = watchedItems.has(checkbox.value);
});
}

// Remove watched item
function removeWatchedItem(itemName) {
watchedItems.delete(itemName);
updateSelectedItemsDisplay();
updateCheckboxes();
localStorage.setItem('watchedItems', JSON.stringify([...watchedItems]));
}

// Check for new stock items
function checkForNewItems(stockData) {
if (!notificationsEnabled || watchedItems.size === 0) return;

const currentStockItems = new Set();

// Extract all current stock items
const categories = ['seedsStock', 'gearStock', 'eggStock', 'cosmeticsStock'];
categories.forEach(category => {
    const items = stockData[category] || [];
    items.forEach(item => {
        currentStockItems.add(item.name);
    });
});

// Check for newly appeared watched items
const newItems = [];
watchedItems.forEach(watchedItem => {
    if (currentStockItems.has(watchedItem) && !previousStockItems.has(watchedItem)) {
        newItems.push(watchedItem);
    }
});

// Send notifications for new items
if (newItems.length > 0) {
    const message = newItems.length === 1 
        ? `${newItems[0]} is now in stock!`
        : `${newItems.length} watched items are now in stock: ${newItems.join(', ')}`;
    
    showNotification('🔔 Stock Alert', message);
    showNotificationAlert(message, 'success');
}

// Update previous stock items
previousStockItems = currentStockItems;
}

// Show browser notification
function showNotification(title, message) {
if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
        body: message,
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDMTMuMSAyIDE0IDIuOSAxNCA0VjVDMTcuMyA2LjcgMTkgMTAuMSAxOSAxNFYxOUwyMSAyMVYyMkg5SDE5VjIxTDE5IDE5VjE0QzE5IDEwLjEgMTcuMyA2LjcgMTQgNVY0QzE0IDIuOSAxMy4xIDIgMTIgMloiIGZpbGw9IiMwMDdiZmYiLz4KPC9zdmc+'
    });
}
}

// Show in-page notification alert
function showNotificationAlert(message, type = 'success') {
const alert = document.createElement('div');
alert.className = `notification-alert ${type}`;
alert.innerHTML = `
    ${message}
    <button class="close-btn" onclick="this.parentElement.remove()">×</button>
`;

document.body.appendChild(alert);

// Auto-remove after 5 seconds
setTimeout(() => {
    if (alert.parentElement) {
        alert.remove();
    }
}, 5000);
}

// Initialize notification system when page loads
document.addEventListener('DOMContentLoaded', function() {
initializeNotificationSystem();
});

// Make functions available globally for integration
window.checkForNewItems = checkForNewItems;
window.initializeNotificationSystem = initializeNotificationSystem;
function diagnosticCheck() {
    console.log('🔍 === DIAGNOSTIC CHECK ===');
    console.log('🔍 Current time:', new Date().toISOString());
    console.log('🔍 API Base URL:', API_BASE_URL);
    console.log('🔍 Firebase connected:', !!db);
    console.log('🔍 Notifications enabled:', notificationsEnabled);
    console.log('🔍 Watched items:', [...watchedItems]);
    console.log('🔍 Timer update interval active:', !!timerUpdateInterval);
    console.log('🔍 Stock refresh timeout active:', !!stockRefreshTimeout);
    console.log('🔍 History visible:', historyVisible);
    console.log('🔍 Last stock data exists:', !!lastStockData);
    console.log('🔍 Previous stock items count:', previousStockItems.size);
    console.log('🔍 === END DIAGNOSTIC ===');
}

// 7. Test the API endpoint directly
async function testAPIEndpoint() {
    console.log('🧪 Testing API endpoint...');
    
    try {
        // Test with multiple requests to see if data changes
        const results = [];
        
        for (let i = 0; i < 3; i++) {
            const timestamp = Date.now();
            const response = await fetch(`${API_BASE_URL}/stock/GetStock?_t=${timestamp}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            results.push({
                timestamp: new Date().toISOString(),
                dataSize: JSON.stringify(data).length,
                seedsCount: data.seedsStock?.length || 0,
                gearCount: data.gearStock?.length || 0,
                eggCount: data.eggStock?.length || 0,
                cosmeticsCount: data.cosmeticsStock?.length || 0
            });
            
            // Wait 1 second between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('🧪 API Test Results:', results);
        
        // Check if any results differ
        const signatures = results.map(r => `${r.seedsCount}-${r.gearCount}-${r.eggCount}-${r.cosmeticsCount}`);
        const uniqueSignatures = new Set(signatures);
        
        console.log('🧪 Unique signatures found:', uniqueSignatures.size);
        console.log('🧪 All signatures:', signatures);
        
        if (uniqueSignatures.size === 1) {
            console.log('⚠️ API is returning identical data - this might be why stock isn\'t updating');
        } else {
            console.log('✅ API is returning different data - stock should be updating');
        }
        
    } catch (error) {
        console.error('❌ API test failed:', error);
    }
}

// 8. Make functions available globally for console debugging
window.forceRefreshStock = forceRefreshStock;
window.checkAPIHealth = checkAPIHealth;
window.diagnosticCheck = diagnosticCheck;
window.testAPIEndpoint = testAPIEndpoint;