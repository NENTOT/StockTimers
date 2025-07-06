// netlify/functions/daily-cleanup.js
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
        projectId: process.env.FIREBASE_PROJECT_ID,
    });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    try {
        console.log('🗑️ Starting daily database cleanup...');
        
        // Clear stock_changes collection
        const changesSnapshot = await db.collection('stock_changes').get();
        const changesBatch = db.batch();
        
        changesSnapshot.forEach(doc => {
            changesBatch.delete(doc.ref);
        });
        
        let changesCleared = 0;
        if (changesSnapshot.size > 0) {
            await changesBatch.commit();
            changesCleared = changesSnapshot.size;
            console.log(`✅ Cleared ${changesCleared} documents from stock_changes`);
        }
        
        // Clear stock_history collection
        const historySnapshot = await db.collection('stock_history').get();
        const historyBatch = db.batch();
        
        historySnapshot.forEach(doc => {
            historyBatch.delete(doc.ref);
        });
        
        let historyCleared = 0;
        if (historySnapshot.size > 0) {
            await historyBatch.commit();
            historyCleared = historySnapshot.size;
            console.log(`✅ Cleared ${historyCleared} documents from stock_history`);
        }
        
        // Add cleanup log
        await db.collection('system_logs').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            action: 'daily_cleanup',
            changesCleared: changesCleared,
            historyCleared: historyCleared
        });
        
        console.log('✅ Daily database cleanup completed successfully');
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                message: 'Daily cleanup completed',
                changesCleared: changesCleared,
                historyCleared: historyCleared,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('❌ Error during daily cleanup:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};