// js/negocios-fechados.js

// Verifica se o Firebase já está inicializado (caso tenha sido carregado fora da ordem)
if (typeof firebase === "undefined") {
  console.error("Firebase não está carregado.");
} else {
  const db = firebase.firestore();
  const container = document.getElementById("tabelaNegocios");

  if (!container) {
    console.warn("Elemento #tabelaNegocios não encontrado.");
  } else {
    container.innerHTML = "🔄 Buscando negócios fechados...";

    db.collection("cotacoes-gerentes")
      .where("status", "==", "Negócio emitido") // ou ajuste o filtro conforme desejar
      .get()
      .then((snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = "<p>❗ Nenhum negócio fechado encontrado.</p>";
          return;
        }

        let html = `
          <table border="1" cellpadding="6" cellspacing="0" style="width:100%; border-collapse:collapse;">
            <thead style="background:#004080; color:white;">
              <tr>
                <th>Empresa</th>
                <th>Produto</th>
                <th>Valor Estimado</th>
                <th>RM</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
        `;

        snapshot.forEach((doc) => {
          const d = doc.data();
          html += `
            <tr>
              <td>${d.empresaNome || "-"}</td>
              <td>${d.ramo || "-"}</td>
              <td>R$ ${parseFloat(d.valorEstimado || 0).toLocaleString("pt-BR")}</td>
              <td>${d.nomeRm || "-"}</td>
              <td>${(d.criadoEm?.toDate?.() || "-").toLocaleDateString?.("pt-BR") || "-"}</td>
            </tr>
          `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
      })
      .catch((err) => {
        console.error("Erro ao buscar negócios:", err);
        container.innerHTML = "<p>❌ Erro ao buscar dados do Firestore.</p>";
      });
  }
}
