// Placeholder Firebase Configuration
// Replace with your actual Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyCDXShsr2vA1qJHRI6zRSZl38_H4Zm_pas",
    authDomain: "lpoi-df948.firebaseapp.com",
    databaseURL: "https://lpoi-df948-default-rtdb.firebaseio.com",
    projectId: "lpoi-df948",
    storageBucket: "lpoi-df948.firebasestorage.app",
    messagingSenderId: "102244351520",
    appId: "1:102244351520:web:69aab7e42538da4f590645",
    measurementId: "G-F4C30HF3C6"
};

// Export based on environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = firebaseConfig;
} else {
    window.firebaseConfig = firebaseConfig;
}
