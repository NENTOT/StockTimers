const admin = require('firebase-admin');

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
        auth_provider_x509_cert_url: "https://www.googleapis.com/o/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    };

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
    });
}

const db = admin.firestore();

// 🔥 Quick and dirty delete with timeout protection
async function quickNuke(collectionName, maxTime = 8000) {
    console.log(`🔥 Quick nuking ${collectionName}...`);
    
    const startTime = Date.now();
    let totalDeleted = 0;
    
    try {
        while (Date.now() - startTime < maxTime) {
            const snapshot = await db.collection(collectionName)
                .limit(200)
                .get();
            
            if (snapshot.empty) {
                console.log(`✅ ${collectionName} empty - deleted ${totalDeleted}`);
                break;
            }

            // Delete batch
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            totalDeleted += snapshot.docs.length;
            console.log(`💥 Nuked ${snapshot.docs.length} from ${collectionName} (Total: ${totalDeleted})`);
        }
    } catch (error) {
        console.error(`Error nuking ${collectionName}:`, error.message);
    }
    
    return totalDeleted;
}

// 🔥 Fast parallel delete
async function parallelNuke(collections, timeLimit = 20000) {
    console.log('🚨 PARALLEL NUKE STARTING');
    
    const results = {};
    const startTime = Date.now();
    
    const deletePromises = collections.map(async (collectionName) => {
        try {
            const deleted = await quickNuke(collectionName, timeLimit / collections.length);
            results[collectionName] = deleted;
            return deleted;
        } catch (error) {
            console.error(`Failed ${collectionName}:`, error.message);
            results[collectionName] = 0;
            return 0;
        }
    });
    
    // Race against time
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            console.log('⏰ TIME LIMIT REACHED');
            resolve('TIMEOUT');
        }, timeLimit);
    });
    
    await Promise.race([
        Promise.all(deletePromises),
        timeoutPromise
    ]);
    
    return results;
}

exports.handler = async (event, context) => {
    // Set timeout to prevent 502 errors
    context.callbackWaitsForEmptyEventLoop = false;
    
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    const startTime = Date.now();
    
    try {
        console.log('🚨 EMERGENCY CLEANUP - FAST MODE');
        
        // Priority collections to delete first
        const priorityCollections = [
            'stock_history',
            'stock_changes'
        ];
        
        // Secondary collections
        const secondaryCollections = [
            'users',
            'portfolios', 
            'transactions',
            'watchlists',
            'notifications',
            'analytics',
            'logs',
            'sessions',
            'cache',
            'settings'
        ];
        
        let results = {};
        
        // Phase 1: Delete priority collections (fast)
        console.log('🔥 Phase 1: Priority deletion...');
        const priorityResults = await parallelNuke(priorityCollections, 15000);
        results = { ...results, ...priorityResults };
        
        // Phase 2: Quick check on remaining time
        const elapsed = Date.now() - startTime;
        const remainingTime = 25000 - elapsed; // Leave 5s buffer
        
        if (remainingTime > 5000) {
            console.log('🔥 Phase 2: Secondary cleanup...');
            const secondaryResults = await parallelNuke(secondaryCollections, remainingTime);
            results = { ...results, ...secondaryResults };
        } else {
            console.log('⏰ Skipping secondary cleanup - not enough time');
        }
        
        const executionTime = Date.now() - startTime;
        const totalDeleted = Object.values(results).reduce((sum, count) => sum + count, 0);
        
        console.log(`💀 CLEANUP COMPLETE - ${totalDeleted} documents deleted in ${executionTime}ms`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '💀 EMERGENCY CLEANUP COMPLETE',
                deleted: results,
                totalDocuments: totalDeleted,
                executionTime: `${executionTime}ms`,
                timestamp: new Date().toISOString(),
                note: 'Optimized for Netlify function limits'
            })
        };
        
    } catch (error) {
        console.error('💣 CLEANUP ERROR:', error);
        
        const executionTime = Date.now() - startTime;
        
        return {
            statusCode: 200, // Return 200 even on error to avoid 502
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                executionTime: `${executionTime}ms`,
                timestamp: new Date().toISOString(),
                note: 'Partial cleanup may have occurred'
            })
        };
    }
};