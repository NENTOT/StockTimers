// netlify/functions/get-stock-history.js - Fixed for MySQL 5.7
const mysql = require('mysql2/promise');

// Database configuration with SSL disabled - Fixed for MySQL2
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
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    let connection;
    
    try {
        const limit = event.queryStringParameters?.limit || 20;
        const parsedLimit = Math.min(Math.max(parseInt(limit), 1), 100);

        console.log(`Fetching stock history with limit: ${parsedLimit}`);
        
        connection = await mysql.createConnection(dbConfig);
        await connection.ping();
        console.log('✅ Database connection successful');
        
        // Fixed table creation for MySQL 5.7
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS stock_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                changes TEXT NOT NULL,
                change_count INT NOT NULL,
                KEY idx_timestamp (timestamp)
            )
        `);
        console.log('✅ Table verification completed');
        
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
        
        // Parse the changes TEXT field as JSON
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