// netlify/functions/get-stock-history-by-date.js - Get stock history by date range
const mysql2 = require('mysql2/promise');

const dbConfig2 = {
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
        const startDate = event.queryStringParameters?.startDate;
        const endDate = event.queryStringParameters?.endDate;
        
        if (!startDate || !endDate) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'startDate and endDate parameters are required'
                })
            };
        }
        
        connection = await mysql2.createConnection(dbConfig2);
        await connection.ping();
        
        const query = `
            SELECT 
                id,
                timestamp,
                changes,
                change_count,
                stock_data,
                seeds_count,
                gear_count,
                eggs_count,
                cosmetics_count
            FROM stock_history 
            WHERE timestamp BETWEEN ? AND ?
            ORDER BY timestamp DESC
        `;
        
        const [rows] = await connection.execute(query, [startDate, endDate]);
        
        const history = rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            changes: JSON.parse(row.changes),
            changeCount: row.change_count,
            stockData: row.stock_data ? JSON.parse(row.stock_data) : null,
            seedsCount: row.seeds_count,
            gearCount: row.gear_count,
            eggsCount: row.eggs_count,
            cosmeticsCount: row.cosmetics_count
        }));
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                history: history,
                count: history.length,
                dateRange: {
                    startDate: startDate,
                    endDate: endDate
                }
            })
        };
        
    } catch (error) {
        console.error('❌ Error fetching filtered history:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Failed to fetch filtered history',
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