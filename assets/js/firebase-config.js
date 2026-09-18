import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ============================================================
// إعدادات Firebase لمشروع "Poper"
// ⚠️ لا تشارك هذه المفاتيح علناً
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyALtWWE7LMM-AY2_7OWr4Tuw_bp0_y1v8",
  authDomain: "poper-c38ba.firebaseapp.com",
  projectId: "poper-c38ba",
  storageBucket: "poper-c38ba.firebasestorage.app",
  messagingSenderId: "107824321178",
  appId: "1:107824321178:web:b2a7ab5d494fa393894523"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
