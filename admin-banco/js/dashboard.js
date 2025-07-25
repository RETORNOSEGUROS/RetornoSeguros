firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(user => {
  if (!user) return window.location.href = "login.html";
  carregarDashboard();
});

function carregarDashboard() {
  db.collection("cotacoes-gerentes").get().then(snapshot => {
    const statusContagem = {};
    let totalCotacoes = 0;
    let totalFechados = 0;
    let totalPremios = 0;

    snapshot.forEach(doc => {
      const c = doc.data();
      const status = c.status || "indefinido";
      const valor = c.valor || 0;

      statusContagem[status] = (statusContagem[status] || 0) + 1;
      totalCotacoes++;
      if (status === "fechado") totalFechados++;
      if (!isNaN(valor)) totalPremios += valor;
    });

    document.getElementById("totalCotacoes").textContent = totalCotacoes;
    document.getElementById("totalFechados").textContent = totalFechados;
    document.getElementById("totalPremios").textContent = `R$ ${totalPremios.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    let tabela = `
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Quantidade</th>
          </tr>
        </thead>
        <tbody>
    `;

    Object.keys(statusContagem).forEach(st => {
      tabela += `
        <tr>
          <td>${st}</td>
          <td>${statusContagem[st]}</td>
        </tr>
      `;
    });

    tabela
