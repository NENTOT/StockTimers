// netlify/functions/messenger-bot.js
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

// Environment variables needed:
// FACEBOOK_PAGE_ACCESS_TOKEN - Your Facebook Page Access Token
// FACEBOOK_VERIFY_TOKEN - Your webhook verification token
// FIREBASE_* - Your Firebase credentials

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Handle GET request for webhook verification
    if (event.httpMethod === 'GET') {
        const queryParams = event.queryStringParameters || {};
        const mode = queryParams['hub.mode'];
        const token = queryParams['hub.verify_token'];
        const challenge = queryParams['hub.challenge'];

        if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
            console.log('✅ Webhook verified successfully');
            return {
                statusCode: 200,
                headers,
                body: challenge
            };
        } else {
            console.log('❌ Webhook verification failed');
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ error: 'Verification failed' })
            };
        }
    }

    // Handle POST request for incoming messages
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body);
            
            if (body.object === 'page') {
                // Process each entry
                for (const entry of body.entry) {
                    for (const messagingEvent of entry.messaging) {
                        if (messagingEvent.message) {
                            await handleMessage(messagingEvent);
                        }
                    }
                }
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ status: 'EVENT_RECEIVED' })
            };
        } catch (error) {
            console.error('❌ Error processing webhook:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Internal server error' })
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};

async function handleMessage(event) {
    const senderId = event.sender.id;
    const message = event.message;
    
    if (message.text) {
        const messageText = message.text.toLowerCase();
        
        // Handle different commands
        if (messageText.includes('stock') || messageText.includes('inventory')) {
            await sendStockUpdate(senderId);
        } else if (messageText.includes('seeds')) {
            await sendCategoryStock(senderId, 'seeds');
        } else if (messageText.includes('gear')) {
            await sendCategoryStock(senderId, 'gear');
        } else if (messageText.includes('eggs')) {
            await sendCategoryStock(senderId, 'eggs');
        } else if (messageText.includes('cosmetics')) {
            await sendCategoryStock(senderId, 'cosmetics');
        } else if (messageText.includes('help') || messageText.includes('commands')) {
            await sendHelp(senderId);
        } else {
            await sendWelcomeMessage(senderId);
        }
    }
}

async function sendStockUpdate(recipientId) {
    try {
        console.log('📊 Fetching stock data for user:', recipientId);
        
        // Fetch current stock data
        const stockResponse = await fetch(`${API_BASE_URL}/stock/GetStock`);
        if (!stockResponse.ok) {
            throw new Error(`Stock API error: ${stockResponse.status}`);
        }
        
        const stockData = await stockResponse.json();
        
        // Format stock summary
        const stockSummary = formatStockSummary(stockData);
        
        await sendMessage(recipientId, {
            text: stockSummary
        });
        
        // Log interaction to Firebase
        await logInteraction(recipientId, 'stock_request', stockData);
        
    } catch (error) {
        console.error('❌ Error sending stock update:', error);
        await sendMessage(recipientId, {
            text: "Sorry, I couldn't fetch the current stock data. Please try again later."
        });
    }
}

async function sendCategoryStock(recipientId, category) {
    try {
        const stockResponse = await fetch(`${API_BASE_URL}/stock/GetStock`);
        if (!stockResponse.ok) {
            throw new Error(`Stock API error: ${stockResponse.status}`);
        }
        
        const stockData = await stockResponse.json();
        const categoryData = getCategoryData(stockData, category);
        
        const message = formatCategoryStock(category, categoryData);
        
        await sendMessage(recipientId, { text: message });
        
        await logInteraction(recipientId, `${category}_request`, categoryData);
        
    } catch (error) {
        console.error(`❌ Error sending ${category} stock:`, error);
        await sendMessage(recipientId, {
            text: `Sorry, I couldn't fetch the ${category} stock data. Please try again later.`
        });
    }
}

function getCategoryData(stockData, category) {
    switch (category) {
        case 'seeds':
            return stockData.seedsStock || [];
        case 'gear':
            return stockData.gearStock || [];
        case 'eggs':
            return stockData.eggStock || [];
        case 'cosmetics':
            return stockData.cosmeticsStock || [];
        default:
            return [];
    }
}

