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
        ["Agências", "agencias.html"],
        ["Visitas", "visitas.html"],
        ["Solicitações de Cotação", "cotacoes.html"],
        ["Negociações", "negociacoes.html"],
        ["Empresas", "empresas.html"],
        ["Relatórios", "relatorios.html"]
      ];
    } else if (perfil === "gerente_chefe") {
      links = [
        ["Visitas", "visitas.html"],
        ["Solicitações", "cotacoes.html"],
        ["Empresas", "empresas.html"],
        ["Relatórios", "relatorios.html"]
      ];
    } else if (perfil === "rm") {
      links = [
        ["Registrar Visita", "visitas.html"],
        ["Solicitar Cotação", "cotacoes.html"],
        ["Empresas", "empresas.html"]
      ];
    } else if (perfil === "assistente") {
      links = [
        ["Visitas", "visitas.html"],
        ["Empresas", "empresas.html"]
      ];
    }

    links.forEach(([label, href]) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      menu.appendChild(a);
    });
  });
});
