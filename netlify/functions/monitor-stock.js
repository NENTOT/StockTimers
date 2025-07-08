// netlify/functions/monitor-stock.js
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
    try {
        const serviceAccount = {
            type: "service_account",
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID,
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
        };

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID,
        });
        
        console.log('✅ Firebase Admin initialized successfully');
    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
        throw error;
    }
}

const db = admin.firestore();
const API_BASE_URL = 'https://grow-a-garden-api-4ses.onrender.com/api';

// Compare stock data function
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

exports.handler = async (event, context) => {
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        console.log('🔍 Starting stock monitoring function...');
        
        // Validate required environment variables
        const requiredEnvVars = [
            'FIREBASE_PROJECT_ID',
            'FIREBASE_PRIVATE_KEY_ID',
            'FIREBASE_PRIVATE_KEY',
            'FIREBASE_CLIENT_EMAIL',
            'FIREBASE_CLIENT_ID'
        ];
        
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }
        
        // Fetch current stock data with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        let stockResponse;
        try {
            stockResponse = await fetch(`${API_BASE_URL}/stock/GetStock`, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Netlify-Stock-Monitor/1.0'
                }
            });
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                throw new Error('Stock API request timed out after 30 seconds');
            }
            throw new Error(`Stock API fetch error: ${fetchError.message}`);
        } finally {
            clearTimeout(timeoutId);
        }
        
        if (!stockResponse.ok) {
            throw new Error(`Stock API error: ${stockResponse.status} ${stockResponse.statusText}`);
        }
        
        let newStockData;
        try {
            newStockData = await stockResponse.json();
        } catch (jsonError) {
            throw new Error(`Invalid JSON response from stock API: ${jsonError.message}`);
        }
        
        console.log('📦 Fetched new stock data successfully');
        
        // Validate stock data structure
        if (!newStockData || typeof newStockData !== 'object') {
            throw new Error('Invalid stock data structure received from API');
        }
        
        // Get the last stock data from Firebase with error handling
        let lastStockSnapshot;
        try {
            lastStockSnapshot = await db.collection('stock_history')
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();
        } catch (firestoreError) {
            console.error('Firestore query error:', firestoreError);
            throw new Error(`Firestore error: ${firestoreError.message}`);
        }
        
        let previousStockData = null;
        if (!lastStockSnapshot.empty) {
            previousStockData = lastStockSnapshot.docs[0].data().stockData;
        }
        
        // Compare stock data
        const comparison = compareStockData(newStockData, previousStockData);
        
        // Always save current stock snapshot
        try {
            const stockDoc = await db.collection('stock_history').add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                stockData: newStockData,
                categories: {
                    seeds: newStockData.seedsStock || [],
                    gear: newStockData.gearStock || [],
                    eggs: newStockData.eggStock || [],
                    cosmetics: newStockData.cosmeticsStock || []
                }
            });
            console.log('💾 Stock history saved with ID:', stockDoc.id);
        } catch (saveError) {
            console.error('Error saving stock history:', saveError);
            throw new Error(`Database save error: ${saveError.message}`);
        }
        
        let responseMessage = 'Stock data saved successfully';
        
        // If there are changes, save them separately
        if (comparison.hasChanges) {
            try {
                await db.collection('stock_changes').add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    changeType: 'stock_change',
                    changes: comparison.changes,
                    changeCount: comparison.changes.length
                });
                
                responseMessage = `Stock updated - ${comparison.changes.length} changes detected`;
                console.log('✅ Stock changes detected and saved:', comparison.changes.length);
            } catch (changesError) {
                console.error('Error saving stock changes:', changesError);
                // Don't throw here - we still want to return success for the main stock save
            }
        } else {
            console.log('🔄 No stock changes detected');
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: responseMessage,
                changesDetected: comparison.changes.length,
                hasChanges: comparison.hasChanges,
                timestamp: new Date().toISOString(),
                stockItemCount: {
                    seeds: newStockData.seedsStock?.length || 0,
                    gear: newStockData.gearStock?.length || 0,
                    eggs: newStockData.eggStock?.length || 0,
                    cosmetics: newStockData.cosmeticsStock?.length || 0
                }
            })
        };
        
    } catch (error) {
        console.error('❌ Stock monitoring error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                errorType: error.name,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                timestamp: new Date().toISOString()
            })
        };
    }
};