const db = firebase.firestore();

document.getElementById("form-cadastro").addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = document.getElementById("nome").value;
  const cpf = document.getElementById("cpf").value;
  const dataNascimento = document.getElementById("dataNascimento").value;
  const cidade = document.getElementById("cidade").value;
  const celular = document.getElementById("celular").value;
  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;

  const urlParams = new URLSearchParams(window.location.search);
  const indicadorId = urlParams.get("indicador") || null;

  try {
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, senha);
    const user = userCredential.user;

    await db.collection("usuarios").doc(user.uid).set({
      nome,
      cpf,
      dataNascimento,
      cidade,
      celular,
      email,
      indicadorId: indicadorId || "",
      creditos: 30,
      indicacoes: 0,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Se o usuário foi indicado, atualiza quem indicou
    if (indicadorId) {
      const indicadorRef = db.collection("usuarios").doc(indicadorId);

      await indicadorRef.update({
        creditos: firebase.firestore.FieldValue.increment(10),
        indicacoes: firebase.firestore.FieldValue.increment(1),
      }).catch(() => {
        // Caso o usuário que indicou ainda não esteja na coleção
        console.warn("Usuário indicador não encontrado.");
      });
    }

    alert("Cadastro realizado com sucesso!");
    window.location.href = "painel.html";

  } catch (error) {
    console.error("Erro no cadastro:", error);
    alert("Erro: " + error.message);
  }
});
