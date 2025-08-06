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
  // Conversas - últimas interações
  db.collection("interacoes_cotacao").orderBy("data", "desc").limit(5).get().then(snapshot => {
    const ul = document.getElementById("listaConversas");
    snapshot.forEach(doc => {
      const data = doc.data();
      ul.innerHTML += `<li><strong>${data.empresaNome || 'Empresa'}</strong>: ${data.mensagem.slice(0, 60)}...</li>`;
    });
  });

  // Visitas
  db.collection("visitas").orderBy("dataCadastro", "desc").limit(5).get().then(snapshot => {
    const ul = document.getElementById("listaVisitas");
    snapshot.forEach(doc => {
      const data = doc.data();
      ul.innerHTML += `<li>${data.empresa || 'Empresa'} - ${data.data}</li>`;
    });
  });

  // Produção
  db.collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido").orderBy("fimVigencia", "desc").limit(5).get().then(snapshot => {
    const ul = document.getElementById("listaProducao");
    snapshot.forEach(doc => {
      const data = doc.data();
      ul.innerHTML += `<li>${data.empresaNome || 'Empresa'} - R$ ${data.valorFinal?.toLocaleString("pt-BR")}</li>`;
    });
  });

  // Cotações
  db.collection("cotacoes-gerentes").orderBy("dataCriacao", "desc").limit(5).get().then(snapshot => {
    const ul = document.getElementById("listaCotacoes");
    snapshot.forEach(doc => {
      const data = doc.data();
      ul.innerHTML += `<li>${data.empresaNome || 'Empresa'} - ${data.ramo}</li>`;
    });
  });
}
