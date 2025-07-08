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
        
        // Fetch current stock data
        const stockResponse = await fetch(`${API_BASE_URL}/stock/GetStock`);
        if (!stockResponse.ok) {
            throw new Error(`Stock API error: ${stockResponse.status} ${stockResponse.statusText}`);
        }
        
        const newStockData = await stockResponse.json();
        console.log('📦 Fetched new stock data successfully');
        
        // Get the last stock data from Firebase
        const lastStockSnapshot = await db.collection('stock_history')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        
        let previousStockData = null;
        if (!lastStockSnapshot.empty) {
            previousStockData = lastStockSnapshot.docs[0].data().stockData;
        }
        
        // Compare stock data
        const comparison = compareStockData(newStockData, previousStockData);
        
        // Always save current stock snapshot
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
        
        let responseMessage = 'Stock data saved successfully';
        
        // If there are changes, save them separately
        if (comparison.hasChanges) {
            await db.collection('stock_changes').add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                changeType: 'stock_change',
                changes: comparison.changes,
                changeCount: comparison.changes.length
            });

           try {
            await fetch(`${process.env.URL}/.netlify/functions/discord-stock-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ changes: comparison.changes })
            });
            } catch (discordErr) {
            console.error('❌ Failed to send Discord update:', discordErr.message);
            }

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
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                timestamp: new Date().toISOString()
            })
        };
    }
};