// netlify/functions/cleanup-database.js
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
        console.log('🗑️ Starting database cleanup...');
        
        // Create database connection
        connection = await mysql.createConnection(dbConfig);
        
        // Test the connection
        await connection.ping();
        console.log('✅ Database connection successful');
        
        // Delete records older than 7 days
        const deleteQuery = `
            DELETE FROM stock_history 
            WHERE timestamp < DATE_SUB(NOW(), INTERVAL 7 DAY)
        `;
        
        const [result] = await connection.execute(deleteQuery);
        const deletedRecords = result.affectedRows;
        
        console.log(`✅ Database cleanup completed: ${deletedRecords} records deleted`);
        
        // Get current record count
        const [countResult] = await connection.execute(
            'SELECT COUNT(*) as count FROM stock_history'
        );
        const remainingRecords = countResult[0].count;
        
        console.log(`📊 Remaining records in database: ${remainingRecords}`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Database cleanup completed successfully',
                deletedRecords: deletedRecords,
                remainingRecords: remainingRecords,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('❌ Database cleanup error:', error);
        
        // More detailed error logging
        console.error('Error details:', {
            code: error.code,
            errno: error.errno,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState
        });
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Database cleanup failed',
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