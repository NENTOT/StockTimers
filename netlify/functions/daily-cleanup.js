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

// 🔥 NUCLEAR DELETE - Remove everything without mercy
async function nukeCollection(collectionName) {
    console.log(`☢️ NUKING ${collectionName} - NO MERCY`);
    
    let totalDeleted = 0;
    let attempts = 0;
    
    while (attempts < 100) { // Keep trying until nothing left
        try {
            const snapshot = await db.collection(collectionName).limit(500).get();
            
            if (snapshot.empty) {
                console.log(`✅ ${collectionName} is EMPTY - NUKED ${totalDeleted} total`);
                break;
            }

            // Delete everything in this batch
            const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);
            
            totalDeleted += snapshot.docs.length;
            attempts++;
            
            console.log(`💥 NUKED ${snapshot.docs.length} docs from ${collectionName} (Total: ${totalDeleted})`);
            
        } catch (error) {
            console.error(`💣 Error nuking ${collectionName}:`, error);
            // Keep trying anyway
            attempts++;
        }
    }
    
    return totalDeleted;
}

// 🔥 DELETE ALL COLLECTIONS - Everything must go
async function deleteAllCollections() {
    console.log('🚨 DELETING ALL COLLECTIONS');
    
    const collections = [
        'stock_history',
        'stock_changes',
        'users',
        'portfolios',
        'transactions',
        'watchlists',
        'notifications',
        'analytics',
        'logs',
        'sessions',
        'cache',
        'settings',
        'metadata'
    ];
    
    const results = {};
    
    // Delete all collections simultaneously
    const deletePromises = collections.map(async (collectionName) => {
        try {
            const deleted = await nukeCollection(collectionName);
            results[collectionName] = deleted;
            return deleted;
        } catch (error) {
            console.error(`Failed to delete ${collectionName}:`, error);
            results[collectionName] = 0;
            return 0;
        }
    });
    
    await Promise.all(deletePromises);
    return results;
}

// 🔥 RECURSIVE DELETE - Delete subcollections too
async function recursiveDelete(collectionPath) {
    console.log(`🔥 RECURSIVE DELETE: ${collectionPath}`);
    
    const collectionRef = db.collection(collectionPath);
    const snapshot = await collectionRef.get();
    
    if (snapshot.empty) return 0;
    
    let totalDeleted = 0;
    
    for (const doc of snapshot.docs) {
        // Delete subcollections first
        const subcollections = await doc.ref.listCollections();
        for (const subcollection of subcollections) {
            await recursiveDelete(subcollection.path);
        }
        
        // Then delete the document
        await doc.ref.delete();
        totalDeleted++;
    }
    
    return totalDeleted;
}

exports.handler = async (event, context) => {
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

    try {
        console.log('🚨🚨🚨 EMERGENCY NUCLEAR CLEANUP - DELETING EVERYTHING 🚨🚨🚨');
        const startTime = Date.now();

        // METHOD 1: Delete known collections aggressively
        console.log('🔥 Phase 1: Nuking known collections...');
        const collectionResults = await deleteAllCollections();
        
        // METHOD 2: List and delete all collections in the database
        console.log('🔥 Phase 2: Finding and deleting any remaining collections...');
        try {
            const collections = await db.listCollections();
            const remainingDeletes = collections.map(async (collection) => {
                const name = collection.id;
                if (!collectionResults[name]) {
                    console.log(`🔥 Found extra collection: ${name}`);
                    const deleted = await nukeCollection(name);
                    collectionResults[name] = deleted;
                }
            });
            await Promise.all(remainingDeletes);
        } catch (error) {
            console.log('⚠️ Could not list collections, continuing...');
        }
        
        // METHOD 3: Recursive delete (if supported)
        console.log('🔥 Phase 3: Recursive cleanup...');
        try {
            for (const collectionName of Object.keys(collectionResults)) {
                await recursiveDelete(collectionName);
            }
        } catch (error) {
            console.log('⚠️ Recursive delete failed, continuing...');
        }

        const executionTime = Date.now() - startTime;
        const totalDeleted = Object.values(collectionResults).reduce((sum, count) => sum + count, 0);

        console.log('💀 DESTRUCTION COMPLETE 💀');

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '💀 NUCLEAR CLEANUP COMPLETE - EVERYTHING DELETED 💀',
                deleted: collectionResults,
                totalDocuments: totalDeleted,
                executionTime: `${executionTime}ms`,
                timestamp: new Date().toISOString(),
                warning: 'ALL DATA HAS BEEN PERMANENTLY DELETED'
            })
        };
    } catch (error) {
        console.error('💣 NUCLEAR CLEANUP FAILED:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                message: 'NUCLEAR CLEANUP FAILED - Some data may remain',
                timestamp: new Date().toISOString()
            })
        };
    }
};