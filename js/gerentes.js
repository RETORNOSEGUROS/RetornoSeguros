// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Verifica login
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "gerentes-login.html";
    return;
  }

  const uid = user.uid;

  db.collection("gerentes").doc(uid).get().then(doc => {
    if (!doc.exists || doc.data().ativo === false) {
      alert("Acesso negado.");
      auth.signOut();
      return;
    }

    window.gerenteLogado = {
      id: uid,
      nome: doc.data().nome,
      cargo: doc.data().cargo || "gerente"
    };
    document.getElementById("tituloGerente").innerText =
      `Painel — ${doc.data().nome} (${doc.data().cargo})`;

    exibirSecao('visao');
  });
});

// Logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = "gerentes-login.html";
  });
}

// Troca de seção
function exibirSecao(secao) {
  const container = document.getElementById('conteudo');
  container.innerHTML = "<p>Carregando...</p>";

  switch (secao) {
    case 'visao': carregarIndicadores(); break;
    case 'cadastrar': exibirFormularioEmpresa(); break;
    case 'visita': exibirFormularioVisita(); break;
    case 'empresas': listarEmpresasDetalhadas(); break;
    case 'visitas-relatorio': listarVisitasDetalhadas(); break;
    case 'cadastrar-usuario': exibirFormularioCadastroUsuario(); break;
  }
}

// Indicadores
function carregarIndicadores() {
  const uid = window.gerenteLogado.id;
  const container = document.getElementById('conteudo');
  container.innerHTML = "<h3>Visão Geral</h3>";

  const colecoes = ["empresas", "visitas", "cotacoes", "seguros"];
  const textos = ["Empresas", "Visitas", "Cotações", "Seguros"];

  colecoes.forEach((col, i) => {
    const ref = db.collection(col).where("gerenteId", "==", uid);
    ref.get().then(snapshot => {
      const qtd = snapshot.size;
      const bloco = document.createElement("div");
      bloco.className = "card";
      bloco.innerHTML = `<h3>${textos[i]}</h3><p>Total: <strong>${qtd}</strong></p>`;
      container.appendChild(bloco);
    });
  });
}

// Formulário de empresa
function exibirFormularioEmpresa() {
  const container = document.getElementById('conteudo');
  container.innerHTML = `
    <h3>Cadastrar Empresa</h3>
    <form id="formEmpresa">
      <input placeholder="Nome Fantasia" id="nomeFantasia" required><br><br>
      <input placeholder="CNPJ" id="cnpj" required><br><br>
      <input placeholder="Cidade" id="cidade"><br><br>
      <input placeholder="Estado" id="estado"><br><br>
      <input placeholder="Ramo de Atividade" id="ramo"><br><br>
      <input placeholder="Qtd Funcionários" id="qtd" type="number"><br><br>
      <button type="submit">Salvar</button>
    </form>
  `;

  document.getElementById("formEmpresa").onsubmit = (e) => {
    e.preventDefault();
    const dados = {
      nomeFantasia: document.getElementById("nomeFantasia").value,
      cnpj: document.getElementById("cnpj").value,
      cidade: document.getElementById("cidade").value,
      estado: document.getElementById("estado").value,
      ramoAtividade: document.getElementById("ramo").value,
      qtdFuncionarios: parseInt(document.getElementById("qtd").value || 0),
      cadastradoPor: window.gerenteLogado.id,
      dataCadastro: new Date().toISOString()
    };
    db.collection("empresas").add(dados).then(() => {
      alert("Empresa cadastrada!");
      exibirSecao("empresas");
    });
  };
}

// NOVA FUNÇÃO DE VISITA
function exibirFormularioVisita() {
  const container = document.getElementById('conteudo');
  container.innerHTML = "<h3>Registrar Visita</h3><p>Carregando empresas...</p>";

  db.collection("empresas").where("cadastradoPor", "==", window.gerenteLogado.id).get().then(snapshot => {
    let html = `
      <form id="formVisita">
        <label>Empresa:</label><br>
        <select id="empresaId" required style="width:100%; padding:8px;">
          ${snapshot.docs.map(doc => `<option value="${doc.id}">${doc.data().nomeFantasia}</option>`).join('')}
        </select><br><br>

        <label>Data da Visita:</label><br>
        <input type="datetime-local" id="dataVisita" required style="width:100%; padding:8px;"><br><br>

        <label>Número Atualizado de Funcionários:</label><br>
        <input type="number" id="numeroFuncionarios" placeholder="Ex: 45" style="width:100%; padding:8px;"><br><br>

        <label><strong>Assuntos de Seguros Abordados:</strong></label><br>
        <div id="checklistSeguros" style="margin-left:10px;">
          <label><input type="checkbox" value="Plano de saúde empresarial"> Plano de saúde empresarial</label><br>
          <label><input type="checkbox" value="Plano dental empresarial"> Plano dental empresarial</label><br>
          <label><input type="checkbox" value="Seguro de vida em grupo"> Seguro de vida em grupo</label><br>
          <label><input type="checkbox" value="Seguro frotas"> Seguro frotas</label><br>
          <label><input type="checkbox" value="Seguro de bens"> Seguro de bens (máquinas, estrutura)</label><br>
          <label><input type="checkbox" value="Seguro responsabilidade civil / D&O"> Seguro responsabilidade civil / D&O</label><br>
          <label><input type="checkbox" value="Previdência empresarial"> Previdência empresarial</label><br>
        </div><br>

        <label>Comentário Plano de Saúde:</label><br>
        <textarea id="comentarioSaude" rows="2" style="width:100%;"></textarea><br><br>

        <label>Comentário Plano Dental:</label><br>
        <textarea id="comentarioDental" rows="2" style="width:100%;"></textarea><br><br>

        <label>Comentário Seguro de Vida:</label><br>
        <textarea id="comentarioVida" rows="2" style="width:100%;"></textarea><br><br>

        <label>Comentário Outros Seguros:</label><br>
        <textarea id="comentarioOutros" rows="2" style="width:100%;"></textarea><br><br>

        <label>Observações Gerais:</label><br>
        <textarea id="observacoes" rows="4" style="width:100%;"></textarea><
