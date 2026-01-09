// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Your web app's Firebase configuration
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged };
