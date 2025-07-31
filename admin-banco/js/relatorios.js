firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let cotacoes = [];

window.onload = async () => {
  await carregarRMs();
  await carregarCotacoes();
  aplicarFiltros();
};

async function carregarRMs() {
  const selectRM = document.getElementById("filtroRM");
  selectRM.innerHTML = `<option value="">Todos</option>`;
  const snapshot = await db.collection("gerentes").get();
  snapshot.forEach(doc => {
    const dados = doc.data();
    const opt = document.createElement("option");
    opt.value = dados.nome;
    opt.textContent = dados.nome;
    selectRM.appendChild(opt);
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
  const status = Array.from(document.getElementById("filtroStatus").selectedOptions).map(o => o.value);
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
}

function exibirResultados(lista) {
  const div = document.getElementById("tabelaResultados");
  if (!lista.length) return div.innerHTML = "<p>Nenhuma cotação encontrada.</p>";
  let html = `<table><thead><tr>
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
  alert("Função de exportação para Excel será implementada com SheetJS ou backend");
}
