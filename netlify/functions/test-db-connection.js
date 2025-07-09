// netlify/functions/test-db-connection.js
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

    let connection;
    
    try {
        console.log('🔍 Testing database connection...');
        console.log('Host:', process.env.DB_HOST);
        console.log('Port:', process.env.DB_PORT || 3306);
        console.log('User:', process.env.DB_USER);
        console.log('Database:', process.env.DB_NAME);
        
        // Create database connection
        connection = await mysql.createConnection(dbConfig);
        
        // Test the connection with a simple query
        await connection.ping();
        console.log('✅ Database ping successful');
        
        // Test a simple query
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('✅ Test query successful:', rows);
        
        // Create the stock_history table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS stock_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                changes JSON JSON NOT NULL,
                change_count INT NOT NULL,
                INDEX idx_timestamp (timestamp)
            )
        `);
        console.log('✅ Table verification completed');
        
        // Check if the stock_history table exists
        const [tables] = await connection.execute(
            "SHOW TABLES LIKE 'stock_history'"
        );
        
        const tableExists = tables.length > 0;
        console.log('📊 Stock history table exists:', tableExists);
        
        let rowCount = 0;
        if (tableExists) {
            const [countResult] = await connection.execute(
                'SELECT COUNT(*) as count FROM stock_history'
            );
            rowCount = countResult[0].count;
            console.log('📈 Records in stock_history:', rowCount);
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Database connection successful',
                details: {
                    connected: true,
                    tableExists: tableExists,
                    recordCount: rowCount,
                    timestamp: new Date().toISOString()
                }
            })
        };
        
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        
        // More detailed error logging
        console.error('Error details:', {
            code: error.code,
            errno: error.errno,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState,
            fatal: error.fatal
        });
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Database connection failed',
                details: {
                    code: error.code,
                    errno: error.errno,
                    sqlMessage: error.sqlMessage,
                    sqlState: error.sqlState,
                    fatal: error.fatal
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