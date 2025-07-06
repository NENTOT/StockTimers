// netlify/functions/monitor-stock.js
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            }),
            projectId: process.env.FIREBASE_PROJECT_ID,
        });
        console.log('✅ Firebase Admin initialized');
    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
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
    // Add CORS headers for all responses
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        console.log('🔍 Starting stock monitoring...');
        
        // Check environment variables
        if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
            throw new Error('Missing Firebase environment variables');
        }
        
        // Fetch current stock data
        console.log('📡 Fetching stock data from API...');
        const stockResponse = await fetch(`${API_BASE_URL}/stock/GetStock`);
        
        if (!stockResponse.ok) {
            throw new Error(`Stock API error: ${stockResponse.status} ${stockResponse.statusText}`);
        }
        
        const newStockData = await stockResponse.json();
        console.log('📦 Fetched new stock data successfully');
        
        // Get the last stock data from Firebase
        console.log('🔍 Checking previous stock data...');
        const lastStockSnapshot = await db.collection('stock_history')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        
        let previousStockData = null;
        if (!lastStockSnapshot.empty) {
            previousStockData = lastStockSnapshot.docs[0].data().stockData;
            console.log('📋 Found previous stock data');
        } else {
            console.log('📋 No previous stock data found');
        }
        
        // Compare stock data
        const comparison = compareStockData(newStockData, previousStockData);
        
        // Always save current stock snapshot
        console.log('💾 Saving stock snapshot...');
        await db.collection('stock_history').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            stockData: newStockData,
            categories: {
                seeds: newStockData.seedsStock || [],
                gear: newStockData.gearStock || [],
                eggs: newStockData.eggStock || [],
                cosmetics: newStockData.cosmeticsStock || []
            }
        });
        
        let responseMessage = 'Stock data saved';
        
        // If there are changes, save them separately
        if (comparison.hasChanges) {
            console.log('📝 Saving stock changes...');
            await db.collection('stock_changes').add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                changeType: 'stock_change',
                changes: comparison.changes,
                changeCount: comparison.changes.length
            });
            
            responseMessage = `Stock updated - ${comparison.changes.length} changes detected`;
            console.log('✅ Stock changes detected and saved:', comparison.changes.length);
        } else {
            console.log('🔄 No stock changes detected');
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: responseMessage,
                changes: comparison.changes.length,
                timestamp: new Date().toISOString(),
                stockData: newStockData
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
                timestamp: new Date().toISOString(),
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};