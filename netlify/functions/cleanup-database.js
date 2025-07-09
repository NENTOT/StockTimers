// netlify/functions/cleanup-database.js
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // Delete old records (older than 7 days)
        const [changesResult] = await connection.execute(`
            DELETE FROM stock_changes 
            WHERE timestamp < DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);
        
        const [historyResult] = await connection.execute(`
            DELETE FROM stock_history 
            WHERE timestamp < DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);
        
        const totalDeleted = changesResult.affectedRows + historyResult.affectedRows;
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                deletedRecords: totalDeleted,
                message: `Cleanup completed - ${totalDeleted} records deleted`
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    } finally {
        if (connection) await connection.end();
    }
};