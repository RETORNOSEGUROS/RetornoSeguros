// Configuração Firebase - Retorno Seguros (Sistema de Gamificação)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDlbEZfA_uAR1aoPZIr8T9B6KNcrwfMxm0",
    authDomain: "retorno-seguros.firebaseapp.com",
    projectId: "retorno-seguros",
    storageBucket: "retorno-seguros.firebasestorage.app",
    messagingSenderId: "495712392972",
    appId: "1:495712392972:web:e1e78aedc48bdeea48db29",
    measurementId: "G-C6E44WXLPW"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