function formatStockSummary(stockData) {
    const formatItems = (items) => {
        return items.slice(0, 5).map((item, i) => {
            const name = item.name || item.itemName || 'Unknown';
            const qty = item.quantity || item.stock || '?';
            return `${i + 1}. ${name} - 📦 Qty: ${qty}`;
        }).join('\n');
    };

    const seeds = formatItems(stockData.seedsStock || []);
    const gear = formatItems(stockData.gearStock || []);
    const eggs = formatItems(stockData.eggStock || []);
    const cosmetics = formatItems(stockData.cosmeticsStock || []);

    return `🌱 *Current Stock Summary* 🌱

📊 *Total Items*: ${seeds.length + gear.length + eggs.length + cosmetics.length}

🌱 *Seeds*:
${seeds}

⚙️ *Gear*:
${gear}

🥚 *Eggs*:
${eggs}

💄 *Cosmetics*:
${cosmetics}

🔄 *Last Updated*: ${new Date().toLocaleString()}`;
}


function formatCategoryStock(category, items) {
    const categoryEmoji = {
        seeds: '🌱',
        gear: '⚙️',
        eggs: '🥚',
        cosmetics: '💄'
    };
    
    if (items.length === 0) {
        return `${categoryEmoji[category]} **${category.toUpperCase()}** - No items in stock`;
    }
    
    let message = `${categoryEmoji[category]} **${category.toUpperCase()} STOCK** (${items.length} items)\n\n`;
    
    // Show first 10 items to avoid message length limits
    const displayItems = items.slice(0, 10);
    
    displayItems.forEach((item, index) => {
        const name = item.name || item.itemName || 'Unknown Item';
        const price = item.price || item.cost || 'N/A';
        const quantity = item.quantity || item.stock || 'N/A';
        
        message += `${index + 1}. ${name}\n`;
        message += `   💰 Price: ${price}\n`;
        message += `   📦 Qty: ${quantity}\n\n`;
    });
    
    if (items.length > 10) {
        message += `... and ${items.length - 10} more items.\n\n`;
    }
    
    message += `🔄 Last Updated: ${new Date().toLocaleString()}`;
    
    return message;
}

async function sendHelp(recipientId) {
    const helpMessage = `🤖 **Garden Stock Bot Help** 🤖

Here are the commands you can use:

📊 **'stock'** or **'inventory'** - Get full stock summary
🌱 **'seeds'** - View available seeds
⚙️ **'gear'** - View available gear
🥚 **'eggs'** - View available eggs
💄 **'cosmetics'** - View available cosmetics
❓ **'help'** - Show this help message

Just type any of these keywords and I'll get you the latest stock information!

🌿 Happy gardening! 🌿`;
    
    await sendMessage(recipientId, { text: helpMessage });
}

async function sendWelcomeMessage(recipientId) {
    const welcomeMessage = `🌻 Welcome to Garden Stock Bot! 🌻

I can help you check our current inventory. Here's what you can ask me:

• Type **'stock'** for a complete inventory summary
• Type **'seeds'**, **'gear'**, **'eggs'**, or **'cosmetics'** for specific categories
• Type **'help'** for all available commands

What would you like to check today? 🌱`;
    
    await sendMessage(recipientId, { text: welcomeMessage });
}

async function sendMessage(recipientId, message) {
    const messageData = {
        recipient: { id: recipientId },
        message: message
    };
    
    try {
        const response = await fetch('https://graph.facebook.com/v18.0/me/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`
            },
            body: JSON.stringify(messageData)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Facebook API error: ${response.status} - ${error}`);
        }
        
        console.log('✅ Message sent successfully to:', recipientId);
        
    } catch (error) {
        console.error('❌ Error sending message:', error);
        throw error;
    }
}

async function logInteraction(userId, action, data) {
    try {
        await db.collection('bot_interactions').add({
            userId,
            action,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            data: data || null
        });
        
        console.log('📝 Interaction logged:', { userId, action });
    } catch (error) {
        console.error('❌ Error logging interaction:', error);
    }
}