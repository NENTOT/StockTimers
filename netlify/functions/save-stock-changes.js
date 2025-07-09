const mysql = require('mysql2/promise');

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
        const body = JSON.parse(event.body);
        const { changes, changeCount } = body;
        
        if (!changes || !Array.isArray(changes) || changes.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid changes data'
                })
            };
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.ping();
        
        // Create table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS stock_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                changes TEXT NOT NULL,
                change_count INT NOT NULL,
                KEY idx_timestamp (timestamp)
            )
        `);
        
        // Insert the changes as JSON string in TEXT field
        const query = `
            INSERT INTO stock_history (changes, change_count) 
            VALUES (?, ?)
        `;
        
        const [result] = await connection.execute(query, [
            JSON.stringify(changes),
            changeCount
        ]);
        
        console.log(`✅ Stock changes saved: ${changeCount} changes, ID: ${result.insertId}`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Changes saved successfully',
                id: result.insertId,
                changeCount: changeCount
            })
        };
        
    } catch (error) {
        console.error('❌ Error saving stock changes:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Failed to save changes',
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
            } catch (closeError) {
                console.error('Error closing connection:', closeError);
            }
        }
    }
};