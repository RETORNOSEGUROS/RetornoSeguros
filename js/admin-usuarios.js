// js/admin-usuarios.js

(async () => {
  const db = firebase.firestore();
  const container = document.getElementById("conteudo-pagina");

  container.innerHTML = `
    <h2>👥 Gestão de Usuários</h2>
    <input type="text" id="buscaUsuario" placeholder="🔍 Buscar por nome ou email" style="width: 100%; padding: 10px; margin-bottom: 20px; border-radius: 6px; border: 1px solid #ccc;" />

    <div id="listaUsuarios">Carregando usuários...</div>
  `;

  const renderizarUsuarios = async (filtroTexto = "") => {
    const snapshot = await db.collection("usuarios").orderBy("nome").get();
    const lista = document.getElementById("listaUsuarios");
    lista.innerHTML = "";

    snapshot.forEach((doc) => {
      const user = doc.data();
      const id = doc.id;
      const nome = user.nome || "Sem nome";
      const email = user.email || "";
      const telefone = user.telefone || "";
      const cidade = user.cidade || "";
      const estado = user.estado || "";
      const perfil = user.perfil || "cliente";
      const pontos = user.pontos || 0;

      const textoBusca = `${nome} ${email}`.toLowerCase();
      if (textoBusca.includes(filtroTexto.toLowerCase())) {
        lista.innerHTML += `
          <div style="background: #fff; border-radius: 6px; padding: 10px 15px; margin-bottom: 10px; box-shadow: 0 0 5px rgba(0,0,0,0.08);">
            <strong>${nome}</strong> (${perfil})<br/>
            📧 ${email} | 📞 ${telefone}<br/>
            📍 ${cidade} - ${estado}<br/>
            ⭐ Pontos: <b>${pontos}</b><br/>
            <button onclick="editarUsuario('${id}')" style="margin-top: 5px;">Editar</button>
          </div>
        `;
      }
    });
  };

  // Busca em tempo real
  document.getElementById("buscaUsuario").addEventListener("input", (e) => {
    renderizarUsuarios(e.target.value);
  });

  // Render inicial
  renderizarUsuarios();
})();

// Função de edição (pode ser expandida para popup futuramente)
async function editarUsuario(userId) {
  const db = firebase.firestore();
  const doc = await db.collection("usuarios").doc(userId).get();
  if (!doc.exists) return alert("Usuário não encontrado.");

  const dados = doc.data();
  const novoNome = prompt("Nome:", dados.nome || "");
  const novoEmail = prompt("Email:", dados.email || "");
  const novoTelefone = prompt("Telefone:", dados.telefone || "");
  const novaCidade = prompt("Cidade:", dados.cidade || "");
  const novoEstado = prompt("Estado:", dados.estado || "");
  const novoPerfil = prompt("Perfil (cliente, admin, gerente):", dados.perfil || "cliente");

  if (novoNome && novoEmail) {
    await db.collection("usuarios").doc(userId).update({
      nome: novoNome,
      email: novoEmail,
      telefone: novoTelefone,
      cidade: novaCidade,
      estado: novoEstado,
      perfil: novoPerfil
    });
    alert("Dados atualizados.");
    location.reload();
  }
}
