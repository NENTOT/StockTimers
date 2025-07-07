// netlify/functions/monitor-stock.js
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
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
}

const db = admin.firestore();
const API_BASE_URL = 'https://grow-a-garden-api-4ses.onrender.com/api';

// Function to save current stock to Firebase
async function saveCurrentStockToFirebase(stockData) {
    try {
        // Create a comprehensive current stock record
        const currentStockRecord = {
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            recordType: 'current_stock',
            source: 'netlify_function',
            totalItems: {
                seeds: stockData.seedsStock?.length || 0,
                gear: stockData.gearStock?.length || 0,
                eggs: stockData.eggStock?.length || 0,
                cosmetics: stockData.cosmeticsStock?.length || 0
            },
            stockDetails: {
                seeds: stockData.seedsStock || [],
                gear: stockData.gearStock || [],
                eggs: stockData.eggStock || [],
                cosmetics: stockData.cosmeticsStock || []
            },
            // Store all items in a flat array for easier querying
            allItems: [
                ...(stockData.seedsStock || []).map(item => ({ ...item, category: 'Seeds', emoji: '🌱' })),
                ...(stockData.gearStock || []).map(item => ({ ...item, category: 'Gear', emoji: '⚙️' })),
                ...(stockData.eggStock || []).map(item => ({ ...item, category: 'Eggs', emoji: '🥚' })),
                ...(stockData.cosmeticsStock || []).map(item => ({ ...item, category: 'Cosmetics', emoji: '💄' }))
            ]
        };

        await db.collection('current_stock_history').add(currentStockRecord);
        console.log('✅ Current stock snapshot saved to Firebase from Netlify function');
        
        return currentStockRecord;
    } catch (error) {
        console.error('❌ Error saving current stock to Firebase:', error);
        throw error;
    }
}

// Compare stock data function (unchanged but improved)
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
        
        // Fetch current stock data
        const stockResponse = await fetch(`${API_BASE_URL}/stock/GetStock`);
        if (!stockResponse.ok) {
            throw new Error(`Stock API error: ${stockResponse.status} ${stockResponse.statusText}`);
        }
        
        const newStockData = await stockResponse.json();
        console.log('📦 Fetched new stock data successfully');
        
        // Always save current stock snapshot
        const currentStockRecord = await saveCurrentStockToFirebase(newStockData);
        
        // Get the last stock data from the new current_stock_history collection
        const lastStockSnapshot = await db.collection('current_stock_history')
            .where('source', '==', 'netlify_function')
            .orderBy('timestamp', 'desc')
            .limit(2) // Get 2 to compare current with previous
            .get();
        
        let previousStockData = null;
        let hasChanges = false;
        let changeCount = 0;
        
        if (lastStockSnapshot.size >= 2) {
            // Compare with the previous record (second most recent)
            const docs = lastStockSnapshot.docs;
            const previousRecord = docs[1].data();
            
            // Reconstruct the stock data format for comparison
            previousStockData = {
                seedsStock: previousRecord.stockDetails?.seeds || [],
                gearStock: previousRecord.stockDetails?.gear || [],
                eggStock: previousRecord.stockDetails?.eggs || [],
                cosmeticsStock: previousRecord.stockDetails?.cosmetics || []
            };
            
            // Compare stock data
            const comparison = compareStockData(newStockData, previousStockData);
            hasChanges = comparison.hasChanges;
            changeCount = comparison.changes.length;
            
            // If there are changes, save them to the old changes collection for backward compatibility
            if (hasChanges) {
                await db.collection('stock_changes').add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    changeType: 'stock_change',
                    changes: comparison.changes,
                    changeCount: comparison.changes.length,
                    source: 'netlify_function'
                });
            }
        }
        
        let responseMessage = 'Current stock snapshot saved successfully';
        
        if (hasChanges) {
            responseMessage = `Stock updated - ${changeCount} changes detected`;
            console.log('✅ Stock changes detected and saved:', changeCount);
        } else {
            console.log('🔄 No stock changes detected');
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: responseMessage,
                changesDetected: changeCount,
                hasChanges: hasChanges,
                timestamp: new Date().toISOString(),
                stockItemCount: {
                    seeds: newStockData.seedsStock?.length || 0,
                    gear: newStockData.gearStock?.length || 0,
                    eggs: newStockData.eggStock?.length || 0,
                    cosmetics: newStockData.cosmeticsStock?.length || 0
                },
                totalItems: Object.values(currentStockRecord.totalItems).reduce((sum, count) => sum + count, 0)
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
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                timestamp: new Date().toISOString()
            })
        };
    }
};