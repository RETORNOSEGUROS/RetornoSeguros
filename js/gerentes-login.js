firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

function loginGerente() {
  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;
  const erroLogin = document.getElementById("erroLogin");

  auth.signInWithEmailAndPassword(email, senha)
    .then(userCredential => {
      const uid = userCredential.user.uid;
      db.collection("gerentes").doc(uid).get().then(doc => {
        if (!doc.exists || doc.data().ativo === false) {
          erroLogin.textContent = "Acesso não autorizado.";
          auth.signOut();
        } else {
          window.location.href = "gerentes.html"; // 🔄 AJUSTADO para o nome correto
        }
      });
    })
    .catch(error => {
      erroLogin.textContent = "E-mail ou senha inválidos.";
    });
}
