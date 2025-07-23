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
          // Redireciona após validação
          window.location.href = "gerentes.html";
        }
      }).catch(error => {
        console.error("Erro ao buscar gerente:", error);
        erroLogin.textContent = "Erro de verificação no sistema.";
      });

    })
    .catch(error => {
      console.error("Erro no login:", error);
      erroLogin.textContent = "E-mail ou senha inválidos.";
    });
}
