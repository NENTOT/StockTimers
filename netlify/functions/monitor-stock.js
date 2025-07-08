// netlify/functions/daily-cleanup.js
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

// Function to delete documents older than specified days
async function deleteOldDocuments(collectionName, daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    console.log(`🗑️ Cleaning up ${collectionName} older than ${daysToKeep} days (before ${cutoffDate.toISOString()})`);
    
    try {
        const query = db.collection(collectionName)
            .where('timestamp', '<', cutoffDate)
            .limit(500); // Process in batches to avoid timeout
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            console.log(`✅ No old documents found in ${collectionName}`);
            return 0;
        }
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log(`✅ Deleted ${snapshot.docs.length} old documents from ${collectionName}`);
        
        return snapshot.docs.length;
    } catch (error) {
        console.error(`❌ Error cleaning up ${collectionName}:`, error);
        throw error;
    }
}

// Function to get collection statistics
async function getCollectionStats(collectionName) {
    try {
        const snapshot = await db.collection(collectionName).get();
        const totalDocs = snapshot.size;
        
        if (totalDocs === 0) {
            return { total: 0, oldest: null, newest: null };
        }
        
        // Get oldest and newest documents
        const oldestSnapshot = await db.collection(collectionName)
            .orderBy('timestamp', 'asc')
            .limit(1)
            .get();
        
        const newestSnapshot = await db.collection(collectionName)
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        
        const oldest = oldestSnapshot.docs[0]?.data().timestamp?.toDate();
        const newest = newestSnapshot.docs[0]?.data().timestamp?.toDate();
        
        return {
            total: totalDocs,
            oldest: oldest ? oldest.toISOString() : null,
            newest: newest ? newest.toISOString() : null
        };
    } catch (error) {
        console.error(`❌ Error getting stats for ${collectionName}:`, error);
        return { total: 0, oldest: null, newest: null, error: error.message };
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
        console.log('🧹 Starting daily cleanup function...');
        const startTime = Date.now();
        
        // Get cleanup configuration from query parameters or use defaults
        const stockHistoryDays = 1;
        const stockChangesDays = 1;
        
        // Get pre-cleanup statistics
        console.log('📊 Getting pre-cleanup statistics...');
        const preStats = {
            stock_history: 'skipped_due_to_quota',
            stock_changes: 'skipped_due_to_quota'
        };
        
        // Perform cleanup operations
        const results = {};
        results.stock_history_deleted = await deleteOldDocuments('stock_history', stockHistoryDays);
        results.stock_changes_deleted = await deleteOldDocuments('stock_changes', stockChangesDays);

        
        // Clean up stock history (keep last 30 days by default)
        results.stock_history_deleted = await deleteOldDocuments('stock_history', stockHistoryDays);
        
        // Clean up stock changes (keep last 7 days by default)
        results.stock_changes_deleted = await deleteOldDocuments('stock_changes', stockChangesDays);
        
        // Get post-cleanup statistics
        console.log('📊 Getting post-cleanup statistics...');
        const postStats = {
            stock_history: 'skipped_due_to_quota',
            stock_changes: 'skipped_due_to_quota'
        };
        
        const executionTime = Date.now() - startTime;
        const totalDeleted = results.stock_history_deleted + results.stock_changes_deleted;
        
        console.log(`✅ Cleanup completed in ${executionTime}ms - ${totalDeleted} documents deleted`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `Daily cleanup completed - ${totalDeleted} documents deleted`,
                executionTime: `${executionTime}ms`,
                timestamp: new Date().toISOString(),
                configuration: {
                    stockHistoryRetentionDays: stockHistoryDays,
                    stockChangesRetentionDays: stockChangesDays
                },
                results: {
                    documentsDeleted: results,
                    totalDeleted: totalDeleted
                },
                statistics: {
                    before: preStats,
                    after: postStats
                }
            })
        };
        
    } catch (error) {
        console.error('❌ Daily cleanup error:', error);
        
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