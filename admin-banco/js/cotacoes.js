firebase.auth().onAuthStateChanged(async user => {
  if (!user) {
    alert("Você precisa estar logado para acessar essa página.");
    window.location.href = "/gerentes-login.html";
    return;
  }

  window.usuarioLogado = user;
  carregarEmpresas(user);
  carregarCotacoes(user.uid);
});

async function carregarEmpresas(user) {
  const empresaSelect = document.getElementById("empresa");
  empresaSelect.innerHTML = "<option value=''>Selecione a empresa</option>";

  try {
    const snapshot = await firebase.firestore()
      .collection("empresas")
      .where("agencia", "==", "3495") // ajuste se quiser filtrar por agência
      .get();

    snapshot.forEach(doc => {
      const data = doc.data();
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = data.nome || "Empresa sem nome";
      option.dataset.cnpj = data.cnpj || "";
      option.dataset.rmId = data.rmId || "";
      empresaSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Erro ao carregar empresas:", error);
  }
}

window.preencherEmpresa = () => {
  const select = document.getElementById("empresa");
  const cnpj = select.options[select.selectedIndex].dataset.cnpj;
  const rmId = select.options[select.selectedIndex].dataset.rmId;

  document.getElementById("info-cnpj").textContent = cnpj ? `CNPJ: ${cnpj}` : "";
  document.getElementById("info-rm").textContent = rmId ? `RM: ${rmId}` : "";
};

window.enviarCotacao = async () => {
  const empresaId = document.getElementById("empresa").value;
  const empresaSelect = document.getElementById("empresa");
  const nomeEmpresa = empresaSelect.options[empresaSelect.selectedIndex]?.textContent || "";
  const cnpj = empresaSelect.options[empresaSelect.selectedIndex]?.dataset?.cnpj || "";
  const rmId = empresaSelect.options[empresaSelect.selectedIndex]?.dataset?.rmId || "";

  const ramo = document.getElementById("ramo").value;
  const valorEstimado = parseFloat(document.getElementById("valorEstimado").value || 0);
  const observacoes = document.getElementById("observacoes").value.trim();

  if (!empresaId || !ramo || !valorEstimado) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const cotacao = {
    empresaId,
    nomeEmpresa,
    cnpj,
    rmId,
    ramo,
    valorEstimado,
    observacoes,
    status: "Negócio iniciado",
    criadoPorUid: window.usuarioLogado.uid,
    autorUid: rmId || null,
    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
    historico: [{
      texto: "Negócio iniciado",
      criadoPorUid: window.usuarioLogado.uid,
      data: firebase.firestore.FieldValue.serverTimestamp()
    }]
  };

  try {
    await firebase.firestore().collection("cotacoes").add(cotacao);
    alert("Cotação criada com sucesso!");
    document.getElementById("ramo").value = "";
    document.getElementById("valorEstimado").value = "";
    document.getElementById("observacoes").value = "";
    carregarCotacoes(window.usuarioLogado.uid);
  } catch (error) {
    console.error("Erro ao enviar cotação:", error);
    alert("Erro ao criar cotação.");
  }
};

async function carregarCotacoes(uid) {
  const container = document.getElementById("listaCotacoes");
  container.innerHTML = "Carregando...";

  try {
    const snapshot = await firebase.firestore()
      .collection("cotacoes")
      .where("criadoPorUid", "==", uid)
      .orderBy("dataCriacao", "desc")
      .get();

    if (snapshot.empty) {
      container.innerHTML = "<p>Nenhuma cotação cadastrada ainda.</p>";
      return;
    }

    let html = "<ul>";
    snapshot.forEach(doc => {
      const c = doc.data();
      html += `<li><strong>${c.nomeEmpresa}</strong> - ${c.ramo} - R$ ${c.valorEstimado?.toLocaleString("pt-BR")} (${c.status})</li>`;
    });
    html += "</ul>";
    container.innerHTML = html;
  } catch (error) {
    console.error("Erro ao carregar cotações:", error);
    container.innerHTML = "<p>Erro ao carregar cotações.</p>";
  }
}
