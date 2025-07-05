// ui-controller.js
// Handles all UI updates and interactions

class UIController {
  constructor() {
    this.historyVisible = false;
    this.initializeElements();
  }

  // Initialize DOM elements
  initializeElements() {
    // Timer elements
    this.timerElements = {
      seedTimer: document.getElementById('seedTimer'),
      gearTimer: document.getElementById('gearTimer'),
      eggTimer: document.getElementById('eggTimer'),
      cosmeticTimer: document.getElementById('cosmeticTimer')
    };

    this.timerContainers = {
      seedTimer: document.getElementById('seed-timer'),
      gearTimer: document.getElementById('gear-timer'),
      eggTimer: document.getElementById('egg-timer'),
      cosmeticTimer: document.getElementById('cosmetic-timer')
    };

    // Stock elements
    this.stockStatusElement = document.getElementById('stock-status');
    this.stockContainer = document.getElementById('stock-container');
    this.stockTimestamp = document.getElementById('stock-timestamp');
    this.firebaseStatusElement = document.getElementById('firebase-status');
    
    // History elements
    this.historyContainer = document.getElementById('history-container');
    this.historySection = document.getElementById('history-section');
    
    // Buttons
    this.refreshBtn = document.getElementById('refreshAllBtn');
    this.historyBtn = document.getElementById('historyBtn');
  }

  // Get timer elements for TimerService
  getTimerElements() {
    return this.timerElements;
  }

  // Get timer containers for TimerService
  getTimerContainers() {
    return this.timerContainers;
  }

  // Update stock status display
  updateStockStatus(connected, message = null) {
    if (connected) {
      this.stockStatusElement.textContent = message || 'Connected to stock service';
      this.stockStatusElement.className = 'status connected';
      if (this.refreshBtn) {
        this.refreshBtn.disabled = false;
      }
    } else {
      this.stockStatusElement.textContent = message || 'Disconnected from stock service';
      this.stockStatusElement.className = 'status disconnected';
      if (this.refreshBtn) {
        this.refreshBtn.disabled = true;
      }
    }
  }

  // Update Firebase status display
  updateFirebaseStatus(connected, message = null) {
    if (connected) {
      this.firebaseStatusElement.textContent = message || '🔥 Firebase: Connected';
      this.firebaseStatusElement.className = 'status firebase-connected';
    } else {
      this.firebaseStatusElement.textContent = message || '🔥 Firebase: Connection failed';
      this.firebaseStatusElement.className = 'status disconnected';
    }
  }

  // Show loading state for stock
  showStockLoading() {
    this.stockContainer.innerHTML = '<div class="loading">Loading stock data...</div>';
  }

  // Show error state for stock
  showStockError(errorMessage) {
    this.stockContainer.innerHTML = `<div class="error">Error loading stock data: ${errorMessage}</div>`;
  }

  // Display stock data
  displayStock(stockData) {
    let html = '';
    
    const categories = [
      { key: 'seedsStock', name: 'Seeds', emoji: '🌱' },
      { key: 'gearStock', name: 'Gears', emoji: '⚙️' },
      { key: 'eggStock', name: 'Eggs', emoji: '🥚' },
      { key: 'cosmeticsStock', name: 'Cosmetics', emoji: '💄' }
    ];

    categories.forEach(category => {
      const items = stockData[category.key];
      if (items && items.length > 0) {
        html += `
          <div class="stock-category">
            <h3>${category.emoji} ${category.name} (${items.length} items)</h3>
            <div class="stock-items">
        `;
        
        items.forEach(item => {
          html += `
            <div class="stock-item">
              <span class="stock-item-name">${item.name}</span>
              <span class="stock-item-quantity">${item.value}</span>
            </div>
          `;
        });
        
        html += `
            </div>
          </div>
        `;
      }
    });

    if (html === '') {
      html = '<div class="loading">No stock data available</div>';
    }

    this.stockContainer.innerHTML = html;
  }

  // Update stock timestamp
  updateStockTimestamp() {
    this.stockTimestamp.textContent = `Last updated: ${new Date().toLocaleString()}`;
  }

  // Show history loading state
  showHistoryLoading() {
    this.historyContainer.innerHTML = '<div class="loading">Loading history...</div>';
  }

  // Show history error state
  showHistoryError(errorMessage) {
    this.historyContainer.innerHTML = `<div class="error">Error loading history: ${errorMessage}</div>`;
  }

  // Display history data
  displayHistory(history) {
    if (history.length === 0) {
      this.historyContainer.innerHTML = '<div class="loading">No history available</div>';
      return;
    }

    let html = '';
    history.forEach(entry => {
      const date = entry.timestamp.toLocaleString();
      const changeCount = entry.changeCount || 0;
      
      html += `
        <div class="history-item">
          <div class="history-timestamp">${date} (${changeCount} changes)</div>
          <div class="history-changes">
      `;
      
      entry.changes.forEach(change => {
        let changeText = '';
        switch (change.type) {
          case 'added':
            changeText = `${change.emoji} Added: ${change.item} (${change.value})`;
            break;
          case 'removed':
            changeText = `${change.emoji} Removed: ${change.item} (${change.value})`;
            break;
          case 'changed':
            changeText = `${change.emoji} Changed: ${change.item} (${change.oldValue} → ${change.newValue})`;
            break;
        }
        
        html += `<div class="change-item">${changeText}</div>`;
      });
      
      html += `
          </div>
        </div>
      `;
    });

    this.historyContainer.innerHTML = html;
  }

  // Toggle history visibility
  toggleHistory() {
    this.historyVisible = !this.historyVisible;
    
    if (this.historyVisible) {
      this.historySection.style.display = 'block';
      this.historyBtn.textContent = '📊 Hide History';
      return true; // Indicates history should be loaded
    } else {
      this.historySection.style.display = 'none';
      this.historyBtn.textContent = '📊 Show History';
      return false;
    }
  }

  // Check if history is visible
  isHistoryVisible() {
    return this.historyVisible;
  }

  // Set button event listeners
  setButtonListeners(refreshCallback, historyCallback) {
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', refreshCallback);
    }
    
    if (this.historyBtn) {
      this.historyBtn.addEventListener('click', historyCallback);
    }
  }

  // Enable/disable refresh button
  setRefreshButtonEnabled(enabled) {
    if (this.refreshBtn) {
      this.refreshBtn.disabled = !enabled;
    }
  }

  // Update timer status display
  updateTimerStatus(message) {
    const timerStatus = document.getElementById('timer-status');
    if (timerStatus) {
      timerStatus.textContent = message || 'Timers running (calculated)';
    }
  }

  // Show notification (could be expanded to use toast notifications)
  showNotification(message, type = 'info') {
    console.log(`${type.toUpperCase()}: ${message}`);
    // Could implement toast notifications here
  }

  // Get all necessary elements for external use
  getElements() {
    return {
      timerElements: this.timerElements,
      timerContainers: this.timerContainers,
      stockStatusElement: this.stockStatusElement,
      stockContainer: this.stockContainer,
      stockTimestamp: this.stockTimestamp,
      firebaseStatusElement: this.firebaseStatusElement,
      historyContainer: this.historyContainer,
      historySection: this.historySection,
      refreshBtn: this.refreshBtn,
      historyBtn: this.historyBtn
    };
  }
}