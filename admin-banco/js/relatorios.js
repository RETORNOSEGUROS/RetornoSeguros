firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let cotacoes = [];
let statusDisponiveis = [];

window.onload = async () => {
  await carregarRMs();
  await carregarStatus();
  await carregarCotacoes();
  aplicarFiltros();
};

async function carregarRMs() {
  const selectRM = document.getElementById("filtroRM");
  selectRM.innerHTML = `<option value="">Todos</option>`;
  const snapshot = await db.collection("cotacoes-gerentes").get();
  const nomesUnicos = new Set();
  snapshot.forEach(doc => {
    const nome = doc.data().rmNome;
    if (nome && !nomesUnicos.has(nome)) {
      nomesUnicos.add(nome);
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      selectRM.appendChild(opt);
    }
  });
}

async function carregarStatus() {
  const selectStatus = document.getElementById("filtroStatus");
  selectStatus.innerHTML = '';
  const snap = await db.doc("status-negociacao/config").get();
  statusDisponiveis = snap.data()?.statusFinais || [];
  
  const optTodos = document.createElement("option");
  optTodos.value = "TODOS";
  optTodos.textContent = "[Selecionar Todos]";
  selectStatus.appendChild(optTodos);

  statusDisponiveis.forEach(status => {
    const opt = document.createElement("option");
    opt.value = status;
    opt.textContent = status;
    selectStatus.appendChild(opt);
  });

  selectStatus.addEventListener("change", () => {
    const values = Array.from(selectStatus.selectedOptions).map(o => o.value);
    if (values.includes("TODOS")) {
      for (const opt of selectStatus.options) opt.selected = true;
    }
  });
}

async function carregarCotacoes() {
  const snapshot = await db.collection("cotacoes-gerentes").orderBy("dataCriacao", "desc").get();
  cotacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function aplicarFiltros() {
  const inicio = document.getElementById("filtroDataInicio").value;
  const fim = document.getElementById("filtroDataFim").value;
  const rm = document.getElementById("filtroRM").value;
  const status = Array.from(document.getElementById("filtroStatus").selectedOptions).map(o => o.value).filter(v => v !== "TODOS");
  const ramo = document.getElementById("filtroRamo").value;
  const empresaBusca = document.getElementById("filtroEmpresa").value.toLowerCase();

  let filtradas = cotacoes.filter(c => {
    const data = c.dataCriacao?.toDate?.() || new Date(0);
    if (inicio && data < new Date(inicio)) return false;
    if (fim && data > new Date(fim + 'T23:59:59')) return false;
    if (rm && c.rmNome !== rm) return false;
    if (status.length > 0 && !status.includes(c.status)) return false;
    if (ramo && c.ramo !== ramo) return false;
    if (empresaBusca && !c.empresaNome?.toLowerCase().includes(empresaBusca)) return false;
    return true;
  });

  exibirResultados(filtradas);
  exibirTotalizadores(filtradas);
  renderizarGraficosPizza(filtradas);
}

function exibirResultados(lista) {
  const div = document.getElementById("tabelaResultados");
  if (!lista.length) return div.innerHTML = "<p>Nenhuma cotação encontrada.</p>";
  let html = `<table id="tabelaExportar"><thead><tr>
    <th>Empresa</th><th>CNPJ</th><th>RM</th><th>Ramo</th><th>Valor</th>
    <th>Status</th><th>Data</th><th>Ações</th>
  </tr></thead><tbody>`;
  for (let c of lista) {
    const data = c.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";
    const valor = c.valorDesejado?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "-";
    html += `<tr>
      <td>${c.empresaNome}</td>
      <td>${c.empresaCNPJ || "-"}</td>
      <td>${c.rmNome || "-"}</td>
      <td>${c.ramo}</td>
      <td>${valor}</td>
      <td>${c.status}</td>
      <td>${data}</td>
      <td><a href="chat-cotacao.html?id=${c.id}" target="_blank">Abrir</a></td>
    </tr>`;
  }
  html += `</tbody></table>`;
  div.innerHTML = html;
}

function exibirTotalizadores(lista) {
  const total = {};
  lista.forEach(c => {
    if (!total[c.status]) total[c.status] = 0;
    total[c.status] += c.valorDesejado || 0;
  });
  const div = document.getElementById("resumoStatus");
  if (Object.keys(total).length === 0) return div.innerHTML = "Nenhum valor apurado.";
  div.innerHTML = Object.entries(total).map(([status, valor]) => {
    return `<p><strong>${status}:</strong> R$ ${valor.toLocaleString("pt-BR")}</p>`;
  }).join("");
}

function exportarParaExcel() {
  const table = document.getElementById("tabelaExportar");
  let csv = [];
  for (let row of table.rows) {
    let rowData = [];
    for (let cell of row.cells) rowData.push(cell.innerText);
    csv.push(rowData.join(";"));
  }
  const blob = new Blob([csv.join("\n")], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "relatorio-cotacoes.csv";
  a.click();
}

function renderizarGraficosPizza(lista) {
  const porStatus = {};
  const porRM = {};

  lista.forEach(c => {
    porStatus[c.status] = (porStatus[c.status] || 0) + (c.valorDesejado || 0);
    porRM[c.rmNome || "(Sem RM)"] = (porRM[c.rmNome || "(Sem RM)"] || 0) + (c.valorDesejado || 0);
  });

  const ctx1 = document.getElementById("graficoStatus").getContext("2d");
  const ctx2 = document.getElementById("graficoRM").getContext("2d");

  if (window.graficoStatus) window.graficoStatus.destroy();
  if (window.graficoRM) window.graficoRM.destroy();

  window.graficoStatus = new Chart(ctx1, {
    type: 'pie',
    data: {
      labels: Object.keys(porStatus),
      datasets: [{
        data: Object.values(porStatus),
        backgroundColor: ['#0074D9', '#FF4136', '#2ECC40', '#FF851B', '#B10DC9', '#FFDC00']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `R$ ${ctx.raw.toLocaleString("pt-BR")}`
          }
        }
      }
    }
  });

  window.graficoRM = new Chart(ctx2, {
    type: 'pie',
    data: {
      labels: Object.keys(porRM),
      datasets: [{
        data: Object.values(porRM),
        backgroundColor: ['#39CCCC', '#FF4136', '#B10DC9', '#FFDC00', '#0074D9', '#2ECC40']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `R$ ${ctx.raw.toLocaleString("pt-BR")}`
          }
        }
      }
    }
  });
}
