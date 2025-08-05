
document.addEventListener("DOMContentLoaded", async () => {
  const db = firebase.firestore();
  const tabela = document.querySelector("#relatorioTable tbody");

  function formatarData(data) {
    if (!data) return "";
    const dia = String(data.getDate()).padStart(2, "0");
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    return `${dia}/${mes}`;
  }

  function formatarValor(valor) {
    return valor ? `R$ ${valor.toFixed(2).replace(".", ",")}` : "";
  }

  function criarLinha(dado, origem) {
    const tr = document.createElement("tr");
    const docId = dado.id;
    const d = dado.data();
    const dataRef = d.data || d.criadoEm || d.dataVencimento;
    const data = dataRef?.toDate?.() || new Date();
    const vencimentoRef = d.vencimento || d.dataVencimento || null;
    const vencimento = vencimentoRef?.toDate?.() || null;

    tr.innerHTML = `
      <td>${origem}</td>
      <td>${formatarData(data)}</td>
      <td>${d.usuarioNome || ""}</td>
      <td>${d.empresaNome || ""}</td>
      <td>${d.rmNome || ""}</td>
      <td>${d.ramo || d.tipo || ""}</td>
      <td>${formatarData(vencimento)}</td>
      <td>${formatarValor(d.premio || d.valorEstimado)}</td>
      <td>${d.seguradora || ""}</td>
      <td>${d.observacoes || ""}</td>
      <td></td>
    `;
    tabela.appendChild(tr);
  }

  try {
    const visitasSnap = await db.collection("visitas").get();
    visitasSnap.forEach(doc => {
      const dados = doc.data();
      const ramos = dados.ramos || {};
      Object.keys(ramos).forEach(ramo => {
        const info = ramos[ramo];
        if (info && info.vencimento) {
          criarLinha({
            id: doc.id + "-" + ramo,
            data: () => ({
              ...dados,
              ramo,
              data: dados.data,
              vencimento: { toDate: () => new Date(info.vencimento + "/2025") },
              premio: info.premioAnual,
              seguradora: info.seguradora
            })
          }, "Mapeado");
        }
      });
    });

    const negociosSnap = await db.collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido").get();
    negociosSnap.forEach(doc => {
      criarLinha(doc, "Fechado conosco");
    });

  } catch (erro) {
    console.error("Erro ao carregar vencimentos:", erro);
  }
});
