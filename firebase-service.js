// Firebase Service - Handles all Firebase operations
class FirebaseService {
  constructor() {
    this.db = null;
    this.firebaseApp = null;
    this.isConnected = false;
  }

  // Initialize Firebase connection
  async initialize() {
    try {
      this.firebaseApp = firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
      this.db = firebase.firestore();
      
      // Test connection
      await this.db.collection(CONFIG.FIREBASE_COLLECTIONS.STOCK_HISTORY).limit(1).get();
      
      this.isConnected = true;
      this.updateStatus('🔥 Firebase: Connected', 'firebase-connected');
      console.log('✅ Firebase initialized successfully');
      
      return true;
    } catch (error) {
      console.error('❌ Firebase initialization failed:', error);
      this.isConnected = false;
      this.updateStatus('🔥 Firebase: Connection failed', 'disconnected');
      return false;
    }
  }

  // Update Firebase connection status in UI
  updateStatus(message, statusClass) {
    const statusElement = document.getElementById('firebase-status');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = `status ${statusClass}`;
    }
  }

  // Save complete stock data to Firebase
  async saveStockData(stockData) {
    if (!this.isConnected || !this.db) {
      console.warn('Firebase not connected, skipping stock data save');
      return;
    }
    
    try {
      const docData = {
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        stockData: stockData,
        categories: {
          seeds: stockData.seedsStock || [],
          gear: stockData.gearStock || [],
          eggs: stockData.eggStock || [],
          cosmetics: stockData.cosmeticsStock || []
        }
      };

      await this.db.collection(CONFIG.FIREBASE_COLLECTIONS.STOCK_HISTORY).add(docData);
      console.log('✅ Stock data saved to Firebase');
    } catch (error) {
      console.error('❌ Error saving stock data to Firebase:', error);
    }
  }

  // Save stock changes to Firebase
  async saveStockChanges(changes) {
    if (!this.isConnected || !this.db || !changes || changes.length === 0) {
      console.warn('Firebase not connected or no changes to save');
      return;
    }
    
    try {
      const docData = {
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        changeType: 'stock_change',
        changes: changes,
        changeCount: changes.length
      };

      await this.db.collection(CONFIG.FIREBASE_COLLECTIONS.STOCK_CHANGES).add(docData);
      console.log('✅ Stock changes saved to Firebase:', changes.length, 'changes');
    } catch (error) {
      console.error('❌ Error saving stock changes to Firebase:', error);
    }
  }

  // Get stock change history from Firebase
  async getStockChangeHistory(limit = CONFIG.UI_CONFIG.HISTORY_LIMIT) {
    if (!this.isConnected || !this.db) {
      console.warn('Firebase not connected, returning empty history');
      return [];
    }
    
    try {
      const snapshot = await this.db.collection(CONFIG.FIREBASE_COLLECTIONS.STOCK_CHANGES)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const history = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        history.push({
          id: doc.id,
          timestamp: data.timestamp?.toDate() || new Date(),
          changes: data.changes || [],
          changeCount: data.changeCount || 0
        });
      });

      return history;
    } catch (error) {
      console.error('❌ Error fetching stock change history from Firebase:', error);
      return [];
    }
  }

  // Get complete stock history from Firebase
  async getStockHistory(limit = CONFIG.UI_CONFIG.HISTORY_LIMIT) {
    if (!this.isConnected || !this.db) {
      console.warn('Firebase not connected, returning empty history');
      return [];
    }
    
    try {
      const snapshot = await this.db.collection(CONFIG.FIREBASE_COLLECTIONS.STOCK_HISTORY)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const history = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        history.push({
          id: doc.id,
          timestamp: data.timestamp?.toDate() || new Date(),
          stockData: data.stockData || {},
          categories: data.categories || {}
        });
      });

      return history;
    } catch (error) {
      console.error('❌ Error fetching stock history from Firebase:', error);
      return [];
    }
  }

  // Clean up old records (optional maintenance function)
  async cleanupOldRecords(daysToKeep = 30) {
    if (!this.isConnected || !this.db) {
      console.warn('Firebase not connected, skipping cleanup');
      return;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const collections = [
        CONFIG.FIREBASE_COLLECTIONS.STOCK_HISTORY,
        CONFIG.FIREBASE_COLLECTIONS.STOCK_CHANGES
      ];

      for (const collectionName of collections) {
        const snapshot = await this.db.collection(collectionName)
          .where('timestamp', '<', cutoffDate)
          .get();

        const batch = this.db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });

        if (snapshot.docs.length > 0) {
          await batch.commit();
          console.log(`✅ Cleaned up ${snapshot.docs.length} old records from ${collectionName}`);
        }
      }
    } catch (error) {
      console.error('❌ Error cleaning up old records:', error);
    }
  }

  // Get connection status
  getConnectionStatus() {
    return this.isConnected;
  }
}

// Create and export Firebase service instance
const firebaseService = new FirebaseService();
window.firebaseService = firebaseService;