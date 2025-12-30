import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD9iANgGXG8sfryA5qwVacmscyyNLCHlok",
  authDomain: "for-mae.firebaseapp.com",
  databaseURL: "https://for-mae-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "for-mae",
  storageBucket: "for-mae.firebasestorage.app",
  messagingSenderId: "391845822528",
  appId: "1:391845822528:web:da9842ed1038666cfd5fa5",
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database, firebaseConfig, ref, set };
