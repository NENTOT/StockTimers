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
        
        const currentStockData = await stockResponse.json();
        console.log('📦 Fetched current stock data successfully');
        
        // Save current stock snapshot to Firebase
        const stockDoc = await db.collection('current_stock').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            stockData: currentStockData,
            categories: {
                seeds: currentStockData.seedsStock || [],
                gear: currentStockData.gearStock || [],
                eggs: currentStockData.eggStock || [],
                cosmetics: currentStockData.cosmeticsStock || []
            },
            totalItems: {
                seeds: currentStockData.seedsStock?.length || 0,
                gear: currentStockData.gearStock?.length || 0,
                eggs: currentStockData.eggStock?.length || 0,
                cosmetics: currentStockData.cosmeticsStock?.length || 0
            }
        });
        
        console.log('✅ Current stock data saved to Firebase');
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Current stock data saved successfully',
                timestamp: new Date().toISOString(),
                stockItemCount: {
                    seeds: currentStockData.seedsStock?.length || 0,
                    gear: currentStockData.gearStock?.length || 0,
                    eggs: currentStockData.eggStock?.length || 0,
                    cosmetics: currentStockData.cosmeticsStock?.length || 0
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