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

    carregarResumoPainel();
  });
});

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

  // ✅ Minhas Visitas
  db.collection("visitas")
    .orderBy("data", "desc").limit(5).get()
    .then(snapshot => {
      const ul = document.getElementById("listaVisitas");
      ul.innerHTML = "";
      if (snapshot.empty) ul.innerHTML = "<li>Nenhuma visita encontrada.</li>";
      snapshot.forEach(doc => {
        const d = doc.data();
        const empresa = d.empresa || "Empresa";
        const ramo = d.ramo || "Ramo";
        const dataFormatada = d.data?.toDate?.().toLocaleDateString("pt-BR") || "Sem data";
        ul.innerHTML += `<li>${empresa} - ${ramo} - ${dataFormatada}</li>`;
      });
    }).catch(err => {
      console.error("Erro Minhas Visitas:", err);
    });

  // ✅ Últimas Conversas
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
          .orderBy("data", "desc")
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
