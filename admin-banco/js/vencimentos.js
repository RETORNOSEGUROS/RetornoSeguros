function formatarData(data) {
  if (!data || !data.seconds) return '';
  const d = new Date(data.seconds * 1000);
  return `${('0' + d.getDate()).slice(-2)}/${('0' + (d.getMonth() + 1)).slice(-2)}`;
}

function formatarValor(valor) {
  if (!valor) return 'R$ 0,00';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function carregarRMs() {
  const filtroRm = document.getElementById("filtroRm");
  filtroRm.innerHTML = `<option value="todos">Todos</option>`;
  
  db.collection("usuarios").where("perfil", "==", "gerente").get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const opt = document.createElement("option");
      opt.value = data.nome;
      opt.textContent = data.nome;
      filtroRm.appendChild(opt);
    });
    console.log("✅ RMs carregados com sucesso");
  }).catch(error => {
    console.error("Erro ao carregar RMs:", error);
  });
}

function filtrarDados() {
  const dataInicioInput = document.getElementById("dataInicio").value.trim();
  const dataFimInput = document.getElementById("dataFim").value.trim();
  const filtroRm = document.getElementById("filtroRm").value;

  const tabela = document.getElementById("tabelaVencimentos");
  tabela.innerHTML = `<tr><td colspan="6" id="carregando">Carregando...</td></tr>`;

  const [diaInicio, mesInicio] = dataInicioInput.split("/");
  const [diaFim, mesFim] = dataFimInput.split("/");
  const dataInicio = { dia: parseInt(diaInicio), mes: parseInt(mesInicio) };
  const dataFim = { dia: parseInt(diaFim), mes: parseInt(mesFim) };

  console.log("🔍 Filtros aplicados:", { dataInicio, dataFim, filtroRm });

  const resultados = [];

  // 1. VISITAS
  db.collection("visitas").get().then(snapshot => {
    console.log("📋 Total de visitas:", snapshot.size);
    
    snapshot.forEach(doc => {
      const visita = doc.data();
      const empresa = visita.empresa || "";
      const rm = visita.rmNome || "";
      const ramos = visita.ramos || {};

      Object.entries(ramos).forEach(([ramoNome, dados]) => {
        if (dados.vencimento) {
          const [dia, mes] = dados.vencimento.split("/").map(Number);

          const dentroPeriodo = (
            (mes > dataInicio.mes || (mes === dataInicio.mes && dia >= dataInicio.dia)) &&
            (mes < dataFim.mes || (mes === dataFim.mes && dia <= dataFim.dia))
          );

          if (dentroPeriodo && (filtroRm === "todos" || filtroRm === rm)) {
            resultados.push({
              empresa,
              ramo: ramoNome,
              rm,
              valor: dados.premioAnual || 0,
              dataRenovacao: dados.vencimento,
              origem: "Mapeado em visita"
            });
          }
        }
      });
    });

    console.log("🟢 Visitados válidos:", resultados.length);

    // 2. COTAÇÕES GERADAS E FECHADAS
    return db.collection("cotacoes-gerentes")
      .where("status", "==", "Negócio Emitido").get();

  }).then(snapshot => {
    console.log("📦 Negócios emitidos:", snapshot.size);

    snapshot.forEach(doc => {
      const cotacao = doc.data();
      const data = cotacao.fimVigencia?.toDate();
      if (!data) return;

      const dia = data.getDate();
      const mes = data.getMonth() + 1;

      const dentroPeriodo = (
        (mes > dataInicio.mes || (mes === dataInicio.mes && dia >= dataInicio.dia)) &&
        (mes < dataFim.mes || (mes === dataFim.mes && dia <= dataFim.dia))
      );

      if (dentroPeriodo && (filtroRm === "todos" || filtroRm === cotacao.rmNome)) {
        resultados.push({
          empresa: cotacao.nomeEmpresa,
          ramo: cotacao.ramo,
          rm: cotacao.rmNome,
          valor: cotacao.valorFinal || 0,
          dataRenovacao: `${('0' + dia).slice(-2)}/${('0' + mes).slice(-2)}`,
          origem: "Fechado conosco"
        });
      }
    });

    console.log("🟢 Total geral de resultados:", resultados.length);

    if (resultados.length === 0) {
      tabela.innerHTML = `<tr><td colspan="6">Nenhum resultado encontrado.</td></tr>`;
      return;
    }

    // Preencher a tabela
    tabela.innerHTML = "";
    resultados.sort((a, b) => a.dataRenovacao.localeCompare(b.dataRenovacao));

    resultados.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.empresa}</td>
        <td>${r.ramo}</td>
        <td>${r.rm}</td>
        <td>${formatarValor(r.valor)}</td>
        <td>${r.dataRenovacao}</td>
        <td>${r.origem}</td>
      `;
      tabela.appendChild(tr);
    });

  }).catch(error => {
    console.error("❌ Erro na busca de vencimentos:", error);
    tabela.innerHTML = `<tr><td colspan="6">Erro ao carregar os dados.</td></tr>`;
  });
}

// Inicia ao carregar a página
window.addEventListener("load", () => {
  carregarRMs();

  // Datas padrão: mês atual
  const hoje = new Date();
  document.getElementById("dataInicio").value = `01/${('0' + (hoje.getMonth() + 1)).slice(-2)}`;
  document.getElementById("dataFim").value = `31/${('0' + (hoje.getMonth() + 1)).slice(-2)}`;
  filtrarDados();
});
