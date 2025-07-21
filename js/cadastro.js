// cadastro.js atualizado para integrar corretamente Authentication + Firestore + Indique e Ganhe

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Função auxiliar para obter o parâmetro da URL
function getParamFromUrl(nome) {
  const url = new URL(window.location.href);
  return url.searchParams.get(nome);
}

document.getElementById("cadastro-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const nome = document.getElementById("nome").value;
  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;
  const cidade = document.getElementById("cidade").value;
  const estado = document.getElementById("estado").value;
  const telefone = document.getElementById("telefone").value;
  const usuarioUnico = email.split("@")[0];
  const dataCadastro = new Date();
  const indicadorId = getParamFromUrl("indicador") || "";

  try {
    // Cria o usuário na autenticação
    const userCredential = await auth.createUserWithEmailAndPassword(email, senha);
    const uid = userCredential.user.uid;

    // Cria o documento do usuário no Firestore
    await db.collection("usuarios").doc(uid).set({
      nome,
      email,
      cidade,
      estado,
      telefone,
      usuarioUnico,
      isCliente: true,
      dataCadastro,
      pontos: 30,
      usuarioIndicadorId: indicadorId
    });

    // Se houver um indicador, atualizar pontos e contador dele
    if (indicadorId !== "") {
      const indicadorRef = db.collection("usuarios").doc(indicadorId);

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(indicadorRef);
        if (!doc.exists) return;

        const dados = doc.data();
        const pontos = dados.pontos || 0;
        const indicacoes = dados.indicacoes || 0;

        transaction.update(indicadorRef, {
          pontos: pontos + 10,
          indicacoes: indicacoes + 1
        });
      });
    }

    alert("Cadastro realizado com sucesso!");
    window.location.href = "/usuarios/painel.html";
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      alert("Esse e-mail já está cadastrado. Tente fazer login.");
    } else {
      console.error(error);
      alert("Erro ao cadastrar: " + error.message);
    }
  }
});
