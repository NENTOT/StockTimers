// netlify/functions/cleanup-database.js
const mysql = require('mysql2/promise');

// Database configuration - cleaned for MySQL2
const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: false,
    connectTimeout: 60000,
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
                error: 'Method not allowed. Use POST.'
            })
        };
    }

    let connection;
    
    try {
        console.log('🗑️ Starting database cleanup...');
        
        // Create database connection
        connection = await mysql.createConnection(dbConfig);
        await connection.ping();
        console.log('✅ Database connection successful');
        
        // Check current record count before cleanup
        const [countBefore] = await connection.execute(
            'SELECT COUNT(*) as count FROM stock_history'
        );
        const recordsBefore = countBefore[0].count;
        
        console.log(`📊 Records before cleanup: ${recordsBefore}`);
        
        // Delete records older than 24 hours
        const query = `
            DELETE FROM stock_history 
            WHERE timestamp < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `;
        
        const [result] = await connection.execute(query);
        const deletedCount = result.affectedRows;
        
        // Check record count after cleanup
        const [countAfter] = await connection.execute(
            'SELECT COUNT(*) as count FROM stock_history'
        );
        const recordsAfter = countAfter[0].count;
        
        console.log(`✅ Database cleanup completed:`, {
            recordsBefore: recordsBefore,
            recordsDeleted: deletedCount,
            recordsAfter: recordsAfter
        });
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Database cleanup completed successfully',
                data: {
                    recordsBefore: recordsBefore,
                    deletedRecords: deletedCount,
                    recordsAfter: recordsAfter,
                    timestamp: new Date().toISOString()
                }
            })
        };
        
    } catch (error) {
        console.error('❌ Error during database cleanup:', error);
        
        // Log detailed error information
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