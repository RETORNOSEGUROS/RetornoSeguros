// /empresas/js/firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyDlbEZfA_uAR1aoPZIr8T9B6KNcrwfMxm0",
  authDomain: "retorno-seguros.firebaseapp.com",
  projectId: "retorno-seguros",
  storageBucket: "retorno-seguros.appspot.com",
  messagingSenderId: "495712392972",
  appId: "1:495712392972:web:e1e78aedc48bdeea48db29",
  measurementId: "G-C6E44WXLPW"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);

// Variáveis globais (usadas em login.js, admin.js, empresa.js)
const auth = firebase.auth();
const db   = firebase.firestore();

console.log("✅ Firebase carregado:", firebaseConfig.projectId);
