
// netlify/functions/get-stock-history.js
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    let connection;
    try {
        const limit = parseInt(event.queryStringParameters?.limit) || 20;
        
        connection = await mysql.createConnection(dbConfig);
        
        const [rows] = await connection.execute(`
            SELECT id, timestamp, changes, change_count
            FROM stock_changes
            ORDER BY timestamp DESC
            LIMIT ?
        `, [limit]);
        
        const history = rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            changes: JSON.parse(row.changes),
            changeCount: row.change_count
        }));
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                history: history
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