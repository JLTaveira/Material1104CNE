/* Firebase configuration and initialization
 src/firebase.js
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBTpU6Kf3n6WBfbLw7M07jGvFqszDNRrA0",
  authDomain: "material1104cne-8f38e.firebaseapp.com",
  projectId: "material1104cne-8f38e",
  storageBucket: "material1104cne-8f38e.firebasestorage.app",
  messagingSenderId: "24049427144",
  appId: "1:24049427144:web:7e648eaaaeb326f98e7bfd",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
// export const storage = getStorage(app);

