function carregarResumoPainel(uid) {
  // Últimas Conversas
  db.collection("interacoes_cotacao")
    .orderBy("data", "desc")
    .limit(5)
    .get().then(snapshot => {
      const ul = document.getElementById("listaConversas");
      ul.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        ul.innerHTML += `<li><strong>${d.empresaNome || 'Empresa'}</strong>: ${d.mensagem?.slice(0, 60)}...</li>`;
      });
    }).catch(() => {
      document.getElementById("listaConversas").innerHTML = "<li>Nenhuma conversa encontrada.</li>";
    });

  // Minhas Visitas
  db.collection("visitas")
    .orderBy("dataCadastro", "desc")
    .limit(5)
    .get().then(snapshot => {
      const ul = document.getElementById("listaVisitas");
      ul.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        const empresa = d.empresa || "Empresa";
        const data = d.data || "Sem data";
        ul.innerHTML += `<li>${empresa} - ${data}</li>`;
      });
    }).catch(() => {
      document.getElementById("listaVisitas").innerHTML = "<li>Nenhuma visita encontrada.</li>";
    });

  // Produção (Negócios Fechados)
  db.collection("cotacoes-gerentes")
    .where("status", "==", "Negócio Emitido")
    .orderBy("fimVigencia", "desc")
    .limit(5)
    .get().then(snapshot => {
      const ul = document.getElementById("listaProducao");
      ul.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        ul.innerHTML += `<li>${d.empresaNome} - ${d.ramo} - R$ ${parseFloat(d.valorFinal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</li>`;
      });
    }).catch(() => {
      document.getElementById("listaProducao").innerHTML = "<li>Nenhum negócio encontrado.</li>";
    });

  // Minhas Cotações
  db.collection("cotacoes-gerentes")
    .orderBy("dataCriacao", "desc")
    .limit(5)
    .get().then(snapshot => {
      const ul = document.getElementById("listaCotacoes");
      ul.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        ul.innerHTML += `<li>${d.empresaNome} - ${d.ramo} - R$ ${parseFloat(d.valorFinal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</li>`;
      });
    }).catch(() => {
      document.getElementById("listaCotacoes").innerHTML = "<li>Nenhuma cotação encontrada.</li>";
    });
}
