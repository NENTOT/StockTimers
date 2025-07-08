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

// 🔥 Delete all docs in a collection in batches
async function deleteAllDocuments(collectionName) {
    const futureDate = new Date('2100-01-01T00:00:00Z'); // match everything
    console.log(`🧨 Deleting all documents in ${collectionName}...`);
    
    try {
        const query = db.collection(collectionName)
            .where('timestamp', '<', futureDate)
            .limit(500); // Firestore batch limit

        const snapshot = await query.get();
        if (snapshot.empty) {
            console.log(`✅ No documents found in ${collectionName}`);
            return 0;
        }

        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        console.log(`✅ Deleted ${snapshot.docs.length} documents from ${collectionName}`);
        return snapshot.docs.length;
    } catch (error) {
        console.error(`❌ Error deleting from ${collectionName}:`, error);
        throw error;
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
        console.log('🚨 Emergency cleanup starting...');
        const startTime = Date.now();

        const deletedHistory = await deleteAllDocuments('stock_history');
        const deletedChanges = await deleteAllDocuments('stock_changes');

        const executionTime = Date.now() - startTime;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Emergency cleanup completed.',
                deleted: {
                    stock_history: deletedHistory,
                    stock_changes: deletedChanges
                },
                executionTime: `${executionTime}ms`,
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
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
