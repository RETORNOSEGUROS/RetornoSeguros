
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let todasCotacoes = [];
let grafico = null;

auth.onAuthStateChanged(async user => {
  if (!user) return (window.location.href = "login.html");
  await carregarStatus();
  await carregarRMs();
  await carregarClientes();
});

async function carregarStatus() {
  const snap = await db.collection("status-negociacao").doc("config").get();
  const lista = snap.data()?.statusFinais || [];
  const container = document.getElementById("filtroStatus");
  container.innerHTML = "";
  lista.forEach(s => {
    const chk = document.createElement("label");
    chk.innerHTML = `<input type="checkbox" value="${s}"> ${s}`;
    container.appendChild(chk);
  });
}

async function carregarRMs() {
  const container = document.getElementById("filtroRM");
  container.innerHTML = "";
  const snapshot = await db.collection("usuarios").where("perfil", "==", "rm").get();
  snapshot.forEach(doc => {
    const nome = doc.data().nome || doc.data().email;
    const chk = document.createElement("label");
    chk.innerHTML = `<input type="checkbox" value="${nome}"> ${nome}`;
    container.appendChild(chk);
  });
}

async function carregarClientes() {
  const select = document.getElementById("filtroCliente");
  const snap = await db.collection("empresas").get();
  snap.forEach(doc => {
    const nome = doc.data().nome || "(sem nome)";
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    select.appendChild(opt);
  });
}

function getCheckedValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(e => e.value);
}

async function gerarRelatorio() {
  const clienteSelecionado = document.getElementById("filtroCliente").value;
  const statusSel = getCheckedValues("filtroStatus");
  const ramosSel = getCheckedValues("filtroRamo");
  const rmsSel = getCheckedValues("filtroRM");
  const dataInicio = document.getElementById("dataInicio").valueAsDate;
  const dataFim = document.getElementById("dataFim").valueAsDate;

  const snap = await db.collection("cotacoes-gerentes").get();
  todasCotacoes = [];
  let total = 0;

  snap.forEach(doc => {
    const c = doc.data();
    const data = c.dataCriacao?.toDate?.();
    if (clienteSelecionado && c.empresaNome !== clienteSelecionado) return;
    if (statusSel.length && !statusSel.includes(c.status)) return;
    if (ramosSel.length && !ramosSel.includes(c.ramo)) return;
    if (rmsSel.length && !rmsSel.includes(c.rmNome)) return;
    if (dataInicio && (!data || data < dataInicio)) return;
    if (dataFim && (!data || data > dataFim)) return;

    todasCotacoes.push({ ...c, data });
    total += c.valorDesejado || 0;
  });

  document.getElementById("valorTotal").innerHTML = `<h4>Total Geral: R$ ${total.toLocaleString("pt-BR")}</h4>`;
  gerarTabela(todasCotacoes);
  gerarTotalizadores(todasCotacoes);
  gerarGrafico(todasCotacoes);
}

function gerarTabela(lista) {
  const html = `
    <table>
      <thead>
        <tr>
          <th>Empresa</th><th>Ramo</th><th>Status</th><th>RM</th><th>Valor</th><th>Data</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(c => `
          <tr>
            <td>${c.empresaNome}</td>
            <td>${c.ramo}</td>
            <td>${c.status}</td>
            <td>${c.rmNome || "-"}</td>
            <td>R$ ${c.valorDesejado?.toLocaleString("pt-BR") || "0,00"}</td>
            <td>${c.data?.toLocaleDateString("pt-BR") || "-"}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
  document.getElementById("resultadoTabela").innerHTML = html;
}

function gerarTotalizadores(lista) {
  const contagem = {};
  lista.forEach(c => {
    const key = c.status || "Indefinido";
    if (!contagem[key]) contagem[key] = { qtd: 0, total: 0 };
    contagem[key].qtd += 1;
    contagem[key].total += c.valorDesejado || 0;
  });

  const html = `
    <table>
      <thead>
        <tr><th>Status</th><th>Qtde</th><th>Valor Total</th></tr>
      </thead>
      <tbody>
        ${Object.entries(contagem).map(([s, v]) => `
          <tr><td>${s}</td><td>${v.qtd}</td><td>R$ ${v.total.toLocaleString("pt-BR")}</td></tr>
        `).join("")}
      </tbody>
    </table>`;
  document.getElementById("resumoStatus").innerHTML = html;
}

function gerarGrafico(lista) {
  const contagem = {};
  lista.forEach(c => {
    contagem[c.status] = (contagem[c.status] || 0) + (c.valorDesejado || 0);
  });

  if (grafico) grafico.destroy();

  const ctx = document.getElementById("graficoStatus").getContext("2d");
  grafico = new Chart(ctx, {
    type: "pie",
    data: {
      labels: Object.keys(contagem),
      datasets: [{
        data: Object.values(contagem),
        backgroundColor: ["#4CAF50", "#2196F3", "#FFC107", "#F44336", "#9C27B0", "#FF9800", "#3F51B5", "#009688"]
      }]
    }
  });
}

function exportarExcel() {
  const ws_data = [["Empresa", "Ramo", "Status", "RM", "Valor", "Data"]];
  todasCotacoes.forEach(c => {
    ws_data.push([
      c.empresaNome,
      c.ramo,
      c.status,
      c.rmNome || "-",
      c.valorDesejado || 0,
      c.data?.toLocaleDateString("pt-BR") || "-"
    ]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  XLSX.writeFile(wb, "relatorio-cotacoes.xlsx");
}

function exportarPDF() {
  const element = document.body;
  html2pdf().from(element).save("relatorio-cotacoes.pdf");
}
