// netlify/functions/get-stock-history.js
const mysql = require('mysql2/promise');

// Database configuration with SSL disabled
const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Disable SSL - this is the key fix
    ssl: false,
    // Alternative: if you need SSL but with self-signed certificates
    // ssl: {
    //     rejectUnauthorized: false
    // },
    // Connection timeout settings
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
    // Reconnection settings
    reconnect: true,
    // Character set
    charset: 'utf8mb4'
};

exports.handler = async (event, context) => {
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    let connection;
    
    try {
        // Parse query parameters
        const limit = event.queryStringParameters?.limit || 20;
        const parsedLimit = Math.min(Math.max(parseInt(limit), 1), 100); // Limit between 1-100

        console.log(`Fetching stock history with limit: ${parsedLimit}`);
        
        // Create database connection
        connection = await mysql.createConnection(dbConfig);
        
        // Test the connection
        await connection.ping();
        console.log('✅ Database connection successful');
        
        // Create the stock_history table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS stock_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                changes JSON NOT NULL,
                change_count INT NOT NULL,
                INDEX idx_timestamp (timestamp)
            )
        `);
        console.log('✅ Table verification completed');
        
        // Query to get stock history
        const query = `
            SELECT 
                id,
                timestamp,
                changes,
                change_count
            FROM stock_history 
            ORDER BY timestamp DESC 
            LIMIT ?
        `;
        
        const [rows] = await connection.execute(query, [parsedLimit]);
        
        // Parse the changes JSON for each row
        const history = rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            changes: JSON.parse(row.changes),
            changeCount: row.change_count
        }));
        
        console.log(`✅ Successfully fetched ${history.length} history records`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                history: history,
                count: history.length
            })
        };
        
    } catch (error) {
        console.error('❌ Database error:', error);
        
        // More detailed error logging
        if (error.code) {
            console.error('Error code:', error.code);
        }
        if (error.errno) {
            console.error('Error number:', error.errno);
        }
        if (error.sqlMessage) {
            console.error('SQL message:', error.sqlMessage);
        }
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Database connection failed',
                details: {
                    code: error.code,
                    errno: error.errno,
                    sqlMessage: error.sqlMessage
                }
            })
        };
        
    } finally {
        // Always close the connection
        if (connection) {
            try {
                await connection.end();
                console.log('🔌 Database connection closed');
            } catch (closeError) {
                console.error('Error closing connection:', closeError);
            }
        }
    }
};