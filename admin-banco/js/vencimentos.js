console.log("🚀 Script carregado");

firebase.auth().onAuthStateChanged(user => {
  console.log("🔐 Firebase Auth detectado");

  if (user) {
    console.log("✅ Usuário logado:", user.email);
    carregarRMs();
    carregarVencimentos();
    document.getElementById("btnFiltrar").addEventListener("click", carregarVencimentos);
  } else {
    console.warn("⚠️ Usuário não autenticado. Redirecionando...");
    window.location.href = "./gerentes-login.html";
  }
});

function carregarRMs() {
  console.log("📥 Carregando RMs...");
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
    console.log("✅ RMs carregados.");
  }).catch(err => {
    console.error("❌ Erro ao carregar RMs:", err);
  });
}

function carregarVencimentos() {
  console.log("📊 Iniciando carregamento de vencimentos...");

  const tabela = document.getElementById("tabelaVencimentos").getElementsByTagName("tbody")[0];
  tabela.innerHTML = `<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>`;

  const dataInicio = document.getElementById("dataInicio").value.trim();
  const dataFim = document.getElementById("dataFim").value.trim();
  const rmSelecionado = document.getElementById("filtroRM").value;
  const vencimentos = [];

  if (!validarData(dataInicio) || !validarData(dataFim)) {
    tabela.innerHTML = `<tr><td colspan="6" style="text-align:center;">Informe datas válidas (dd/mm).</td></tr>`;
    return;
  }

  const inicio = dataParaNumero(dataInicio);
  const fim = dataParaNumero(dataFim);

  firebase.firestore().collection("visitas").get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresaNome || "-";
      const rm = data.rmNome || "-";
      const ramos = data.ramos || {};

      Object.keys(ramos).forEach(ramo => {
        const info = ramos[ramo];
        if (info && info.vencimento && validarData(info.vencimento)) {
          const venc = dataParaNumero(info.vencimento);
          if ((inicio <= venc && venc <= fim) &&
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

    return firebase.firestore().collection("cotacoes-gerentes")
      .where("status", "==", "Negócio Emitido").get();
  }).then(snapshot => {
    console.log("📦 Cotações encontradas:", snapshot.size);

    snapshot.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresa || data.empresaNome || "-";
      const rm = data.rmNome || "-";
      const ramo = data.ramo || "-";
      const valor = data.valorFinal || 0;

      let fimVigenciaStr = "";

      if (data.fimVigencia) {
        if (typeof data.fimVigencia.toDate === "function") {
          const d = data.fimVigencia.toDate();
          fimVigenciaStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else if (typeof data.fimVigencia === "string") {
          if (data.fimVigencia.includes("/")) {
            const partes = data.fimVigencia.split("/");
            fimVigenciaStr = `${partes[0]}/${partes[1]}`;
          } else if (data.fimVigencia.includes("-")) {
            const partes = data.fimVigencia.split("-");
            fimVigenciaStr = `${partes[2]}/${partes[1]}`;
          }
        }
      }

      if (validarData(fimVigenciaStr)) {
        const venc = dataParaNumero(fimVigenciaStr);
        if ((inicio <= venc && venc <= fim) &&
            (rmSelecionado === "Todos" || rmSelecionado === rm)) {
          vencimentos.push({
            empresa,
            ramo,
            rm,
            valor,
            renovacao: fimVigenciaStr,
            origem: "Fechado conosco"
          });
        }
      }
    });

    exibirVencimentos(vencimentos);
  }).catch(erro => {
    console.error("❌ Erro ao carregar vencimentos:", erro);
  });
}

function dataParaNumero(data) {
  const [dia, mes] = data.split("/");
  return parseInt(dia.padStart(2, '0') + mes.padStart(2, '0'));
}

function validarData(data) {
  return /^\d{2}\/\d{2}$/.test(data);
}

function exibirVencimentos(lista) {
  const tabela = document.getElementById("tabelaVencimentos").getElementsByTagName("tbody")[0];
  tabela.innerHTML = "";

  if (lista.length === 0) {
    tabela.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhum vencimento encontrado.</td></tr>`;
    return;
  }

  lista.sort((a, b) => dataParaNumero(a.renovacao) - dataParaNumero(b.renovacao));

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
