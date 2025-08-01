// js/painel.js
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

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
    let links = [];

    if (perfil === "admin") {
      links = [
        ["Cadastrar Gerentes", "cadastro-geral.html"],
        ["Cadastrar Empresa", "cadastro-empresa.html"],
        ["Agências", "agencias.html"],
        ["Visitas", "visitas.html"],
        ["Empresas", "empresas.html"],
        ["Solicitações de Cotação", "cotacoes.html"],
        ["Negociações", "negociacoes.html"],
        ["Produção", "negocios-fechados.html"],
        ["Relatório Visitas", "visitas-relatorio.html"],
        ["Vencimentos", "vencimentos.html"],
        ["Relatórios", "relatorios.html"]
      ];
    } else if (perfil === "gerente_chefe") {
      links = [
        ["Visitas", "visitas.html"],
        ["Empresas", "empresas.html"],
        ["Solicitações", "cotacoes.html"],
        ["Relatórios", "relatorios.html"]
      ];
    } else if (perfil === "rm") {
      links = [
        ["Registrar Visita", "visitas.html"],
        ["Empresas", "empresas.html"],
        ["Solicitar Cotação", "cotacoes.html"]
      ];
    } else if (perfil === "assistente") {
      links = [
        ["Visitas", "visitas.html"],
        ["Empresas", "empresas.html"]
      ];
    }

    links.forEach(([label, href]) => {
      const a = document.createElement("a");
      a.href = "#";
      a.innerHTML = `🔹 ${label}`;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        carregarConteudoPainel(href);
      });
      menu.appendChild(a);
    });
  }).catch(error => {
    console.error("Erro ao carregar perfil:", error);
    document.getElementById("perfilUsuario").textContent = "Erro ao carregar perfil.";
  });
});

function carregarConteudoPainel(pagina) {
  const conteudo = document.getElementById("conteudoPainel");
  conteudo.innerHTML = "<p>Carregando...</p>";

  fetch(pagina)
    .then(res => res.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const bodyContent = doc.body.innerHTML;
      conteudo.innerHTML = bodyContent;
    })
    .catch(err => {
      conteudo.innerHTML = "<p>Erro ao carregar conteúdo.</p>";
      console.error("Erro ao carregar página:", err);
    });
}
