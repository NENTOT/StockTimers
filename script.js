const API_BASE_URL = 'https://timerapi-lzn3.onrender.com';
const UPDATE_INTERVAL = 1000;

let updateInterval;
let isConnected = false;

const timerElements = {
  seedTimer: document.getElementById('seedTimer'),
  eggTimer: document.getElementById('eggTimer'),
  cosmeticTimer: document.getElementById('cosmeticTimer')
};

const statusElement = document.getElementById('status');
const resetButtons = {
  seedTimer: document.getElementById('seedResetBtn'),
  eggTimer: document.getElementById('eggResetBtn'),
  cosmeticTimer: document.getElementById('cosmeticResetBtn')
};

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else {
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

function updateStatus(connected) {
  isConnected = connected;
  if (connected) {
    statusElement.textContent = 'Connected to timer service';
    statusElement.className = 'status connected';
    Object.values(resetButtons).forEach(btn => btn.disabled = false);
  } else {
    statusElement.textContent = 'Disconnected from timer service - Retrying...';
    statusElement.className = 'status disconnected';
    Object.values(resetButtons).forEach(btn => btn.disabled = true);
    Object.values(timerElements).forEach(el => el.textContent = '--:--');
  }
}

async function fetchTimers() {
  try {
    const response = await fetch(`${API_BASE_URL}/timers`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const timers = await response.json();

    Object.entries(timers).forEach(([timerName, timerData]) => {
      const element = timerElements[timerName];
      if (element) {
        element.textContent = formatTime(timerData.remaining);
      }
    });

    if (!isConnected) updateStatus(true);
  } catch (error) {
    console.error('Error fetching timers:', error);
    if (isConnected) updateStatus(false);
  }
}

async function resetTimer(timerName) {
  try {
    const response = await fetch(`${API_BASE_URL}/timers/${timerName}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    console.log('Timer reset:', result);

    await fetchTimers();
  } catch (error) {
    console.error('Error resetting timer:', error);
    alert('Failed to reset timer. Please try again.');
  }
}

function checkResetFromURL() {
  const params = new URLSearchParams(window.location.search);
  const resetTarget = params.get("reset");

  const timerMap = {
    'seed': 'seedTimer',
    'egg': 'eggTimer',
    'cosmetic': 'cosmeticTimer'
  };

  if (resetTarget && timerMap[resetTarget]) {
    resetTimer(timerMap[resetTarget]);
  }

  if (resetTarget) {
    const url = new URL(window.location);
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', url);
  }
}

function startTimerUpdates() {
  fetchTimers();
  updateInterval = setInterval(fetchTimers, UPDATE_INTERVAL);
}

function stopTimerUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    stopTimerUpdates();
  } else {
    startTimerUpdates();
  }
});

window.addEventListener('beforeunload', function () {
  stopTimerUpdates();
});

function initialize() {
  updateStatus(false);
  startTimerUpdates();
  checkResetFromURL();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

window.addEventListener('load', initialize);
