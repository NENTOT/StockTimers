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

// Updated compare stock data function - focuses on current stock
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
        
        // Get the last stock data from Firebase (from new collection)
        const lastStockSnapshot = await db.collection('stock_updates')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        
        let previousStockData = null;
        if (!lastStockSnapshot.empty) {
            previousStockData = lastStockSnapshot.docs[0].data().currentStock;
        }
        
        // Compare stock data
        const comparison = compareStockData(newStockData, previousStockData);
        
        let responseMessage = 'Stock monitored successfully';
        
        // If there are changes, save current stock state with changes
        if (comparison.hasChanges) {
            const docData = {
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                changeType: 'stock_update',
                changes: comparison.changes,
                changeCount: comparison.changes.length,
                currentStock: comparison.currentStock,
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
                },
                source: 'netlify_function'
            };
            
            await db.collection('stock_updates').add(docData);
            
            responseMessage = `Stock updated - ${comparison.changes.length} changes detected`;
            console.log('✅ Current stock state saved with changes:', comparison.changes.length);
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
                approach: 'current_stock_recording',
                currentStockSummary: {
                    seeds: newStockData.seedsStock?.length || 0,
                    gear: newStockData.gearStock?.length || 0,
                    eggs: newStockData.eggStock?.length || 0,
                    cosmetics: newStockData.cosmeticsStock?.length || 0,
                    totalItems: (newStockData.seedsStock?.length || 0) + 
                               (newStockData.gearStock?.length || 0) + 
                               (newStockData.eggStock?.length || 0) + 
                               (newStockData.cosmeticsStock?.length || 0)
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
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                timestamp: new Date().toISOString()
            })
        };
    }
};