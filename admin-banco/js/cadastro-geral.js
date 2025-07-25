firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(user => {
  if (!user || user.email !== "patrick@retornoseguros.com.br") {
    window.location.href = "login.html";
  } else {
    listarUsuarios();
  }
});

function cadastrarUsuario() {
  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();
  const perfil = document.getElementById("perfil").value;
  const agenciaId = document.getElementById("agenciaId").value.trim();

  if (!nome || !email || !senha || !perfil || !agenciaId) {
    return alert("Preencha todos os campos.");
  }

  auth.createUserWithEmailAndPassword(email, senha)
    .then(cred => {
      const uid = cred.user.uid;
      return db.collection("usuarios_banco").doc(uid).set({
        nome, email, perfil, agenciaId, ativo: true, gerenteChefeId: ""
      });
    })
    .then(() => {
      alert("Usuário criado com sucesso!");
      document.getElementById("nome").value = "";
      document.getElementById("email").value = "";
      document.getElementById("senha").value = "";
      document.getElementById("agenciaId").value = "";
      listarUsuarios();
    })
    .catch(err => {
      console.error("Erro:", err);
      alert("Erro ao cadastrar: " + err.message);
    });
}

function listarUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  lista.innerHTML = "Carregando...";

  db.collection("usuarios_banco").orderBy("nome").get()
    .then(snapshot => {
      lista.innerHTML = "";
      snapshot.forEach(doc => {
        const u = doc.data();
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${u.nome}</td>
          <td>${u.email}</td>
          <td>${u.perfil}</td>
          <td>${u.agenciaId || "-"}</td>
        `;
        lista.appendChild(tr);
      });
    });
}
