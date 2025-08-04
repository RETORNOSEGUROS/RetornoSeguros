// js/vencimentos.js
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    carregarRMs();
    carregarVencimentos();
    document.getElementById("btnFiltrar").addEventListener("click", carregarVencimentos);
  } else {
    window.location.href = "./gerentes-login.html";
  }
});

function carregarRMs() {
  const selectRM = document.getElementById("filtroRM");
  selectRM.innerHTML = `<option value="Todos">Todos</option>`;

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
}

function carregarVencimentos() {
  const tabela = document.getElementById("tabelaVencimentos").getElementsByTagName("tbody")[0];
  tabela.innerHTML = `<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>`;

  const mesSelecionado = document.getElementById("filtroMes").value;
  const rmSelecionado = document.getElementById("filtroRM").value;
  const vencimentos = [];

  // VISITAS
  firebase.firestore().collection("visitas").get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresaNome || "-";
      const rm = data.rmNome || "-";
      const ramos = data.ramos || {};

      Object.keys(ramos).forEach(ramo => {
        const info = ramos[ramo];
        if (info && info.vencimento) {
          const partes = info.vencimento.split("/");
          const mes = partes[1];

          if ((mesSelecionado === "Todos" || parseInt(mes) === parseInt(mesSelecionado)) &&
              (rmSelecionado === "Todos" || rmSelecionado === rm)) {
            vencimentos.push({
              empresa,
              ramo: ramo.toUpperCase(),
              rm,
              valor: info.premio || 0,
              renovacao: info.vencimento,
              origem: "Mapeado em visita"
            });
          }
        }
      });
    });

    // NEGÓCIOS FECHADOS
    return firebase.firestore().collection("cotacoes-gerentes")
      .where("status", "==", "Negócio Emitido")
      .get();
  }).then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresa || "-";
      const rm = data.rmNome || "-";
      const ramo = data.ramo || "-";
      const renovacao = data.fimVigencia || "-";
      const valor = data.valorFinal || 0;

      if (renovacao && renovacao.includes("/")) {
        const partes = renovacao.split("/");
        const mes = partes[1];

        if ((mesSelecionado === "Todos" || parseInt(mes) === parseInt(mesSelecionado)) &&
            (rmSelecionado === "Todos" || rmSelecionado === rm)) {
          vencimentos.push({
            empresa,
            ramo,
            rm,
            valor,
            renovacao,
            origem: "Fechado conosco"
          });
        }
      }
    });

    exibirVencimentos(vencimentos);
  });
}

function exibirVencimentos(lista) {
  const tabela = document.getElementById("tabelaVencimentos").getElementsByTagName("tbody")[0];
  tabela.innerHTML = "";

  if (lista.length === 0) {
    tabela.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhum vencimento encontrado.</td></tr>`;
    return;
  }

  lista.sort((a, b) => a.renovacao.localeCompare(b.renovacao));

  lista.forEach(item => {
    const linha = tabela.insertRow();
    linha.insertCell(0).textContent = item.empresa;
    linha.insertCell(1).textContent = item.ramo;
    linha.insertCell(2).textContent = item.rm;
    linha.insertCell(3).textContent = formatarReais(item.valor);
    linha.insertCell(4).textContent = item.renovacao;
    linha.insertCell(5).textContent = item.origem;
  });
}

function formatarReais(valor) {
  const numero = parseFloat(valor);
  if (isNaN(numero)) return "R$ 0,00";
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
