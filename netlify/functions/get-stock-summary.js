// netlify/functions/get-stock-summary.js - Get stock summary and analytics
const mysql3 = require('mysql2/promise');

const dbConfig3 = {
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
        connection = await mysql3.createConnection(dbConfig3);
        await connection.ping();
        
        // Get summary statistics
        const summaryQuery = `
            SELECT 
                COUNT(*) as total_records,
                MAX(timestamp) as latest_update,
                MIN(timestamp) as earliest_record,
                AVG(seeds_count) as avg_seeds,
                AVG(gear_count) as avg_gear,
                AVG(eggs_count) as avg_eggs,
                AVG(cosmetics_count) as avg_cosmetics,
                MAX(seeds_count) as max_seeds,
                MAX(gear_count) as max_gear,
                MAX(eggs_count) as max_eggs,
                MAX(cosmetics_count) as max_cosmetics
            FROM stock_history
        `;
        
        const [summaryRows] = await connection.execute(summaryQuery);
        
        // Get recent activity (last 24 hours)
        const recentQuery = `
            SELECT 
                COUNT(*) as recent_changes,
                SUM(change_count) as total_changes_24h
            FROM stock_history
            WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `;
        
        const [recentRows] = await connection.execute(recentQuery);
        
        // Get stock trend (last 10 records)
        const trendQuery = `
            SELECT 
                timestamp,
                seeds_count,
                gear_count,
                eggs_count,
                cosmetics_count
            FROM stock_history
            ORDER BY timestamp DESC
            LIMIT 10
        `;
        
        const [trendRows] = await connection.execute(trendQuery);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                summary: summaryRows[0],
                recentActivity: recentRows[0],
                stockTrend: trendRows.reverse(), // Reverse to show oldest first
                generatedAt: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('❌ Error fetching stock summary:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || 'Failed to fetch stock summary',
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