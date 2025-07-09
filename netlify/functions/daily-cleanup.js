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

// 🐌 MINIMAL OPERATIONS - One operation every 2 minutes
async function minimalDelete(collectionName, maxOps = 5) {
    console.log(`🐌 Minimal delete starting for ${collectionName}...`);
    
    let totalDeleted = 0;
    let operations = 0;
    
    while (operations < maxOps) {
        try {
            console.log(`⏳ Operation ${operations + 1}/${maxOps} - Getting 1 document...`);
            
            // Get just ONE document
            const snapshot = await db.collection(collectionName)
                .limit(1)
                .get();
            
            if (snapshot.empty) {
                console.log(`✅ ${collectionName} is empty (deleted ${totalDeleted} total)`);
                break;
            }

            // Delete the single document
            const doc = snapshot.docs[0];
            console.log(`🗑️ Deleting document: ${doc.id}`);
            
            await doc.ref.delete();
            totalDeleted++;
            operations++;
            
            console.log(`✅ Deleted 1 doc from ${collectionName} (${totalDeleted} total)`);
            
            // MASSIVE delay - 2 minutes between operations
            if (operations < maxOps) {
                console.log(`⏳ Waiting 2 minutes before next operation...`);
                await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes
            }
            
        } catch (error) {
            console.error(`❌ Error in operation ${operations + 1}:`, error.message);
            
            if (error.code === 8) { // RESOURCE_EXHAUSTED
                console.log(`💤 Quota exceeded - waiting 10 minutes...`);
                await new Promise(resolve => setTimeout(resolve, 600000)); // 10 minutes
            } else {
                console.log(`⏳ Other error - waiting 5 minutes...`);
                await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes
            }
            
            operations++; // Count as an operation to prevent infinite loops
        }
    }
    
    return totalDeleted;
}

// 🚶‍♂️ SUPER MINIMAL - One document every 5 minutes
async function superMinimalDelete(collectionName) {
    console.log(`🚶‍♂️ Super minimal delete for ${collectionName}...`);
    
    let totalDeleted = 0;
    let maxAttempts = 3; // Only try 3 times
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`🔍 Attempt ${attempt}/${maxAttempts} - Checking if ${collectionName} has documents...`);
            
            // Check if collection has any documents
            const snapshot = await db.collection(collectionName)
                .limit(1)
                .get();
            
            if (snapshot.empty) {
                console.log(`✅ ${collectionName} is empty`);
                break;
            }

            // Delete ONE document
            const doc = snapshot.docs[0];
            console.log(`🗑️ Deleting document: ${doc.id} from ${collectionName}`);
            
            await doc.ref.delete();
            totalDeleted++;
            
            console.log(`✅ Successfully deleted 1 document from ${collectionName}`);
            
            // HUGE delay - 5 minutes between attempts
            if (attempt < maxAttempts) {
                console.log(`💤 Waiting 5 minutes before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes
            }
            
        } catch (error) {
            console.error(`❌ Attempt ${attempt} failed:`, error.message);
            
            if (error.code === 8) { // RESOURCE_EXHAUSTED
                console.log(`💤 Quota exceeded - waiting 15 minutes...`);
                await new Promise(resolve => setTimeout(resolve, 900000)); // 15 minutes
            }
        }
    }
    
    return totalDeleted;
}

// 🔍 TEST QUOTA - Just check if we can read
async function testQuota() {
    try {
        console.log('🔍 Testing quota with minimal read...');
        const testQuery = await db.collection('stock_history').limit(1).get();
        console.log('✅ Quota test passed');
        return true;
    } catch (error) {
        console.error('❌ Quota test failed:', error.message);
        return false;
    }
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
        console.log('🐌 MINIMAL CLEANUP - Maximum quota conservation');
        const startTime = Date.now();

        // Test quota first
        const quotaOk = await testQuota();
        if (!quotaOk) {
            return {
                statusCode: 429,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Quota exceeded before starting',
                    message: 'Firebase quota is already exhausted. Wait and try again later.',
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Only process the most critical collections
        const results = {};
        
        // Try stock_history first (most important)
        console.log('🎯 Processing stock_history with minimal operations...');
        try {
            results.stock_history = await minimalDelete('stock_history', 3);
        } catch (error) {
            console.error('Failed stock_history:', error.message);
            results.stock_history = 0;
        }
        
        // Wait 5 minutes before next collection
        console.log('⏳ Waiting 5 minutes before processing stock_changes...');
        await new Promise(resolve => setTimeout(resolve, 300000));
        
        // Try stock_changes
        console.log('🎯 Processing stock_changes with minimal operations...');
        try {
            results.stock_changes = await minimalDelete('stock_changes', 3);
        } catch (error) {
            console.error('Failed stock_changes:', error.message);
            results.stock_changes = 0;
        }

        const executionTime = Date.now() - startTime;
        const totalDeleted = Object.values(results).reduce((sum, count) => sum + count, 0);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Minimal cleanup completed',
                deleted: results,
                totalDocuments: totalDeleted,
                executionTime: `${executionTime}ms`,
                timestamp: new Date().toISOString(),
                note: 'Deleted very few documents to conserve quota. Run multiple times over several hours.'
            })
        };
        
    } catch (error) {
        console.error('💣 Minimal cleanup failed:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};