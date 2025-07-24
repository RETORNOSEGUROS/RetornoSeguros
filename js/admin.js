// js/admin.js

// Verifica login no Firebase e carrega dados do admin
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    const uid = user.uid;
    const db = firebase.firestore();

    try {
      const doc = await db.collection("usuarios").doc(uid).get();
      if (doc.exists && doc.data().perfil === "admin") {
        const nome = doc.data().nome || "Administrador";
        const perfil = doc.data().perfil || "admin";
        document.getElementById("user-info").innerHTML = `${nome} (${perfil})`;
        carregarPagina("visao"); // carrega visão geral por padrão
      } else {
        alert("Acesso restrito. Você não tem permissão de administrador.");
        window.location.href = "../login.html";
      }
    } catch (err) {
      console.error("Erro ao buscar dados do usuário:", err);
    }
  } else {
    // não logado
    window.location.href = "../login.html";
  }
});

// Função para carregar conteúdo dinâmico
function carregarPagina(pagina) {
  const url = `../js/admin-${pagina}.js`;
  const container = document.getElementById("conteudo-pagina");

  // Limpa conteúdo atual
  container.innerHTML = `<p>Carregando ${pagina}...</p>`;

  // Remove scripts anteriores se necessário
  const scripts = document.querySelectorAll("script[data-dynamic]");
  scripts.forEach((el) => el.remove());

  // Cria novo script e carrega módulo
  const script = document.createElement("script");
  script.src = url;
  script.setAttribute("data-dynamic", "true");
  document.body.appendChild(script);
}

// Logout
function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = "../login.html";
  });
}
