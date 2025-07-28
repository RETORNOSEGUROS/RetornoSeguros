firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

function salvarEmpresa() {
  const nome = document.getElementById("nome").value.trim();
  const cnpj = document.getElementById("cnpj").value.trim();
  const cidade = document.getElementById("cidade").value.trim();
  const estado = document.getElementById("estado").value.trim();
  const agencia = document.getElementById("agencia").value.trim();
  const rm = document.getElementById("rm").value.trim();

  if (!nome || !cidade || !estado || !agencia || !rm) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  auth.onAuthStateChanged(user => {
    if (!user) return alert("Usuário não autenticado.");

    const dados = {
      nome,
      cnpj,
      cidade,
      estado,
      agencia,
      rm,
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
