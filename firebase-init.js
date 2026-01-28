// firebase-init.js (Firebase v9+ modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// 🔁 PEGA AQUÍ TU CONFIG DE FIREBASE
export const firebaseConfig = {
  apiKey: "AIzaSyC4RinMEEGs0TlvU1SXn8EZ7Zy5liBrQEs",
  authDomain: "trss-66f69.firebaseapp.com",
  databaseURL: "https://trss-66f69-default-rtdb.firebaseio.com",
  projectId: "trss-66f69",
  storageBucket: "trss-66f69.firebasestorage.app",
  messagingSenderId: "33031063116",
  appId: "1:33031063116:web:abfa518ee28f34554996e9"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
