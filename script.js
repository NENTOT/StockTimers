let timers = {};

function continueTimer(elementId, endTime, minutes) {
  if (timers[elementId]) clearInterval(timers[elementId]);

  const display = document.getElementById(elementId);
  
  if (!display) {
    console.warn(`Element with id '${elementId}' not found`);
    return;
  }

  function updateTimer() {
    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));

    let hours = Math.floor(remaining / 3600);
    let mins = Math.floor((remaining % 3600) / 60);
    let secs = remaining % 60;

    display.textContent =
      hours > 0
        ? `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (remaining <= 0) {
      // Auto-restart the timer immediately
      clearInterval(timers[elementId]);
      const newEndTime = Date.now() + minutes * 60 * 1000;
      const timerData = { endTime: newEndTime, minutes };
      const timerKey = `timer_${elementId}`;
      
      // Store data in localStorage
      localStorage.setItem(timerKey, JSON.stringify(timerData));
      
      // Start new timer immediately
      continueTimer(elementId, newEndTime, minutes);
    }
  }

  updateTimer();
  timers[elementId] = setInterval(updateTimer, 1000);
}

function startTimer(elementId, minutes) {
  if (timers[elementId]) clearInterval(timers[elementId]);

  const now = Date.now();
  const timerKey = `timer_${elementId}`;
  const saved = localStorage.getItem(timerKey);
  let endTime;

  if (saved) {
    try {
      const data = JSON.parse(saved);
      endTime = data.endTime;
      
      // If the saved timer already expired, restart it immediately
      if (now >= endTime) {
        endTime = now + minutes * 60 * 1000;
        localStorage.setItem(timerKey, JSON.stringify({ endTime, minutes }));
      }
    } catch (e) {
      // If parsing fails, create new timer
      endTime = now + minutes * 60 * 1000;
      localStorage.setItem(timerKey, JSON.stringify({ endTime, minutes }));
    }
  } else {
    endTime = now + minutes * 60 * 1000;
    localStorage.setItem(timerKey, JSON.stringify({ endTime, minutes }));
  }

  const display = document.getElementById(elementId);
  
  if (!display) {
    console.warn(`Element with id '${elementId}' not found`);
    return;
  }

  function updateTimer() {
    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));

    let hours = Math.floor(remaining / 3600);
    let mins = Math.floor((remaining % 3600) / 60);
    let secs = remaining % 60;

    display.textContent =
      hours > 0
        ? `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (remaining <= 0) {
      // Auto-restart the timer immediately
      clearInterval(timers[elementId]);
      const newEndTime = Date.now() + minutes * 60 * 1000;
      localStorage.setItem(timerKey, JSON.stringify({ endTime: newEndTime, minutes }));
      
      // Start new timer immediately
      continueTimer(elementId, newEndTime, minutes);
    }
  }

  updateTimer();
  timers[elementId] = setInterval(updateTimer, 1000);
}

function resetTimer(elementId, minutes) {
  if (timers[elementId]) clearInterval(timers[elementId]);
  const timerKey = `timer_${elementId}`;
  localStorage.removeItem(timerKey);
  startTimer(elementId, minutes);
}

function checkResetFromURL() {
  const params = new URLSearchParams(window.location.search);
  const resetTarget = params.get("reset");

  switch (resetTarget) {
    case "seed":
      resetTimer('seedTimer', 5);
      break;
    case "egg":
      resetTimer('eggTimer', 30);
      break;
    case "cosmetic":
      resetTimer('cosmeticTimer', 240);
      break;
  }
  
  // Clean up URL after processing reset
  if (resetTarget) {
    const url = new URL(window.location);
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', url);
  }
}

function initializeTimer(elementId, minutes) {
  const timerKey = `timer_${elementId}`;
  const saved = localStorage.getItem(timerKey);
  
  if (saved) {
    try {
      const data = JSON.parse(saved);
      const now = Date.now();
      
      // If timer still has time remaining, continue it
      if (now < data.endTime) {
        continueTimer(elementId, data.endTime, minutes);
      } else {
        // Timer expired, start a new one immediately
        startTimer(elementId, minutes);
      }
    } catch (e) {
      // If parsing fails, start new timer
      startTimer(elementId, minutes);
    }
  } else {
    // No saved timer, start new one
    startTimer(elementId, minutes);
  }
}

function initializeTimers() {
  // Only start timers that don't already exist in storage
  initializeTimer('seedTimer', 5);
  initializeTimer('eggTimer', 30);
  initializeTimer('cosmeticTimer', 240);
  
  checkResetFromURL();
}

function getDefaultMinutes(elementId) {
  const defaults = {
    'seedTimer': 5,
    'eggTimer': 30,
    'cosmeticTimer': 240
  };
  return defaults[elementId] || 5;
}

// Handle page visibility changes to sync timers when tab becomes active
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    // Re-sync all timers when page becomes visible
    Object.keys(timers).forEach(elementId => {
      const timerKey = `timer_${elementId}`;
      const saved = localStorage.getItem(timerKey);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          const now = Date.now();
          
          // If timer expired while tab was hidden, restart it
          if (now >= data.endTime) {
            const minutes = data.minutes || getDefaultMinutes(elementId);
            startTimer(elementId, minutes);
          }
        } catch (e) {
          console.warn(`Error syncing timer ${elementId}:`, e);
        }
      }
    });
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTimers);
} else {
  initializeTimers();
}

// Also initialize on window load as fallback
window.addEventListener('load', initializeTimers);

// Handle page unload to ensure data is saved
window.addEventListener('beforeunload', function() {
  // Clear intervals
  Object.values(timers).forEach(clearInterval);
});