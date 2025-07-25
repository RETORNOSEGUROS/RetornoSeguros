firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

function salvarEmpresa() {
  const nome = document.getElementById("nome").value.trim();
  const cnpj = document.getElementById("cnpj").value.trim();
  const cidade = document.getElementById("cidade").value.trim();
  const estado = document.getElementById("estado").value.trim();

  if (!nome) {
    alert("Informe o nome da empresa.");
    return;
  }

  auth.onAuthStateChanged(user => {
    if (!user) return alert("Usuário não autenticado.");

    const dados = {
      nome,
      cnpj,
      cidade,
      estado,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection("empresas").add(dados)
      .then(() => {
        alert("Empresa cadastrada com sucesso.");
        window.location.href = "empresas.html";
      })
      .catch(err => {
        console.error("Erro ao cadastrar empresa:", err);
        alert("Erro ao cadastrar empresa.");
      });
  });
}
