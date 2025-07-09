// netlify/functions/test-db-connection.js
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    // Try different SSL configurations based on your MySQL provider
    ssl: (() => {
        if (process.env.DB_SSL === 'false') return false;
        if (process.env.DB_SSL === 'true') return { rejectUnauthorized: false };
        // Auto-detect: if host contains certain providers, assume SSL is needed
        if (process.env.DB_HOST && (
            process.env.DB_HOST.includes('amazonaws.com') ||
            process.env.DB_HOST.includes('digitalocean.com') ||
            process.env.DB_HOST.includes('planetscale.com') ||
            process.env.DB_HOST.includes('railway.app')
        )) {
            return { rejectUnauthorized: false };
        }
        return false; // Default to no SSL for local/basic MySQL
    })(),
    
    // Additional connection options that might help
    connectTimeout: 30000, // 30 seconds
    acquireTimeout: 30000, // 30 seconds
    timeout: 30000, // 30 seconds
    
    // MySQL specific options
    authPlugins: {
        mysql_native_password: () => () => Buffer.alloc(0),
        mysql_clear_password: () => () => Buffer.alloc(0)
    }
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
        console.log('SSL:', process.env.DB_SSL === 'true' ? 'enabled' : 'disabled');
        
        connection = await mysql.createConnection(dbConfig);
        
        console.log('Connected successfully, testing query...');
        const [rows] = await connection.execute('SELECT 1 as test');
        
        console.log('Query executed successfully:', rows);
        
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
                code: error.code,
                errno: error.errno,
                sqlState: error.sqlState
            })
        };
    } finally {
        if (connection) {
            try {
                await connection.end();
                console.log('Connection closed');
            } catch (closeError) {
                console.error('Error closing connection:', closeError);
            }
        }
    }
};