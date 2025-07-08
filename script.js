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
    if (!oldStockData) return true;
    
    const newSignature = createStockSignature(newStockData);
    const oldSignature = createStockSignature(oldStockData);
    
    return JSON.stringify(newSignature) !== JSON.stringify(oldSignature);
}

// Firebase Database Functions
async function saveCurrentStockToFirebase(stockData) {
    if (!db) return;
    
    try {
        // Ensure we have valid stock data before saving
        if (!stockData || typeof stockData !== 'object') {
            console.log('📦 Invalid stock data, skipping Firebase save');
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
        
        // Update last stock data after successful save
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

            // Auto-refresh stock when timer expires (only once per expiration)
            if (isExpired && element.dataset.expired !== 'true') {
                element.dataset.expired = 'true';
                console.log(`⏰ ${apiKey} timer expired, fetching fresh stock data...`);
                
                // Clear any pending auto-refresh timeout before fetching
                if (stockRefreshTimeout) {
                    clearTimeout(stockRefreshTimeout);
                    stockRefreshTimeout = null;
                }
                
                fetchStock();
            } else if (!isExpired) {
                element.dataset.expired = 'false';
            }
        }
    });
}

// Stock functions
async function fetchStock() {
    try {
        stockContainer.innerHTML = '<div class="loading">Loading stock data...</div>';
        
        console.log('🔍 Fetching stock from:', `${API_BASE_URL}/stock/GetStock`);
        
        // Add timeout and better error handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(`${API_BASE_URL}/stock/GetStock`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log('📡 Response status:', response.status);
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error Response:', errorText);
            
            // Try next endpoint if current one fails
            if (currentApiIndex < API_ENDPOINTS.length - 1) {
                console.log('🔄 Trying next API endpoint...');
                tryNextApiEndpoint();
                return fetchStock(); // Retry with new endpoint
            }
            
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const responseText = await response.text();
        console.log('📡 Raw response:', responseText.substring(0, 200) + '...');
        
        let stockData;
        try {
            stockData = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ JSON Parse Error:', parseError);
            throw new Error('Invalid JSON response from API');
        }
        
        console.log('📦 Parsed stock data:', stockData);
        
        // Validate stock data structure
        if (!stockData || typeof stockData !== 'object') {
            throw new Error('Invalid stock data structure received');
        }
        
        // Display the current stock data
        displayStock(stockData);
        
        // Check if stock data has actually changed
        const hasChanges = stockDataChanged(stockData, lastStockData);
        
        if (hasChanges) {
            // Save current stock snapshot to Firebase only if there are changes
            await saveCurrentStockToFirebase(stockData);
            
            // Clear any pending auto-refresh timeout since we have new data
            if (stockRefreshTimeout) {
                clearTimeout(stockRefreshTimeout);
                stockRefreshTimeout = null;
            }
            
            // Check for new items for notifications
            if (typeof checkForNewItems === 'function') {
                checkForNewItems(stockData);
            }
            
            console.log('📦 Stock data updated with changes');
        } else {
            console.log('📦 No stock changes detected');
            
            // Only start auto-refresh timer if no changes and not already running
            if (!stockRefreshTimeout) {
                console.log('⏱️ Starting 30-second auto-refresh timer due to no changes');
                stockRefreshTimeout = setTimeout(() => {
                    console.log('🔄 Auto-refresh triggered after 30 seconds of no changes');
                    fetchStock();
                }, 30000); // 30 seconds
            }
        }
        
        stockTimestamp.textContent = `Last updated: ${new Date().toLocaleString()}`;
        updateStockStatus(true, hasChanges ? 'Stock data updated' : 'Stock data unchanged');
        
        // Refresh history if visible and there were changes
        if (historyVisible && hasChanges) {
            displayHistory();
        }
        
        return stockData;
    } catch (error) {
        console.error('❌ Error fetching stock:', error);
        
        // More detailed error handling
        let errorMessage = 'Error loading stock data';
        if (error.name === 'AbortError') {
            errorMessage = 'Request timeout - API is taking too long to respond';
        } else if (error.message.includes('fetch')) {
            errorMessage = 'Network error - Unable to connect to API';
        } else if (error.message.includes('JSON')) {
            errorMessage = 'Invalid response format from API';
        } else {
            errorMessage = error.message;
        }
        
        stockContainer.innerHTML = `<div class="error">
            <strong>Error:</strong> ${errorMessage}<br>
            <small>API: ${API_BASE_URL}/stock/GetStock</small><br>
            <small>Time: ${new Date().toLocaleString()}</small><br>
            <button onclick="testApiConnection().then(result => { if(result.success) fetchStock(); })">Test API Connection</button>
        </div>`;
        
        updateStockStatus(false, `Error: ${errorMessage}`);
        
        // Clear any pending auto-refresh timeout on error
        if (stockRefreshTimeout) {
            clearTimeout(stockRefreshTimeout);
            stockRefreshTimeout = null;
        }
        
        // Retry after error with exponential backoff
        const retryDelay = Math.min(60000, 5000 * Math.pow(2, 0)); // Start with 5 seconds
        console.log(`🔄 Retrying in ${retryDelay/1000} seconds...`);
        stockRefreshTimeout = setTimeout(() => {
            console.log('🔄 Retry attempt after error');
            fetchStock();
        }, retryDelay);
        
        return null;
    }
}

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
async function clearOldStockData() {
    if (!db) return;
    
    try {
        console.log('🗑️ Starting daily database cleanup...');
        
        // Keep only the last 100 stock entries
        const snapshot = await db.collection('current_stock')
            .orderBy('timestamp', 'desc')
            .offset(100)
            .get();
        
        if (snapshot.size > 0) {
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
            console.log(`✅ Cleaned up ${snapshot.size} old stock entries`);
        }
        
        // Add cleanup log
        await db.collection('system_logs').add({
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            action: 'daily_cleanup',
            entriesRemoved: snapshot.size
        });
        
        console.log('✅ Daily database cleanup completed successfully');
        
        // Refresh history display if visible
        if (historyVisible) {
            displayHistory();
        }
        
    } catch (error) {
        console.error('❌ Error during daily cleanup:', error);
    }
}

