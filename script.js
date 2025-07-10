// Database API Configuration
const API_BASE_URL = 'https://grow-a-garden-api-4ses.onrender.com/api';
const DATABASE_API_URL = '/.netlify/functions'; // Your Netlify functions endpoint
const UPDATE_INTERVAL = 1000; // 1 second for timers

// State management
let timerUpdateInterval;
let previousStockData = null;
let stockRefreshTimeout = null;
let restockTimes = {};
let historyVisible = false;
let databaseConnected = false;

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

// Database connection test
async function testDatabaseConnection() {
    try {
        const response = await fetch(`${DATABASE_API_URL}/test-db-connection`);
        const data = await response.json();
        
        if (data.success) {
            databaseConnected = true;
            document.getElementById('firebase-status').textContent = '🐬 MySQL: Connected';
            document.getElementById('firebase-status').className = 'status firebase-connected';
            console.log('✅ MySQL database connected successfully');
            return true;
        } else {
            throw new Error(data.error || 'Database connection failed');
        }
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        databaseConnected = false;
        document.getElementById('firebase-status').textContent = '🐬 MySQL: Connection failed';
        document.getElementById('firebase-status').className = 'status disconnected';
        return false;
    }
}

// Database Functions - Now using REST API calls to Netlify functions
async function saveStockChangeToDatabase(changes) {
    if (!databaseConnected || !changes || changes.length === 0) return;
    
    try {
        const response = await fetch(`${DATABASE_API_URL}/save-stock-changes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                changes: changes,
                changeCount: changes.length
            })
        });

        const data = await response.json();
        
        if (data.success) {
            console.log('✅ Stock changes saved to database:', changes.length, 'changes');
        } else {
            throw new Error(data.error || 'Failed to save changes');
        }
    } catch (error) {
        console.error('❌ Error saving changes to database:', error);
    }
}

async function getStockHistoryFromDatabase(limit = 20) {
    if (!databaseConnected) return [];
    
    try {
        const response = await fetch(`${DATABASE_API_URL}/get-stock-history?limit=${limit}`);
        const data = await response.json();
        
        if (data.success) {
            return data.history || [];
        } else {
            throw new Error(data.error || 'Failed to fetch history');
        }
    } catch (error) {
        console.error('❌ Error fetching history from database:', error);
        return [];
    }
}

async function clearOldHistoryData() {
    if (!databaseConnected) return;
    
    try {
        console.log('🗑️ Starting daily database cleanup...');
        
        const response = await fetch(`${DATABASE_API_URL}/cleanup-database`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Database cleanup completed: ${data.deletedRecords} records removed`);
            
            // Refresh history display if visible
            if (historyVisible) {
                displayHistory();
            }
        } else {
            throw new Error(data.error || 'Cleanup failed');
        }
        
    } catch (error) {
        console.error('❌ Error during daily cleanup:', error);
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

// Enhanced stock comparison with detailed change tracking
function compareStockData(newData, oldData) {
    if (!oldData) return { hasChanges: false, changes: [] };
    
    try {
        const changes = [];
        const categories = [
            { key: 'seedsStock', name: 'Seeds', emoji: '🌱' },
            { key: 'gearStock', name: 'Gear', emoji: '⚙️' },
            { key: 'eggStock', name: 'Eggs', emoji: '🥚' },
            { key: 'cosmeticsStock', name: 'Cosmetics', emoji: '💄' }
        ];
        
        for (const category of categories) {
            const newItems = newData[category.key] || [];
            const oldItems = oldData[category.key] || [];
            
            // Create maps for easier comparison
            const newMap = new Map(newItems.map(item => [item.name, item.value]));
            const oldMap = new Map(oldItems.map(item => [item.name, item.value]));
            
            // Check for new items
            for (const [name, value] of newMap) {
                if (!oldMap.has(name)) {
                    changes.push({
                        type: 'added',
                        category: category.name,
                        emoji: category.emoji,
                        item: name,
                        value: value
                    });
                } else if (oldMap.get(name) !== value) {
                    changes.push({
                        type: 'changed',
                        category: category.name,
                        emoji: category.emoji,
                        item: name,
                        oldValue: oldMap.get(name),
                        newValue: value
                    });
                }
            }
            
            // Check for removed items
            for (const [name, value] of oldMap) {
                if (!newMap.has(name)) {
                    changes.push({
                        type: 'removed',
                        category: category.name,
                        emoji: category.emoji,
                        item: name,
                        value: value
                    });
                }
            }
        }
        
        return {
            hasChanges: changes.length > 0,
            changes: changes
        };
    } catch (error) {
        console.error('Error comparing stock data:', error);
        return { hasChanges: false, changes: [] };
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
                fetchStockWithComparison();
            } else if (!isExpired) {
                element.dataset.expired = '';
            }
        }
    });
}

