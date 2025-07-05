// timer-service.js
// Handles all timer calculations and updates

class TimerService {
  constructor() {
    this.restockTimes = {};
    this.timerUpdateInterval = null;
    this.onTimerExpired = null; // Callback for when timer expires
    
    // Known restock intervals (in minutes)
    this.intervals = {
      seed: 5,    // Seeds restock every 5 minutes
      gear: 5,    // Gear restocks every 5 minutes  
      egg: 30,    // Eggs restock every 30 minutes
      cosmetic: 180 // Cosmetics restock every 3 hours
    };
  }

  // Format time in HH:MM:SS or MM:SS format
  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  // Calculate timers based on known restock intervals
  calculateTimers() {
    try {
      const now = Date.now();
      
      this.restockTimes = {};
      
      Object.entries(this.intervals).forEach(([key, intervalMinutes]) => {
        const intervalMs = intervalMinutes * 60 * 1000;
        const timeSinceEpoch = now;
        const timeIntoCurrentInterval = timeSinceEpoch % intervalMs;
        const nextRestockTime = now + (intervalMs - timeIntoCurrentInterval);
        const remaining = Math.max(0, Math.floor((nextRestockTime - now) / 1000));
        
        this.restockTimes[key] = {
          restockTime: nextRestockTime,
          remaining: remaining
        };
      });
      
    } catch (error) {
      console.error('Error calculating timers:', error);
    }
  }

  // Get timer data for a specific category
  getTimerData(category) {
    return this.restockTimes[category] || null;
  }

  // Get all timer data
  getAllTimerData() {
    return this.restockTimes;
  }

  // Update timer display elements
  updateTimerDisplay(timerElements, timerContainers, timerMapping) {
    const now = Date.now();
    
    Object.entries(timerMapping).forEach(([elementKey, apiKey]) => {
      const element = timerElements[elementKey];
      const container = timerContainers[elementKey];
      
      if (element && container && this.restockTimes[apiKey]) {
        const timerData = this.restockTimes[apiKey];
        const remaining = Math.max(0, Math.floor((timerData.restockTime - now) / 1000));
        const isExpired = remaining <= 0;

        element.textContent = isExpired ? 'Restocked!' : this.formatTime(remaining);
        element.className = isExpired ? 'timer-time expired' : 'timer-time';
        container.className = isExpired ? 'timer expired' : 'timer';

        // Auto-refresh stock when timer expires
        if (isExpired && element.dataset.expired !== 'true') {
          element.dataset.expired = 'true';
          console.log(`⏰ ${apiKey} expired, triggering callback...`);
          
          // Call the callback if it exists
          if (this.onTimerExpired) {
            this.onTimerExpired(apiKey);
          }
        } else if (!isExpired) {
          element.dataset.expired = '';
        }
      }
    });
  }

  // Start timer updates
  startTimerUpdates(timerElements, timerContainers, timerMapping, updateInterval = 1000) {
    this.calculateTimers();
    
    this.timerUpdateInterval = setInterval(() => {
      this.updateTimerDisplay(timerElements, timerContainers, timerMapping);
      
      // Recalculate timers every 60 seconds to handle any drift
      if (Date.now() % 60000 < 1000) {
        this.calculateTimers();
      }
    }, updateInterval);
  }

  // Stop timer updates
  stopTimerUpdates() {
    if (this.timerUpdateInterval) {
      clearInterval(this.timerUpdateInterval);
      this.timerUpdateInterval = null;
    }
  }

  // Set callback for when timer expires
  setTimerExpiredCallback(callback) {
    this.onTimerExpired = callback;
  }

  // Get time remaining for a specific timer
  getTimeRemaining(category) {
    const timerData = this.restockTimes[category];
    if (!timerData) return null;
    
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((timerData.restockTime - now) / 1000));
    return remaining;
  }

  // Check if a timer is expired
  isTimerExpired(category) {
    const remaining = this.getTimeRemaining(category);
    return remaining !== null && remaining <= 0;
  }

  // Get next restock time for a category
  getNextRestockTime(category) {
    const timerData = this.restockTimes[category];
    return timerData ? new Date(timerData.restockTime) : null;
  }

  // Get all timer status
  getTimerStatus() {
    const status = {};
    Object.keys(this.intervals).forEach(category => {
      const remaining = this.getTimeRemaining(category);
      const isExpired = this.isTimerExpired(category);
      const nextRestock = this.getNextRestockTime(category);
      
      status[category] = {
        remaining: remaining,
        isExpired: isExpired,
        nextRestock: nextRestock,
        formattedTime: remaining !== null ? this.formatTime(remaining) : '--:--'
      };
    });
    
    return status;
  }
}