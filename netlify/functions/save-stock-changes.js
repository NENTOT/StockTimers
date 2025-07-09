// netlify/functions/test-db-connection.js - Fixed for MySQL 5.7
const mysql2 = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: false,
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
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
        console.log('🔍 Testing database connection...');
        console.log('Host:', process.env.DB_HOST);
        console.log('Port:', process.env.DB_PORT || 3306);
        console.log('User:', process.env.DB_USER);
        console.log('Database:', process.env.DB_NAME);
        
        connection = await mysql2.createConnection(dbConfig);
        await connection.ping();
        console.log('✅ Database ping successful');
        
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('✅ Test query successful:', rows);
        
        // Fixed table creation for MySQL 5.7 - removed duplicate JSON keyword
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
