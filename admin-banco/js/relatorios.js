firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
});

function gerarRelatorio() {
  const ramo = document.getElementById("filtroRamo").value;
  const status = document.getElementById("filtroStatus").value;
  const dataInicio = document.getElementById("dataInicio").value;
  const dataFim = document.getElementById("dataFim").value;

  let query = db.collection("cotacoes-gerentes");

  if (ramo) query = query.where("ramo", "==", ramo);
  if (status) query = query.where("status", "==", status);

  query.get().then(snapshot => {
    const linhas = [];
    let total = 0;

    snapshot.forEach(doc => {
      const c = doc.data();
      const dataCotacao = c.dataSolicitacao?.toDate();
      const dentroDoPeriodo =
        (!dataInicio || new Date(dataInicio) <= dataCotacao) &&
        (!dataFim || new Date(dataFim + "T23:59:59") >= dataCotacao);

      if (!dentroDoPeriodo) return;

      total += c.valor || 0;
      linhas.push(`
        <tr>
          <td>${c.empresa}</td>
          <td>${c.ramo}</td>
          <td>${c.status}</td>
          <td>R$ ${c.valor?.toFixed(2) || "-"}</td>
          <td>${dataCotacao.toLocaleDateString()}</td>
        </tr>
      `);
    });

    const tabela = `
      <table>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Ramo</th>
            <th>Status</th>
            <th>Valor</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          ${linhas
