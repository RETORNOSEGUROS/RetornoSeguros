firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) {
    alert("Você precisa estar logado para acessar essa página.");
    window.location.href = "../gerentes-login.html";
    return;
  }

  const selectEmpresa = document.getElementById("empresa");
  const infoCNPJ = document.getElementById("info-cnpj");
  const infoRM = document.getElementById("info-rm");

  let empresasMap = {}; // usado depois na função preencherEmpresa()

  // Carregar empresas
  const snapshot = await firebase.firestore()
    .collection("empresas")
    .where("agencia", "==", "3495") // ajuste conforme sua lógica
    .get();

  selectEmpresa.innerHTML = '<option value="">Selecione a empresa</option>';
  snapshot.forEach(doc => {
    const dados = doc.data();
    empresasMap[doc.id] = dados;
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = dados.nome;
    selectEmpresa.appendChild(opt);
  });

  window.preencherEmpresa = function() {
    const empresaSelecionada = empresasMap[selectEmpresa.value];
    if (empresaSelecionada) {
      infoCNPJ.innerText = `CNPJ: ${empresaSelecionada.cnpj || "Não informado"}`;
      infoRM.innerText = `RM responsável: ${empresaSelecionada.rm || "Não informado"}`;
    } else {
      infoCNPJ.innerText = "";
      infoRM.innerText = "";
    }
  };

  // Função para criar cotação
  window.enviarCotacao = async function () {
    const empresaId = document.getElementById("empresa").value;
    const empresaNome = empresasMap[empresaId]?.nome || "";
    const ramo = document.getElementById("ramo").value;
    const valorEstimado = parseFloat(document.getElementById("valorEstimado").value);
    const observacoes = document.getElementById("observacoes").value;

    if (!empresaId || !ramo || !valorEstimado) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    const cotacao = {
      empresaId,
      empresaNome,
      ramo,
      valor: valorEstimado,
      observacoes,
      autorUid: user.uid,
      autorNome: user.displayName || "Sem nome",
      dataCriacao: new Date(),
      status: "Negócio iniciado"
    };

    try {
      await firebase.firestore().collection("cotacoes-gerentes").add(cotacao);
      alert("Cotação criada com sucesso!");
      document.getElementById("empresa").value = "";
      document.getElementById("ramo").value = "";
      document.getElementById("valorEstimado").value = "";
      document.getElementById("observacoes").value = "";
      infoCNPJ.innerText = "";
      infoRM.innerText = "";
      carregarCotacoes(); // atualiza lista
    } catch (erro) {
      console.error("Erro ao criar cotação:", erro);
      alert("Erro ao criar cotação. Tente novamente.");
    }
  };

  // Função para listar cotações
  async function carregarCotacoes() {
    const lista = document.getElementById("listaCotacoes");
    lista.innerHTML = "Carregando...";

    const snap = await firebase.firestore()
      .collection("cotacoes-gerentes")
      .where("autorUid", "==", user.uid)
      .orderBy("dataCriacao", "desc")
      .get();

    if (snap.empty) {
      lista.innerHTML = "<p>Nenhuma cotação criada ainda.</p>";
      return;
    }

    let html = "<ul>";
    snap.forEach(doc => {
      const dados = doc.data();
      html += `<li><strong>${dados.empresaNome}</strong> - ${dados.ramo} - R$ ${dados.valor.toLocaleString('pt-BR')}<br>Status: ${dados.status}</li><hr>`;
    });
    html += "</ul>";
    lista.innerHTML = html;
  }

  // Carrega inicialmente
  carregarCotacoes();
});
