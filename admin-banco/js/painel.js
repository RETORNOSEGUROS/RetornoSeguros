// js/painel.js
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(user => {
  if (!user) return window.location.href = "login.html";

  const uid = user.uid;
  db.collection("usuarios_banco").doc(uid).get().then(doc => {
    if (!doc.exists) {
      document.getElementById("perfilUsuario").textContent = "Usuário não encontrado.";
      return;
    }

    const dados = doc.data();
    const perfil = dados.perfil || "sem perfil";
    const nome = dados.nome || user.email;

    document.getElementById("perfilUsuario").textContent = `${nome} (${perfil})`;

    const menu = document.getElementById("menuNav");
    const links = [
      ["Cadastrar Gerentes", "cadastro-geral.html"],
      ["Cadastrar Empresa", "cadastro-empresa.html"],
      ["Agências", "agencias.html"],
      ["Visitas", "visitas.html"],
      ["Empresas", "empresas.html"],
      ["Solicitações de Cotação", "cotacoes.html"],
      ["Produção", "negocios-fechados.html"],
      ["Consultar Dicas", "consultar-dicas.html"],
      ["Dicas Produtos", "dicas-produtos.html"],
      ["Ramos Seguro", "ramos-seguro.html"],
      ["Relatório Visitas", "visitas-relatorio.html"],
      ["Vencimentos", "vencimentos.html"],
      ["Relatórios", "relatorios.html"]
    ];

    links.forEach(([label, href]) => {
      const a = document.createElement("a");
      a.href = href;
      a.innerHTML = `🔹 ${label}`;
      menu.appendChild(a);
    });

    carregarResumoPainel(uid);
  });
});

function carregarResumoPainel(uid) {
  // ✅ MINHAS COTAÇÕES
  db.collection("cotacoes-gerentes")
    .orderBy("dataCriacao", "desc").limit(5).get().then(snapshot => {
      const ul = document.getElementById("listaCotacoes");
      ul.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        ul.innerHTML += `<li>${d.empresaNome} - ${d.ramo} - R$ ${parseFloat(d.valorFinal || 0).toLocaleString("pt-BR")}</li>`;
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
        ul.innerHTML += `<li>${d.empresaNome} - ${d.ramo} - R$ ${parseFloat(d.valorFinal || 0).toLocaleString("pt-BR")}</li>`;
      });
    });

  // ✅ MINHAS VISITAS
  db.collection("visitas")
    .orderBy("data", "desc").limit(5).get().then(snapshot => {
      const ul = document.getElementById("listaVisitas");
      ul.innerHTML = "";
      snapshot.forEach(doc => {
        const d = doc.data();
        ul.innerHTML += `<li>${d.empresa} - ${d.ramo} - ${d.data}</li>`;
      });
    });

  // ✅ ÚLTIMAS CONVERSAS (via subcoleção "interacoes" dentro de cotacoes-gerentes)
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
              ul.innerHTML += `<li><strong>${cotacaoData.empresaNome}</strong>: ${interacao.mensagem?.slice(0, 70)}...</li>`;
            });
          });
      });
    });
}
