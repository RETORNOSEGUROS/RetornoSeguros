// Inicializa Firebase (garanta que o firebase-config.js está carregado antes)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Elementos
const mesSelect = document.getElementById("filtroMes");
const rmSelect = document.getElementById("filtroRm");
const tabela = document.getElementById("tabelaVencimentos").getElementsByTagName("tbody")[0];

// Mês atual ao abrir
const hoje = new Date();
const mesAtual = (hoje.getMonth() + 1).toString().padStart(2, "0");
mesSelect.value = mesAtual;

// Buscar RMs disponíveis
async function carregarRMs() {
  const rmsSnapshot = await db.collection("gerentes").get();
  rmSelect.innerHTML = '<option value="Todos">Todos</option>';
  rmsSnapshot.forEach(doc => {
    const nome = doc.data().nome || "Sem nome";
    rmSelect.innerHTML += `<option value="${nome}">${nome}</option>`;
  });
}

// Formata valores
function formatarValor(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Formata data
function formatarData(data) {
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Busca dados e preenche tabela
async function buscarVencimentos() {
  const mesSelecionado = mesSelect.value;
  const rmSelecionado = rmSelect.value;
  tabela.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';

  const resultados = [];

  // VISITAS
  const visitas = await db.collection("visitas").get();
  visitas.forEach(doc => {
    const visita = doc.data();
    const empresa = visita.empresa || "Empresa não informada";
    const rm = visita.rm || "";
    const ramos = visita.ramos || {};

    Object.entries(ramos).forEach(([ramoNome, ramoDados]) => {
      if (!ramoDados.vencimento || !ramoDados.valor) return;

      const data = new Date(ramoDados.vencimento + "/2024"); // Ex: "15/08" → "15/08/2024"
      const mesDoc = (data.getMonth() + 1).toString().padStart(2, "0");

      if ((mesSelecionado === "Todos" || mesSelecionado === mesDoc) &&
          (rmSelecionado === "Todos" || rmSelecionado === rm)) {
        resultados.push({
          empresa,
          ramo: ramoNome,
          rm,
          valor: ramoDados.valor,
          dataRenovacao: data,
          origem: "Mapeado em visita"
        });
      }
    });
  });

  // COTAÇÕES GERENTES
  const cotacoes = await db.collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido").get();
  cotacoes.forEach(doc => {
    const c = doc.data();
    if (!c.fimVigencia || !c.valorFinal) return;

    const data = new Date(c.fimVigencia);
    const mesDoc = (data.getMonth() + 1).toString().padStart(2, "0");

    if ((mesSelecionado === "Todos" || mesSelecionado === mesDoc) &&
        (rmSelecionado === "Todos" || rmSelecionado === c.rmNome)) {
      resultados.push({
        empresa: c.empresa || "Empresa",
        ramo: c.ramo || "Ramo",
        rm: c.rmNome || "",
        valor: c.valorFinal,
        dataRenovacao: data,
        origem: "Fechado conosco"
      });
    }
  });

  // Atualiza tabela
  if (resultados.length === 0) {
    tabela.innerHTML = '<tr><td colspan="6">Nenhum vencimento encontrado.</td></tr>';
  } else {
    tabela.innerHTML = "";
    resultados.sort((a, b) => a.dataRenovacao - b.dataRenovacao);
    resultados.forEach(r => {
      const linha = tabela.insertRow();
      linha.insertCell(0).innerText = r.empresa;
      linha.insertCell(1).innerText = r.ramo;
      linha.insertCell(2).innerText = r.rm;
      linha.insertCell(3).innerText = formatarValor(r.valor);
      linha.insertCell(4).innerText = formatarData(r.dataRenovacao);
      linha.insertCell(5).innerText = r.origem;
    });
  }
}

// Eventos
document.getElementById("btnFiltrar").addEventListener("click", buscarVencimentos);

// Ao carregar
carregarRMs().then(buscarVencimentos);
