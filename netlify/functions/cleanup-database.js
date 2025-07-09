// netlify/functions/cleanup-database.js - New function needed for MySQL 5.7
const mysql = require('mysql2/promise');

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
        connection = await mysql.createConnection(dbConfig);
        await connection.ping();
        
        // Delete records older than 24 hours
        const query = `
            DELETE FROM stock_history 
            WHERE timestamp < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `;
        
        const [result] = await connection.execute(query);
        
        console.log(`✅ Database cleanup completed: ${result.affectedRows} records deleted`);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Database cleanup completed',
                deletedRecords: result.affectedRows
            })
        };
        
    } catch (error) {
        console.error('❌ Error during database cleanup:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Cleanup failed',
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