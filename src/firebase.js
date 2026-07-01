import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAL8LF_lqZ1DSo_oce2ymQqOdCiV2jeHhw",
  authDomain: "myclockapp-55ef9.firebaseapp.com",
  projectId: "myclockapp-55ef9",
  storageBucket: "myclockapp-55ef9.firebasestorage.app",
  messagingSenderId: "524306534259",
  appId: "1:524306534259:web:e34414f762815b6d1f3f06",
  measurementId: "G-1FYVX7GZWL"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// השורות שחסרות וגורמות לשגיאה - מייצאים את השירותים החוצה ל-App.jsx
export const db = getFirestore(app);
export const auth = getAuth(app);