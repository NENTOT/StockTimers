// netlify/functions/test-db-connection.js
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    // Remove SSL configuration since the server doesn't support it
    ssl: false,
    // Add connection timeout and other helpful options
    connectTimeout: 30000,
    acquireTimeout: 30000,
    timeout: 30000
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    let connection;
    try {
        console.log('Attempting to connect to MySQL database...');
        console.log('Host:', process.env.DB_HOST);
        console.log('User:', process.env.DB_USER);
        console.log('Database:', process.env.DB_NAME);
        console.log('Port:', process.env.DB_PORT || 3306);
        console.log('SSL: disabled');
        
        connection = await mysql.createConnection(dbConfig);
        
        console.log('Connection established, testing query...');
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('Test query successful:', rows);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Database connection successful',
                testResult: rows[0]
            })
        };
        
    } catch (error) {
        console.error('Database connection failed:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                code: error.code || 'UNKNOWN_ERROR'
            })
        };
    } finally {
        if (connection) {
            try {
                await connection.end();
                console.log('Database connection closed');
            } catch (error) {
                console.error('Error closing connection:', error);
            }
        }
    }
};