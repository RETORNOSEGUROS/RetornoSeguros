firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

function login() {
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();
  const erroEl = document.getElementById("erro");

  auth.signInWithEmailAndPassword(email, senha)
    .then(cred => {
      const uid = cred.user.uid;
      return db.collection("usuarios_banco").doc(uid).get();
    })
    .then(doc => {
      if (!doc.exists) {
        throw new Error("Usuário não cadastrado no sistema bancário.");
      }

      const dados = doc.data();
      if (!dados.perfil) {
        throw new Error("Perfil não definido.");
      }

      // Redireciona para o painel principal
      window.location.href = "painel.html";
    })
    .catch(err => {
      console.error(err);
      erroEl.textContent = err.message;
    });
}