// Stock functions
async function fetchStock() {
    try {
        stockContainer.innerHTML = '<div class="loading">Loading stock data...</div>';
        
        const response = await fetch(`${API_BASE_URL}/stock/GetStock`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const stockData = await response.json();
        
        // Display the stock data
        displayStock(stockData);
        
        stockTimestamp.textContent = `Last updated: ${new Date().toLocaleString()}`;
        updateStockStatus(true, `Stock data loaded successfully`);
        
        return stockData;
    } catch (error) {
        console.error('Error fetching stock:', error);
        stockContainer.innerHTML = `<div class="error">Error loading stock data: ${error.message}</div>`;
        updateStockStatus(false, `Error: ${error.message}`);
        return null;
    }
}

async function displayHistory() {
    try {
        historyContainer.innerHTML = '<div class="loading">Loading history...</div>';

        const history = await getStockHistoryFromDatabase(50);

        if (history.length === 0) {
            historyContainer.innerHTML = '<div class="loading">No history available</div>';
            return;
        }

        let html = '';
        history.forEach(entry => {
            // Only include 'changed' entries
            const changedItems = entry.changes.filter(change => change.type === 'changed');

            if (changedItems.length === 0) return; // Skip if no changed items

            const date = new Date(entry.timestamp).toLocaleString();
            const changeCount = changedItems.length;

            html += `
                <div class="history-item">
                    <div class="history-timestamp">${date} (${changeCount} changes)</div>
                    <div class="history-changes">
            `;

            changedItems.forEach(change => {
                const cleanedItemName = change.item.replace(/^(Changed|Added|Removed):\s*/, '');
                const changeText = `${change.emoji} ${cleanedItemName} (${change.oldValue})`;
                html += `<div class="change-item">${changeText}</div>`;
            });

            html += `
                    </div>
                </div>
            `;
        });

        historyContainer.innerHTML = html;
    } catch (error) {
        console.error('Error displaying history:', error);
        historyContainer.innerHTML = '<div class="error">Error loading history</div>';
    }
}

async function fetchStockWithComparison() {
    console.log('📦 Fetching stock with comparison...');
    
    const newStockData = await fetchStock();
    
    if (newStockData) {
        const comparison = compareStockData(newStockData, previousStockData);
        
        if (comparison.hasChanges) {
            console.log('✅ Stock changed! New items detected:', comparison.changes.length, 'changes');
            updateStockStatus(true, `Stock updated - ${comparison.changes.length} changes detected!`);
            
            // Save changes to database BEFORE updating previousStockData
            await saveStockChangeToDatabase(comparison.changes);
            
            // Only refresh history if it's currently visible
            if (historyVisible) {
                displayHistory();
            }
            
            // Clear any pending auto-refresh
            if (stockRefreshTimeout) {
                clearTimeout(stockRefreshTimeout);
                stockRefreshTimeout = null;
            }
        } else {
            console.log('🔄 Stock unchanged, scheduling refresh in 30 seconds...');
            updateStockStatus(true, 'Stock unchanged - Auto-refresh in 30 seconds');
            
            if (stockRefreshTimeout) {
                clearTimeout(stockRefreshTimeout);
            }
            
            stockRefreshTimeout = setTimeout(() => {
                console.log('🔄 Auto-refreshing stock after 30 seconds...');
                fetchStockWithComparison();
            }, 30000);
        }
        
        // Store a deep copy for comparison (this should happen AFTER saving changes)
        previousStockData = JSON.parse(JSON.stringify(newStockData));
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
        await clearOldHistoryData();
        
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
    // Clear any pending auto-refresh
    if (stockRefreshTimeout) {
        clearTimeout(stockRefreshTimeout);
        stockRefreshTimeout = null;
    }
    
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
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        stopUpdates();
        if (stockRefreshTimeout) {
            clearTimeout(stockRefreshTimeout);
            stockRefreshTimeout = null;
        }
    } else {
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
    // Test database connection first
    const dbConnected = await testDatabaseConnection();
    
    if (dbConnected) {
        console.log('🐬 MySQL connected, starting updates...');
        
        // Schedule daily cleanup
        scheduleDailyCleanup();
    } else {
        console.log('⚠️ MySQL not connected, continuing without database features...');
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