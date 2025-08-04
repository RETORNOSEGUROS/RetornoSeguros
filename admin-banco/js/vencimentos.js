firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  const selectRM = document.getElementById("filtroRM");

  // Preencher dropdown de RMs
  firebase.firestore().collection("gerentes").get().then(snapshot => {
    snapshot.forEach(doc => {
      const gerente = doc.data();
      if (gerente.nome) {
        const option = document.createElement("option");
        option.value = gerente.nome;
        option.textContent = gerente.nome;
        selectRM.appendChild(option);
      }
    });
  });

  const tabela = document.getElementById("tabelaVencimentos");

  function formatarReais(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarData(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}`;
  }

  async function buscarDados() {
    const dataInicialInput = document.getElementById("filtroDataInicial").value;
    const dataFinalInput = document.getElementById("filtroDataFinal").value;
    const rmSelecionado = selectRM.value;

    const [diaI, mesI] = dataInicialInput.split('/');
    const [diaF, mesF] = dataFinalInput.split('/');

    const dataInicial = new Date(2025, parseInt(mesI) - 1, parseInt(diaI));
    const dataFinal = new Date(2025, parseInt(mesF) - 1, parseInt(diaF));
    dataFinal.setHours(23, 59, 59);

    tabela.innerHTML = `<tr><td colspan="6">Carregando...</td></tr>`;

    const dados = [];

    // VISITAS
    const visitas = await firebase.firestore().collection("visitas").get();
    visitas.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresaNome || "-";
      const rm = data.rmNome || "-";
      const ramos = data.ramos || {};

      for (const [ramo, info] of Object.entries(ramos)) {
        const vencimento = info.vencimento;
        if (!vencimento) continue;

        const [dia, mes] = vencimento.split('/');
        const dataRenovacao = new Date(2025, parseInt(mes) - 1, parseInt(dia));

        if (dataRenovacao >= dataInicial && dataRenovacao <= dataFinal) {
          if (rmSelecionado === "Todos" || rmSelecionado === rm) {
            dados.push({
              empresa,
              ramo: ramo.toUpperCase(),
              rm,
              valor: info.valor ? Number(info.valor) : 0,
              dataRenovacao,
              origem: "Mapeado em visita"
            });
          }
        }
      }
    });

    // COTAÇÕES EMITIDAS
    const cotacoes = await firebase.firestore().collection("cotacoes-gerentes")
      .where("status", "==", "Negócio Emitido").get();

    cotacoes.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresa || "-";
      const ramo = data.ramo || "-";
      const rm = data.rmNome || "-";
      const fim = data.fimVigencia;

      const valor = Number(data.valorFinal || 0);

      if (fim) {
        const dataRenovacao = new Date(fim);
        if (dataRenovacao >= dataInicial && dataRenovacao <= dataFinal) {
          if (rmSelecionado === "Todos" || rmSelecionado === rm) {
            dados.push({
              empresa,
              ramo,
              rm,
              valor,
              dataRenovacao,
              origem: "Fechado conosco"
            });
          }
        }
      }
    });

    if (dados.length === 0) {
      tabela.innerHTML = `<tr><td colspan="6">Nenhum dado encontrado.</td></tr>`;
      return;
    }

    dados.sort((a, b) => a.dataRenovacao - b.dataRenovacao);

    tabela.innerHTML = "";

    dados.forEach(item => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.empresa}</td>
        <td>${item.ramo}</td>
        <td>${item.rm}</td>
        <td>${formatarReais(item.valor)}</td>
        <td>${formatarData(item.dataRenovacao)}</td>
        <td>${item.origem}</td>
      `;
      tabela.appendChild(tr);
    });
  }

  document.getElementById("btnFiltrar").addEventListener("click", buscarDados);

  function definirDatasPadrao() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    const pad = n => String(n).padStart(2, '0');
    document.getElementById("filtroDataInicial").value = `${pad(primeiroDia.getDate())}/${pad(primeiroDia.getMonth() + 1)}`;
    document.getElementById("filtroDataFinal").value = `${pad(ultimoDia.getDate())}/${pad(ultimoDia.getMonth() + 1)}`;
  }

  definirDatasPadrao();
  buscarDados();
});
