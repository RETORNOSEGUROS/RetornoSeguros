// js/admin-gerentes.js

(async () => {
  const db = firebase.firestore();
  const container = document.getElementById("conteudo-pagina");

  container.innerHTML = `
    <h2>🏢 Gerentes Cadastrados</h2>
    <div id="listaGerentes">Carregando gerentes...</div>
  `;

  const snap = await db.collection("gerentes").orderBy("nome").get();
  const lista = document.getElementById("listaGerentes");

  if (snap.empty) {
    lista.innerHTML = "<p>Nenhum gerente encontrado.</p>";
    return;
  }

  snap.forEach((doc) => {
    const gerente = doc.data();
    const id = doc.id;
    const nome = gerente.nome || "-";
    const email = gerente.email || "-";
    const tipo = gerente.tipo || "RM";
    const agencia = gerente.agencia || "-";

    lista.innerHTML += `
      <div style="background: #fff; padding: 12px 15px; margin-bottom: 10px; border-radius: 6px; box-shadow: 0 0 6px rgba(0,0,0,0.08);">
        <strong>${nome}</strong> (${tipo})<br/>
        📧 ${email} | 🏦 Agência: ${agencia}<br/>
        <button onclick="editarGerente('${id}')">Editar</button>
      </div>
    `;
  });
})();

// Edição simples via prompts
async function editarGerente(gerenteId) {
  const db = firebase.firestore();
  const doc = await db.collection("gerentes").doc(gerenteId).get();
  if (!doc.exists) return alert("Gerente não encontrado.");

  const g = doc.data();
  const novoNome = prompt("Nome:", g.nome || "");
  const novoEmail = prompt("Email:", g.email || "");
  const novoTipo = prompt("Tipo (chefe ou RM):", g.tipo || "RM");
  const novaAgencia = prompt("Agência:", g.agencia || "");

  if (novoNome && novoEmail) {
    await db.collection("gerentes").doc(gerenteId).update({
      nome: novoNome,
      email: novoEmail,
      tipo: novoTipo,
      agencia: novaAgencia
    });
    alert("Dados atualizados.");
    location.reload();
  }
}
