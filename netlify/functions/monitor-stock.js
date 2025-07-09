// netlify/functions/monitor-stock.js
const mysql = require('mysql2/promise');

// Database connection configuration
const dbConfig = {
    host: process.env.DB_HOST, // from freesqldatabase.com
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: {
        rejectUnauthorized: false
    }
};

const API_BASE_URL = 'https://grow-a-garden-api-4ses.onrender.com/api';

// Initialize database tables if they don't exist
async function initializeTables(connection) {
    try {
        // Create stock_history table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS stock_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                stock_data JSON,
                seeds_count INT DEFAULT 0,
                gear_count INT DEFAULT 0,
                eggs_count INT DEFAULT 0,
                cosmetics_count INT DEFAULT 0
            )
        `);

        // Create stock_changes table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS stock_changes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                change_type VARCHAR(50) DEFAULT 'stock_change',
                changes JSON,
                change_count INT DEFAULT 0
            )
        `);

        console.log('✅ Database tables initialized');
    } catch (error) {
        console.error('❌ Error initializing tables:', error);
        throw error;
    }
}

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

    let connection;
    
    try {
        console.log('🔍 Starting stock monitoring function...');
        
        // Create database connection
        connection = await mysql.createConnection(dbConfig);
        await initializeTables(connection);
        
        // Fetch current stock data
        const stockResponse = await fetch(`${API_BASE_URL}/stock/GetStock`);
        if (!stockResponse.ok) {
            throw new Error(`Stock API error: ${stockResponse.status} ${stockResponse.statusText}`);
        }
        
        const newStockData = await stockResponse.json();
        console.log('📦 Fetched new stock data successfully');
        
        // Get the last stock data from MySQL
        const [lastStockRows] = await connection.execute(`
            SELECT stock_data FROM stock_history 
            ORDER BY timestamp DESC 
            LIMIT 1
        `);
        
        let previousStockData = null;
        if (lastStockRows.length > 0) {
            previousStockData = JSON.parse(lastStockRows[0].stock_data);
        }
        
        // Compare stock data
        const comparison = compareStockData(newStockData, previousStockData);
        
        // Always save current stock snapshot
        await connection.execute(`
            INSERT INTO stock_history (stock_data, seeds_count, gear_count, eggs_count, cosmetics_count)
            VALUES (?, ?, ?, ?, ?)
        `, [
            JSON.stringify(newStockData),
            newStockData.seedsStock?.length || 0,
            newStockData.gearStock?.length || 0,
            newStockData.eggStock?.length || 0,
            newStockData.cosmeticsStock?.length || 0
        ]);
        
        let responseMessage = 'Stock data saved successfully';
        
        // If there are changes, save them separately
        if (comparison.hasChanges) {
            await connection.execute(`
                INSERT INTO stock_changes (changes, change_count)
                VALUES (?, ?)
            `, [
                JSON.stringify(comparison.changes),
                comparison.changes.length
            ]);
            
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
    } finally {
        // Close database connection
        if (connection) {
            await connection.end();
        }
    }
};