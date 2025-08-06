function carregarResumoPainel() {
  // ✅ Minhas Cotações
  db.collection("cotacoes-gerentes")
    .orderBy("dataCriacao", "desc").limit(5).get()
    .then(snapshot => {
      const ul = document.getElementById("listaCotacoes");
      ul.innerHTML = "";
      if (snapshot.empty) ul.innerHTML = "<li>Nenhuma cotação encontrada.</li>";
      snapshot.forEach(doc => {
        const d = doc.data();
        const valor = parseFloat(d.valorFinal || 0);
        const valorFormatado = valor > 0 ? `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0";
        ul.innerHTML += `<li>${d.empresaNome || "Empresa"} - ${d.ramo || "Ramo"} - ${valorFormatado}</li>`;
      });
    }).catch(err => {
      console.error("Erro Minhas Cotações:", err);
    });

  // ✅ Produção
  db.collection("cotacoes-gerentes")
    .where("status", "==", "Negócio Emitido")
    .orderBy("dataCriacao", "desc")
    .limit(5)
    .get().then(snapshot => {
      const ul = document.getElementById("listaProducao");
      ul.innerHTML = "";
      if (snapshot.empty) ul.innerHTML = "<li>Nenhum negócio fechado.</li>";
      snapshot.forEach(doc => {
        const d = doc.data();
        const valor = parseFloat(d.valorFinal || 0);
        const valorFormatado = valor > 0 ? `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0";
        ul.innerHTML += `<li>${d.empresaNome || "Empresa"} - ${d.ramo || "Ramo"} - ${valorFormatado}</li>`;
      });
    }).catch(err => {
      console.error("Erro Produção:", err);
    });

  // ✅ Minhas Visitas (ajuste para campos reais)
  db.collection("visitas")
    .orderBy("data", "desc").limit(5).get()
    .then(snapshot => {
      const ul = document.getElementById("listaVisitas");
      ul.innerHTML = "";
      if (snapshot.empty) ul.innerHTML = "<li>Nenhuma visita encontrada.</li>";
      snapshot.forEach(doc => {
        const d = doc.data();
        const empresa = d.empresaId || "Empresa";
        const dataFormatada = d.data?.toDate?.().toLocaleDateString("pt-BR") || "Sem data";
        let ramo = "-";
        if (d.ramos?.vida) ramo = "VIDA";
        else if (d.ramos?.frota) ramo = "FROTA";
        ul.innerHTML += `<li>${empresa} - ${ramo} - ${dataFormatada}</li>`;
      });
    }).catch(err => {
      console.error("Erro Minhas Visitas:", err);
    });

  // ✅ Últimas Conversas (usa dataHora correta)
  const ul = document.getElementById("listaConversas");
  ul.innerHTML = "";

  db.collection("cotacoes-gerentes")
    .orderBy("dataCriacao", "desc")
    .limit(5)
    .get()
    .then(snapshot => {
      if (snapshot.empty) {
        ul.innerHTML = "<li>Nenhuma conversa recente.</li>";
        return;
      }

      snapshot.forEach(doc => {
        const cotacaoId = doc.id;
        const cotacaoData = doc.data();
        db.collection("cotacoes-gerentes").doc(cotacaoId)
          .collection("interacoes")
          .orderBy("dataHora", "desc") // CORRIGIDO AQUI
          .limit(1)
          .get()
          .then(subSnap => {
            if (subSnap.empty) return;
            subSnap.forEach(subDoc => {
              const i = subDoc.data();
              ul.innerHTML += `<li><strong>${cotacaoData.empresaNome || "Empresa"}</strong>: ${i.mensagem?.slice(0, 70) || "Sem mensagem"}</li>`;
            });
          }).catch(err => {
            console.error("Erro nas interações:", err);
          });
      });
    }).catch(err => {
      console.error("Erro Últimas Conversas:", err);
    });
}
