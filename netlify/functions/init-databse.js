// netlify/functions/init-database.js
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
        console.log('🚀 Initializing database...');
        
        // Create database connection
        connection = await mysql.createConnection(dbConfig);
        
        // Test the connection
        await connection.ping();
        console.log('✅ Database connection successful');
        
        // Drop existing table if it exists (use with caution!)
        const dropTable = event.queryStringParameters?.drop === 'true';
        if (dropTable) {
            await connection.execute('DROP TABLE IF EXISTS stock_history');
            console.log('🗑️ Existing table dropped');
        }
        
        // Create the stock_history table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS stock_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                changes JSON NOT NULL,
                change_count INT NOT NULL,
                INDEX idx_timestamp (timestamp)
            )
        `);
        console.log('✅ Table created successfully');
        
        // Verify table structure
        const [tableInfo] = await connection.execute('DESCRIBE stock_history');
        console.log('📊 Table structure:', tableInfo);
        
        // Check if table is empty
        const [countResult] = await connection.execute('SELECT COUNT(*) as count FROM stock_history');
        const recordCount = countResult[0].count;
        
        // Insert a test record if table is empty
        if (recordCount === 0) {
            const testChanges = [
                {
                    type: 'test',
                    category: 'System',
                    emoji: '🔧',
                    item: 'Database initialization',
                    value: 'Test record'
                }
            ];
            
            await connection.execute(
                'INSERT INTO stock_history (changes, change_count) VALUES (?, ?)',
                [JSON.stringify(testChanges), 1]
            );
            console.log('✅ Test record inserted');
        }
        
        // Get final record count
        const [finalCount] = await connection.execute('SELECT COUNT(*) as count FROM stock_history');
        const finalRecordCount = finalCount[0].count;
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Database initialized successfully',
                details: {
                    tableCreated: true,
                    recordCount: finalRecordCount,
                    tableDropped: dropTable,
                    tableStructure: tableInfo,
                    timestamp: new Date().toISOString()
                }
            })
        };
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Database initialization failed',
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