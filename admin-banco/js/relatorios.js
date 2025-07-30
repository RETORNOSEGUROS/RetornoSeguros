
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
});

async function gerarRelatorio() {
  const statusFiltro = document.getElementById("filtroStatus").value.toLowerCase();
  const ramoFiltro = document.getElementById("filtroRamo").value.toLowerCase();
  const clienteFiltro = document.getElementById("filtroCliente").value.toLowerCase();
  const rmFiltro = document.getElementById("filtroRM").value.toLowerCase();
  const dataInicio = document.getElementById("dataInicio").valueAsDate;
  const dataFim = document.getElementById("dataFim").valueAsDate;

  const lista = [];
  let total = 0;

  const snap = await db.collection("cotacoes-gerentes").get();
  snap.forEach(doc => {
    const c = doc.data();
    const data = c.dataCriacao?.toDate?.();
    if (statusFiltro && !c.status?.toLowerCase().includes(statusFiltro)) return;
    if (ramoFiltro && !c.ramo?.toLowerCase().includes(ramoFiltro)) return;
    if (clienteFiltro && !c.empresaNome?.toLowerCase().includes(clienteFiltro)) return;
    if (rmFiltro && !c.rmNome?.toLowerCase().includes(rmFiltro)) return;
    if (dataInicio && (!data || data < dataInicio)) return;
    if (dataFim && (!data || data > dataFim)) return;

    lista.push(c);
    total += c.valorDesejado || 0;
  });

  const html = `
    <table>
      <thead>
        <tr><th>Empresa</th><th>Ramo</th><th>Status</th><th>RM</th><th>Valor</th><th>Data</th></tr>
      </thead>
      <tbody>
        ${lista.map(c => `
          <tr>
            <td>${c.empresaNome}</td>
            <td>${c.ramo}</td>
            <td>${c.status}</td>
            <td>${c.rmNome || "-"}</td>
            <td>R$ ${c.valorDesejado?.toLocaleString("pt-BR") || "0,00"}</td>
            <td>${c.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-"}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
  document.getElementById("resultadoTabela").innerHTML = html;
  document.getElementById("valorTotal").innerText = "Total Geral: R$ " + total.toLocaleString("pt-BR");
}
