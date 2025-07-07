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

        async function initializeFirebase() {
            try {
                firebaseApp = firebase.initializeApp(firebaseConfig);
                db = firebase.firestore();
                
                // Test connection
                await db.collection('stock_history').limit(1).get();
                
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
        let previousStockData = null;
        let stockRefreshTimeout = null;
        let restockTimes = {};
        let historyVisible = false;

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

        // Firebase Database Functions
        async function saveStockToFirebase(stockData) {
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
                    }
                };

                await db.collection('stock_history').add(docData);
                console.log('✅ Stock data saved to Firebase');
            } catch (error) {
                console.error('❌ Error saving to Firebase:', error);
            }
        }

        async function saveStockChangeToFirebase(comparison) {
    if (!db || !comparison || !comparison.hasChanges) return;
    
    try {
        const docData = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            changeType: 'stock_update',
            changes: comparison.changes,
            changeCount: comparison.changes.length,
            currentStock: comparison.currentStock, // Save current stock state
            categories: {
                seeds: comparison.currentStock.seedsStock || [],
                gear: comparison.currentStock.gearStock || [],
                eggs: comparison.currentStock.eggStock || [],
                cosmetics: comparison.currentStock.cosmeticsStock || []
            },
            summary: {
                totalItems: (comparison.currentStock.seedsStock?.length || 0) + 
                           (comparison.currentStock.gearStock?.length || 0) + 
                           (comparison.currentStock.eggStock?.length || 0) + 
                           (comparison.currentStock.cosmeticsStock?.length || 0),
                inStockChanges: comparison.changes.filter(c => c.status === 'in_stock').length,
                outOfStockChanges: comparison.changes.filter(c => c.status === 'out_of_stock').length
            }
        };

        await db.collection('stock_updates').add(docData);
        console.log('✅ Current stock state saved to Firebase with changes:', comparison.changes.length);
    } catch (error) {
        console.error('❌ Error saving current stock to Firebase:', error);
    }
}

        async function getStockHistoryFromFirebase(limit = 20) {
    if (!db) return [];
    
    try {
        const snapshot = await db.collection('stock_updates')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        const history = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            history.push({
                id: doc.id,
                timestamp: data.timestamp?.toDate() || new Date(),
                changes: data.changes || [],
                changeCount: data.changeCount || 0,
                currentStock: data.currentStock || {},
                summary: data.summary || {}
            });
        });

        return history;
    } catch (error) {
        console.error('❌ Error fetching history from Firebase:', error);
        return [];
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
    if (!oldData) return { hasChanges: false, changes: [], currentStock: newData };
    
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
            
            // Check for new items (items that are now in stock)
            for (const [name, value] of newMap) {
                if (!oldMap.has(name)) {
                    changes.push({
                        type: 'now_available',
                        category: category.name,
                        emoji: category.emoji,
                        item: name,
                        currentValue: value,
                        status: 'in_stock'
                    });
                } else if (oldMap.get(name) !== value) {
                    changes.push({
                        type: 'quantity_changed',
                        category: category.name,
                        emoji: category.emoji,
                        item: name,
                        previousValue: oldMap.get(name),
                        currentValue: value,
                        status: 'in_stock'
                    });
                }
            }
            
            // Check for removed items (items no longer in stock)
            for (const [name, value] of oldMap) {
                if (!newMap.has(name)) {
                    changes.push({
                        type: 'out_of_stock',
                        category: category.name,
                        emoji: category.emoji,
                        item: name,
                        previousValue: value,
                        status: 'out_of_stock'
                    });
                }
            }
        }
        
        return {
            hasChanges: changes.length > 0,
            changes: changes,
            currentStock: newData,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error comparing stock data:', error);
        return { hasChanges: false, changes: [], currentStock: newData };
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
            
            // Display the NEW stock data (current stock)
            displayStock(stockData);
            
            // Save full stock snapshot to Firebase
            await saveStockToFirebase(stockData);
            
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

        const history = await getStockHistoryFromFirebase(50);

        if (history.length === 0) {
            historyContainer.innerHTML = '<div class="loading">No history available</div>';
            return;
        }

        let html = '';
        history.forEach(entry => {
            const allChanges = entry.changes || [];

            if (allChanges.length === 0) return; // Skip if no changes

            const date = entry.timestamp.toLocaleString();
            const changeCount = allChanges.length;
            const summary = entry.summary || {};

            html += `
                <div class="history-item">
                    <div class="history-timestamp">
                        ${date} (${changeCount} changes)
                        <span class="stock-summary">
                            📊 Total Items: ${summary.totalItems || 0} | 
                            ✅ In Stock: ${summary.inStockChanges || 0} | 
                            ❌ Out of Stock: ${summary.outOfStockChanges || 0}
                        </span>
                    </div>
                    <div class="history-changes">
            `;

            // Group changes by category for better display
            const changesByCategory = {};
            allChanges.forEach(change => {
                if (!changesByCategory[change.category]) {
                    changesByCategory[change.category] = [];
                }
                changesByCategory[change.category].push(change);
            });

            // Display changes by category
            Object.entries(changesByCategory).forEach(([category, changes]) => {
                html += `<div class="category-changes">
                    <h4>${changes[0].emoji} ${category} (${changes.length} changes)</h4>
                `;
                
                changes.forEach(change => {
                    const cleanedItemName = change.item.replace(/^(Changed|Added|Removed):\s*/, '');
                    let changeText = '';
                    
                    switch (change.type) {
                        case 'now_available':
                            changeText = `✅ NOW IN STOCK: ${cleanedItemName} (${change.currentValue})`;
                            break;
                        case 'quantity_changed':
                            changeText = `📊 QUANTITY CHANGED: ${cleanedItemName} (${change.previousValue} → ${change.currentValue})`;
                            break;
                        case 'out_of_stock':
                            changeText = `❌ OUT OF STOCK: ${cleanedItemName} (was ${change.previousValue})`;
                            break;
                        default:
                            changeText = `${change.emoji} ${cleanedItemName} (${change.currentValue || change.previousValue})`;
                    }
                    
                    html += `<div class="change-item change-${change.type}">${changeText}</div>`;
                });
                
                html += `</div>`;
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
            console.log('✅ Stock changed! Changes detected:', comparison.changes.length);
            updateStockStatus(true, `Stock updated - ${comparison.changes.length} changes detected!`);
            
            // Save current stock state with changes to Firebase
            await saveStockChangeToFirebase(comparison);
            
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

        // Database cleanup function
        async function clearOldHistoryData() {
    if (!db) return;
    
    try {
        console.log('🗑️ Starting daily database cleanup...');
        
        // Clear stock_updates collection (new collection name)
        const updatesSnapshot = await db.collection('stock_updates').get();
        const updatesBatch = db.batch();
        
        updatesSnapshot.forEach(doc => {
            updatesBatch.delete(doc.ref);
        });
        
        if (updatesSnapshot.size > 0) {
            await updatesBatch.commit();
            console.log(`✅ Cleared ${updatesSnapshot.size} documents from stock_updates`);
        }
        
        // Clear old collections if they still exist
        const legacyCollections = ['stock_changes', 'stock_history'];
        for (const collectionName of legacyCollections) {
            try {
                const snapshot = await db.collection(collectionName).get();
                const batch = db.batch();
                
                snapshot.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                if (snapshot.size > 0) {
                    await batch.commit();
                    console.log(`✅ Cleared ${snapshot.size} documents from ${collectionName}`);
                }
            } catch (error) {
                console.log(`ℹ️ Collection ${collectionName} not found or already empty`);
            }
        }
        
        // Add cleanup log
        await db.collection('system_logs').add({
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            action: 'daily_cleanup',
            updatesCleared: updatesSnapshot.size,
            approach: 'current_stock_recording'
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
            // Initialize Firebase first
            const firebaseConnected = await initializeFirebase();
            
            if (firebaseConnected) {
                console.log('🔥 Firebase connected, starting updates...');
                
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