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

// 🐌 SLOW AND STEADY - Quota-friendly deletion
async function slowDelete(collectionName, maxDocs = 50) {
    console.log(`🐌 Slow deleting ${collectionName}...`);
    
    let totalDeleted = 0;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
        try {
            // Get only a few documents at a time
            const snapshot = await db.collection(collectionName).limit(10).get();
            
            if (snapshot.empty) {
                console.log(`✅ ${collectionName} is empty (deleted ${totalDeleted} total)`);
                break;
            }

            // Delete ONE document at a time with delays
            for (const doc of snapshot.docs) {
                try {
                    await doc.ref.delete();
                    totalDeleted++;
                    console.log(`🗑️ Deleted 1 doc from ${collectionName} (${totalDeleted} total)`);
                    
                    // Long delay between each deletion
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
                } catch (error) {
                    console.error(`Failed to delete doc:`, error.message);
                    // Continue with next doc
                }
            }
            
            attempts++;
            
            // Long delay between batches
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
            
        } catch (error) {
            console.error(`Error in batch ${attempts}:`, error.message);
            attempts++;
            
            // Even longer delay on error
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
        }
    }
    
    return totalDeleted;
}

// 🚶 ULTRA CONSERVATIVE - One doc every 30 seconds
async function ultraSlowDelete(collectionName) {
    console.log(`🚶 Ultra slow deleting ${collectionName}...`);
    
    let totalDeleted = 0;
    let consecutiveErrors = 0;
    const maxErrors = 5;
    
    while (consecutiveErrors < maxErrors) {
        try {
            // Get just ONE document
            const snapshot = await db.collection(collectionName).limit(1).get();
            
            if (snapshot.empty) {
                console.log(`✅ ${collectionName} is empty (deleted ${totalDeleted} total)`);
                break;
            }

            // Delete the single document
            const doc = snapshot.docs[0];
            await doc.ref.delete();
            totalDeleted++;
            consecutiveErrors = 0; // Reset error counter
            
            console.log(`🗑️ Deleted 1 doc from ${collectionName} (${totalDeleted} total)`);
            
            // VERY long delay - 30 seconds between deletions
            await new Promise(resolve => setTimeout(resolve, 30000));
            
        } catch (error) {
            console.error(`Error deleting from ${collectionName}:`, error.message);
            consecutiveErrors++;
            
            // Exponential backoff on errors
            const delay = Math.min(60000 * Math.pow(2, consecutiveErrors), 300000); // Max 5 minutes
            console.log(`⏳ Waiting ${delay/1000} seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    return totalDeleted;
}

// 🔍 CHECK QUOTA STATUS
async function checkQuotaStatus() {
    try {
        // Try a simple read operation to test quota
        const testQuery = await db.collection('stock_history').limit(1).get();
        console.log('✅ Quota check passed');
        return true;
    } catch (error) {
        if (error.code === 8) { // RESOURCE_EXHAUSTED
            console.log('❌ Quota exceeded - need to wait');
            return false;
        }
        console.log('⚠️ Other error:', error.message);
        return false;
    }
}

// 🕐 WAIT FOR QUOTA RESET
async function waitForQuotaReset() {
    console.log('⏳ Waiting for quota reset...');
    
    // Wait in 1-minute intervals, checking quota status
    for (let i = 0; i < 60; i++) { // Wait up to 1 hour
        await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute
        
        const quotaOk = await checkQuotaStatus();
        if (quotaOk) {
            console.log('✅ Quota appears to be reset');
            return true;
        }
        
        console.log(`⏳ Still waiting... (${i+1}/60 minutes)`);
    }
    
    console.log('⚠️ Quota still not reset after 1 hour');
    return false;
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
        console.log('🐌 ULTRA CONSERVATIVE CLEANUP - Quota-friendly deletion');
        const startTime = Date.now();

        // Check quota first
        const quotaOk = await checkQuotaStatus();
        if (!quotaOk) {
            console.log('❌ Quota exceeded - attempting to wait for reset...');
            const resetOk = await waitForQuotaReset();
            if (!resetOk) {
                return {
                    statusCode: 429,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Quota exceeded and reset not detected',
                        message: 'Try again later when quota resets',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Start with the most important collections
        const results = {};
        
        // Priority collections (these are causing the quota issues)
        const priorityCollections = ['stock_history', 'stock_changes'];
        
        for (const collectionName of priorityCollections) {
            console.log(`🎯 Processing priority collection: ${collectionName}`);
            
            try {
                // Try slow method first
                let deleted = await slowDelete(collectionName);
                
                // If still documents remain, try ultra slow
                if (deleted > 0) {
                    console.log(`🚶 Switching to ultra slow for ${collectionName}`);
                    const ultraDeleted = await ultraSlowDelete(collectionName);
                    deleted += ultraDeleted;
                }
                
                results[collectionName] = deleted;
                
            } catch (error) {
                console.error(`Failed to process ${collectionName}:`, error.message);
                results[collectionName] = 0;
            }
        }

        const executionTime = Date.now() - startTime;
        const totalDeleted = Object.values(results).reduce((sum, count) => sum + count, 0);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Conservative cleanup completed',
                deleted: results,
                totalDocuments: totalDeleted,
                executionTime: `${executionTime}ms`,
                timestamp: new Date().toISOString(),
                note: 'Used quota-friendly slow deletion. Run multiple times if needed.'
            })
        };
        
    } catch (error) {
        console.error('💣 Cleanup failed:', error);
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