
document.addEventListener("DOMContentLoaded", function () {
  const db = firebase.firestore();
  const selectMes = document.getElementById("mes");
  const selectRM = document.getElementById("rm");
  const btnFiltrar = document.getElementById("btnFiltrar");
  const tabelaBody = document.getElementById("tabela-vencimentos");

  function carregarRMs() {
    db.collection("usuarios")
      .where("perfil", "==", "rm")
      .get()
      .then(snapshot => {
        snapshot.forEach(doc => {
          const data = doc.data();
          const option = document.createElement("option");
          option.value = data.nome;
          option.textContent = data.nome;
          selectRM.appendChild(option);
        });
      });
  }

  function carregarVencimentos() {
    const filtroMes = selectMes.value;
    const filtroRM = selectRM.value;
    tabelaBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';

    const visitasPromise = db.collection("visitas").get();
    const negociosPromise = db.collection("cotacoes-gerentes")
      .where("status", "==", "Negócio Emitido")
      .get();

    Promise.all([visitasPromise, negociosPromise]).then(([querySnapshotVisitas, querySnapshotNegocios]) => {
      let vencimentos = [];

      querySnapshotVisitas.forEach(doc => {
        const data = doc.data();
        if (data.ramos) {
          Object.entries(data.ramos).forEach(([ramo, info]) => {
            if (info.vencimento) {
              const partes = info.vencimento.split('/');
              if (partes.length === 2) {
                const mes = partes[1];
                const dataFormatada = info.vencimento;
                if ((filtroMes === "Todos" || filtroMes === mes) &&
                    (filtroRM === "Todos" || filtroRM === data.rmNome)) {
                  vencimentos.push({
                    empresa: data.empresaNome,
                    ramo: ramo.toUpperCase(),
                    rm: data.rmNome,
                    valor: info.premio || 0,
                    dataRenovacao: dataFormatada,
                    origem: "Mapeado em Visita"
                  });
                }
              }
            }
          });
        }
      });

      querySnapshotNegocios.forEach(doc => {
        const data = doc.data();
        const dataVenc = data.fimVigencia?.toDate?.();
        if (dataVenc instanceof Date) {
          const mes = String(dataVenc.getMonth() + 1).padStart(2, '0');
          const dataFormatada = `${String(dataVenc.getDate()).padStart(2, '0')}/${mes}/${dataVenc.getFullYear()}`;
          if ((filtroMes === "Todos" || filtroMes === mes) &&
              (filtroRM === "Todos" || filtroRM === data.rmNome)) {
            vencimentos.push({
              empresa: data.empresaNome,
              ramo: data.ramo,
              rm: data.rmNome,
              valor: data.premio || 0,
              dataRenovacao: dataFormatada,
              origem: "Fechado conosco"
            });
          }
        }
      });

      if (vencimentos.length === 0) {
        tabelaBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum vencimento encontrado.</td></tr>';
        return;
      }

      tabelaBody.innerHTML = "";
      vencimentos.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${item.empresa}</td>
          <td>${item.ramo}</td>
          <td>${item.rm}</td>
          <td>R$ ${item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          <td>${item.dataRenovacao}</td>
          <td>${item.origem}</td>
        `;
        tabelaBody.appendChild(tr);
      });
    });
  }

  carregarRMs();
  carregarVencimentos();
  btnFiltrar.addEventListener("click", carregarVencimentos);
});