// Schedule daily cleanup at 12 AM Philippine time
function scheduleDailyCleanup() {
    const now = new Date();
    
    // Convert to Philippine time (UTC+8)
    const philippineTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    
    // Calculate next 12 AM Philippine time
    const nextMidnight = new Date(philippineTime);
    nextMidnight.setUTCHours(16, 0, 0, 0); // 12 AM Philippine time = 4 PM UTC (previous day)
    
    // If it's already past midnight today, schedule for tomorrow
    if (nextMidnight <= now) {
        nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
    }
    
    const timeUntilMidnight = nextMidnight.getTime() - now.getTime();
    
    console.log(`🕐 Next database cleanup scheduled for: ${nextMidnight.toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (Philippine time)`);
    console.log(`⏱️ Time until cleanup: ${Math.floor(timeUntilMidnight / (1000 * 60 * 60))} hours ${Math.floor((timeUntilMidnight % (1000 * 60 * 60)) / (1000 * 60))} minutes`);
    
    setTimeout(async () => {
        await clearOldStockData();
        
        // Schedule next cleanup (24 hours later)
        setTimeout(() => {
            scheduleDailyCleanup();
        }, 24 * 60 * 60 * 1000);
        
    }, timeUntilMidnight);
}

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

function refreshAll() {
    console.log('🔄 Manual refresh initiated');
    
    // Clear any pending auto-refresh
    if (stockRefreshTimeout) {
        clearTimeout(stockRefreshTimeout);
        stockRefreshTimeout = null;
    }
    
    // Reset timer expiration flags
    Object.keys(timerElements).forEach(elementKey => {
        const element = timerElements[elementKey];
        if (element) {
            element.dataset.expired = 'false';
        }
    });
    
    // Calculate timers and fetch stock
    calculateTimers();
    fetchStock();
    
    // Refresh history if visible
    if (historyVisible) {
        displayHistory();
    }
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
        console.log('🔥 Firebase connected, loading previous stock data...');
        
        // Load last stock data to prevent immediate duplicate saves
        await loadLastStockData();
        
        // Schedule daily cleanup
        scheduleDailyCleanup();
    } else {
        console.log('⚠️ Firebase not connected, continuing without database features...');
    }
    
    // Test API connection before starting
    console.log('🔍 Testing API connection...');
    const apiTest = await testApiConnection();
    
    if (apiTest.success) {
        console.log(`✅ API connection successful with endpoint: ${apiTest.endpoint}`);
        // Start the main application
        startUpdates();
    } else {
        console.log('❌ All API endpoints failed during initialization');
        updateStockStatus(false, 'All API endpoints are unavailable');
        stockContainer.innerHTML = `
            <div class="error">
                <strong>API Connection Failed</strong><br>
                All API endpoints are currently unavailable.<br>
                <button onclick="initialize()">Retry Connection</button>
            </div>
        `;
    }
    
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
    
    // Make testApiConnection available globally
    window.testApiConnection = testApiConnection;
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

async function testApiConnection() {
    console.log('🔍 Testing API connection...');
    
    for (let i = 0; i < API_ENDPOINTS.length; i++) {
        const endpoint = API_ENDPOINTS[i];
        console.log(`🔍 Testing endpoint: ${endpoint}`);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${endpoint}/stock/GetStock`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Endpoint ${endpoint} is working!`);
                currentApiIndex = i;
                API_BASE_URL = endpoint;
                return { success: true, endpoint, data };
            } else {
                console.log(`❌ Endpoint ${endpoint} returned status: ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ Endpoint ${endpoint} failed: ${error.message}`);
        }
    }
    
    console.log('❌ All API endpoints failed');
    return { success: false, endpoint: null, data: null };
}