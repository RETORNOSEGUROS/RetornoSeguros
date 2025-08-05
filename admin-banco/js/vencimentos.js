if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const tbody = document.getElementById("relatorioBody");

async function carregarRelatorio() {
  // 🔹 VISITAS
  const visitasSnap = await db.collection("visitas").get();
  visitasSnap.forEach((doc) => {
    const data = doc.data();
    const dataStr = new Date(data.data?.seconds * 1000).toLocaleDateString("pt-BR");
    const usuario = data.usuarioId || "-";
    const empresaId = data.empresaId || "-";
    const ramos = data.ramos || {};

    Object.keys(ramos).forEach((ramoKey) => {
      const ramo = ramos[ramoKey];
      tbody.innerHTML += `
        <tr>
          <td>Visita</td>
          <td>${dataStr}</td>
          <td>${usuario}</td>
          <td>${empresaId}</td>
          <td>-</td>
          <td>${ramoKey.toUpperCase()}</td>
          <td>${ramo.vencimento || "-"}</td>
          <td>R$ ${ramo.premio?.toLocaleString("pt-BR") || "0"}</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>${ramo.seguradora || "-"}</td>
          <td>${ramo.observacoes || "-"}</td>
        </tr>
      `;
    });
  });

  // 🔹 NEGÓCIOS FECHADOS
  const cotacoesSnap = await db.collection("cotacoes-gerentes").get();
  cotacoesSnap.forEach((doc) => {
    const data = doc.data();
    const inicio = data.inicioVigencia || "-";
    const fim = data.fimVigencia || "-";
    const premio = Number(data.premioLiquido || 0).toLocaleString("pt-BR");
    const comissao = Number(data.comissaoValor || 0).toLocaleString("pt-BR");
    const percentual = data.comissaoPercentual || "-";
    const dataCriacao = data.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";

    tbody.innerHTML += `
      <tr>
        <td>Negócio</td>
        <td>${dataCriacao}</td>
        <td>${data.autorName || "-"}</td>
        <td>${data.empresaNome || "-"}</td>
        <td>${data.rmNome || "-"}</td>
        <td>${data.ramo || "-"}</td>
        <td>-</td>
        <td>R$ ${premio}</td>
        <td>R$ ${comissao}</td>
        <td>${percentual}%</td>
        <td>${inicio}</td>
        <td>${fim}</td>
        <td>-</td>
        <td>${data.observacoes || "-"}</td>
      </tr>
    `;
  });
}

carregarRelatorio();
