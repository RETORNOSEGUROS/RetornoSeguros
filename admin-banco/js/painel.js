function carregarResumoPainel(uid) {
  // ✅ MINHAS COTAÇÕES
  db.collection("cotacoes-gerentes")
    .orderBy("dataCriacao", "desc").limit(5).get().then(snapshot => {
      const ul = document.getElementById("listaCotacoes");
      ul.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        const valor = parseFloat(d.valorFinal || 0);
        const valorFormatado = valor > 0 ? `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Valor não definido";
        ul.innerHTML += `<li>${d.empresaNome || "Empresa"} - ${d.ramo || ""} - ${valorFormatado}</li>`;
      });
    });

  // ✅ PRODUÇÃO
  db.collection("cotacoes-gerentes")
    .where("status", "==", "Negócio Emitido")
    .orderBy("dataCriacao", "desc")
    .limit(5)
    .get().then(snapshot => {
      const ul = document.getElementById("listaProducao");
      ul.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        const valor = parseFloat(d.valorFinal || 0);
        const valorFormatado = valor > 0 ? `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Valor não definido";
        ul.innerHTML += `<li>${d.empresaNome || "Empresa"} - ${d.ramo || ""} - ${valorFormatado}</li>`;
      });
    });

  // ✅ MINHAS VISITAS
  db.collection("visitas")
    .orderBy("data", "desc").limit(5).get().then(snapshot => {
      const ul = document.getElementById("listaVisitas");
      ul.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        const empresa = d.empresa || "Empresa";
        const ramo = d.ramo || "Ramo";
        const data = d.data?.toDate?.().toLocaleDateString("pt-BR") || "Sem data";
        ul.innerHTML += `<li>${empresa} - ${ramo} - ${data}</li>`;
      });
    });

  // ✅ ÚLTIMAS CONVERSAS
  const ul = document.getElementById("listaConversas");
  ul.innerHTML = "";

  db.collection("cotacoes-gerentes")
    .orderBy("dataCriacao", "desc").limit(5).get().then(snapshot => {
      snapshot.forEach(doc => {
        const cotacaoId = doc.id;
        const cotacaoData = doc.data();

        db.collection("cotacoes-gerentes").doc(cotacaoId)
          .collection("interacoes").orderBy("data", "desc").limit(1).get().then(subSnap => {
            subSnap.forEach(subDoc => {
              const interacao = subDoc.data();
              const msg = interacao.mensagem?.slice(0, 70) || "Sem mensagem";
              ul.innerHTML += `<li><strong>${cotacaoData.empresaNome}</strong>: ${msg}</li>`;
            });
          });
      });
    });
}
