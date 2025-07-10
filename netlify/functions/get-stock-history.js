async function getStockHistoryByDate(startDate, endDate) {
    if (!databaseConnected) return [];
    
    try {
        const params = new URLSearchParams({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });
        
        const response = await fetch(`${DATABASE_API_URL}/get-stock-history-by-date?${params}`);
        const data = await response.json();
        
        if (data.success) {
            return data.history || [];
        } else {
            throw new Error(data.error || 'Failed to fetch filtered history');
        }
    } catch (error) {
        console.error('❌ Error fetching filtered history:', error);
        return [];
    }
}