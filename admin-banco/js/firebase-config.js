// firebase-config.js (Firebase 8 - namespace global)
const firebaseConfig = {
  apiKey: "AIzaSyDlbEZfA_uAR1aoPZIr8T9B6KNcrwfMxm0",
  authDomain: "retorno-seguros.firebaseapp.com",
  projectId: "retorno-seguros",
  storageBucket: "retorno-seguros.appspot.com",
  messagingSenderId: "495712392972",
  appId: "1:495712392972:web:e1e78aedc48bdeea48db29",
  measurementId: "G-C6E44WXLPW"
};

// ✅ Essa linha é essencial e segura — só roda uma vez
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
