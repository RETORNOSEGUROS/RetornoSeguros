
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let todasCotacoes = [];

auth.onAuthStateChanged(async user => {
  if (!user) return (window.location.href = "login.html");
  await carregarStatus();
  await carregarRMs();
});

async function carregarStatus() {
  const filtro = document.getElementById("filtroStatus");
  const snap = await db.collection("status-negociacao").doc("config").get();
  const lista = snap.data()?.statusFinais || [];
  filtro.innerHTML = "";
  lista.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    filtro.appendChild(opt);
  });
}

async function carregarRMs() {
  const filtroRM = document.getElementById("filtroRM");
  const snapshot = await db.collection("usuarios").where("perfil", "==", "rm").get();
  filtroRM.innerHTML = "";
  snapshot.forEach(doc => {
    const nome = doc.data().nome || "(sem nome)";
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    filtroRM.appendChild(opt);
  });
}

async function gerarRelatorio() {
  const cliente = document.getElementById("filtroCliente").value.toLowerCase();
  const status = Array.from(document.getElementById("filtroStatus").selectedOptions).map(e => e.value);
  const ramo = Array.from(document.getElementById("filtroRamo").selectedOptions).map(e => e.value);
  const rms = Array.from(document.getElementById("filtroRM").selectedOptions).map(e => e.value);
  const dataInicio = document.getElementById("dataInicio").valueAsDate;
  const dataFim = document.getElementById("dataFim").valueAsDate;

  const snapshot = await db.collection("cotacoes-gerentes").get();
  todasCotacoes = [];
  let total = 0;

  snapshot.forEach(doc => {
    const c = doc.data();
    const data = c.dataCriacao?.toDate?.();
    if (cliente && !c.empresaNome?.toLowerCase().includes(cliente)) return;
    if (status.length && !status.includes(c.status)) return;
    if (ramo.length && !ramo.includes(c.ramo)) return;
    if (rms.length && !rms.includes(c.rmNome)) return;
    if (dataInicio && (!data || data < dataInicio)) return;
    if (dataFim && (!data || data > dataFim)) return;

    todasCotacoes.push({ ...c, data });
    total += c.valorDesejado || 0;
  });

  document.getElementById("valorTotal").innerHTML = `Total Geral: R$ ${total.toLocaleString("pt-BR")}`;
  gerarTabela(todasCotacoes);
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

function gerarGrafico(lista) {
  const contagem = {};
  lista.forEach(c => {
    contagem[c.status] = (contagem[c.status] || 0) + (c.valorDesejado || 0);
  });

  const ctx = document.getElementById("graficoStatus").getContext("2d");
  new Chart(ctx, {
    type: "pie",
    data: {
      labels: Object.keys(contagem),
      datasets: [{
        data: Object.values(contagem),
        backgroundColor: ["#4CAF50", "#2196F3", "#FFC107", "#F44336", "#9C27B0"]
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
