// stock-service.js
// Handles all stock-related API calls and data management

class StockService {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
    this.previousStockData = null;
    this.stockRefreshTimeout = null;
  }

  // Fetch stock data from API
  async fetchStock() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/stock/GetStock`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const stockData = await response.json();
      return stockData;
    } catch (error) {
      console.error('Error fetching stock:', error);
      throw error;
    }
  }

  // Enhanced stock comparison with detailed change tracking
  compareStockData(newData, oldData) {
    if (!oldData) return { hasChanges: false, changes: [] };
    
    try {
      const changes = [];
      const categories = [
        { key: 'seedsStock', name: 'Seeds', emoji: '🌱' },
        { key: 'gearStock', name: 'Gear', emoji: '⚙️' },
        { key: 'eggStock', name: 'Eggs', emoji: '🥚' },
        { key: 'cosmeticsStock', name: 'Cosmetics', emoji: '💄' }
      ];
      
      for (const category of categories) {
        const newItems = newData[category.key] || [];
        const oldItems = oldData[category.key] || [];
        
        // Create maps for easier comparison
        const newMap = new Map(newItems.map(item => [item.name, item.value]));
        const oldMap = new Map(oldItems.map(item => [item.name, item.value]));
        
        // Check for new items
        for (const [name, value] of newMap) {
          if (!oldMap.has(name)) {
            changes.push({
              type: 'added',
              category: category.name,
              emoji: category.emoji,
              item: name,
              value: value
            });
          } else if (oldMap.get(name) !== value) {
            changes.push({
              type: 'changed',
              category: category.name,
              emoji: category.emoji,
              item: name,
              oldValue: oldMap.get(name),
              newValue: value
            });
          }
        }
        
        // Check for removed items
        for (const [name, value] of oldMap) {
          if (!newMap.has(name)) {
            changes.push({
              type: 'removed',
              category: category.name,
              emoji: category.emoji,
              item: name,
              value: value
            });
          }
        }
      }
      
      return {
        hasChanges: changes.length > 0,
        changes: changes
      };
    } catch (error) {
      console.error('Error comparing stock data:', error);
      return { hasChanges: false, changes: [] };
    }
  }

  // Enhanced stock fetch with comparison and Firebase logging
  async fetchStockWithComparison(firebaseService, uiController) {
    console.log('📦 Fetching stock with comparison...');
    
    try {
      uiController.showStockLoading();
      const newStockData = await this.fetchStock();
      
      if (newStockData) {
        const comparison = this.compareStockData(newStockData, this.previousStockData);
        
        // Display stock data
        uiController.displayStock(newStockData);
        uiController.updateStockTimestamp();
        
        // Save to Firebase
        if (firebaseService) {
          await firebaseService.saveStockToFirebase(newStockData);
        }
        
        if (comparison.hasChanges) {
          console.log('✅ Stock changed! New items detected:', comparison.changes.length, 'changes');
          uiController.updateStockStatus(true, `Stock updated - ${comparison.changes.length} changes detected!`);
          
          // Save changes to Firebase
          if (firebaseService) {
            await firebaseService.saveStockChangeToFirebase(comparison.changes);
          }
          
          // Clear any pending auto-refresh
          if (this.stockRefreshTimeout) {
            clearTimeout(this.stockRefreshTimeout);
            this.stockRefreshTimeout = null;
          }
        } else {
          console.log('🔄 Stock unchanged, scheduling refresh in 30 seconds...');
          uiController.updateStockStatus(true, 'Stock unchanged - Auto-refresh in 30 seconds');
          
          if (this.stockRefreshTimeout) {
            clearTimeout(this.stockRefreshTimeout);
          }
          
          this.stockRefreshTimeout = setTimeout(() => {
            console.log('🔄 Auto-refreshing stock after 30 seconds...');
            this.fetchStockWithComparison(firebaseService, uiController);
          }, 30000);
        }
        
        // Store a deep copy for comparison
        this.previousStockData = JSON.parse(JSON.stringify(newStockData));
        return newStockData;
      }
    } catch (error) {
      console.error('Error in fetchStockWithComparison:', error);
      uiController.showStockError(error.message);
      uiController.updateStockStatus(false, `Error: ${error.message}`);
      return null;
    }
  }

  // Clear auto-refresh timeout
  clearAutoRefresh() {
    if (this.stockRefreshTimeout) {
      clearTimeout(this.stockRefreshTimeout);
      this.stockRefreshTimeout = null;
    }
  }

  // Get previous stock data
  getPreviousStockData() {
    return this.previousStockData;
  }

  // Set previous stock data
  setPreviousStockData(data) {
    this.previousStockData = data;
  }
}