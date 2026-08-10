import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBblKzSnl4XD7afgjqXETtVEhZyADn4-3s",
  authDomain: "strikeyard-f899a.firebaseapp.com",
  projectId: "strikeyard-f899a",
  storageBucket: "strikeyard-f899a.firebasestorage.app",
  messagingSenderId: "1082771535554",
  appId: "1:1082771535554:web:126641e4b75a8f42926d5b",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
