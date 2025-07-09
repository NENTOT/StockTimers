// netlify/functions/save-stock-changes.js
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

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed'
            })
        };
    }

    let connection;
    
    try {
        // Parse the request body
        const body = JSON.parse(event.body);
        const { changes, changeCount } = body;
        
        if (!changes || !Array.isArray(changes) || changes.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid or empty changes array'
                })
            };
        }
        
        console.log(`💾 Saving ${changes.length} stock changes to database`);
        
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
        
        // Insert the stock changes
        const query = `
            INSERT INTO stock_history (changes, change_count) 
            VALUES (?, ?)
        `;
        
        const [result] = await connection.execute(query, [
            JSON.stringify(changes),
            changeCount || changes.length
        ]);
        
        console.log(`✅ Successfully saved stock changes with ID: ${result.insertId}`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Stock changes saved successfully',
                insertId: result.insertId,
                changeCount: changes.length
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
                error: error.message || 'Database operation failed',
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