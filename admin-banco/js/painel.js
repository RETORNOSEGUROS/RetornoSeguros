// admin-banco/js/painel.js
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

auth.onAuthStateChanged(user => {
  if (!user) return window.location.href = "login.html";

  const uid = user.uid;
  db.collection("usuarios_banco").doc(uid).get().then(doc => {
    if (!doc.exists) {
      document.getElementById("perfilUsuario").textContent = "Usuário não encontrado.";
      return;
    }

    const dados   = doc.data();
    const perfil  = (dados.perfil || "sem perfil");
    const nome    = dados.nome || user.email;
    document.getElementById("perfilUsuario").textContent = `${nome} (${perfil})`;

    montarMenuLateral(perfil);   // ⬅️ novo: menu por perfil
    carregarResumoPainel();
  });
});

/** ===================== MENU POR PERFIL =====================
 * Regras solicitadas:
 *  - Admin: tudo
 *  - RM: cadastro-empresa, agenda-visitas, visitas, empresas, cotacoes,
 *        negocios-fechados, consultar-dicas, visitas-relatorio, vencimentos
 *  - Gerente Chefe: mesmas páginas do RM
 *  - Assistentes: agenda-visitas, visitas, cotacoes, consultar-dicas
 *    (chat-cotacao.htm é acessado dentro de cotações e **não** aparece no menu)
 *  - Demais perfis: nenhum item extra (fallback seguro)
 */
function montarMenuLateral(perfilBruto) {
  const menu = document.getElementById("menuNav");
  if (!menu) return;

  // Limpa o menu antes de montar
  menu.innerHTML = "";

  // Normaliza o texto do perfil (acentos/caixa)
  const perfil = normalizarPerfil(perfilBruto);

  // Catálogo completo (rótulo, href)
  const CATALOGO = {
    "Cadastrar Gerentes":      "cadastro-geral.html",
    "Cadastrar Empresa":       "cadastro-empresa.html",
    "Agências":                "agencias.html",
    "Agenda Visitas":          "agenda-visitas.html",
    "Visitas":                 "visitas.html",
    "Empresas":                "empresas.html",
    "Solicitações de Cotação": "cotacoes.html",
    "Produção":                "negocios-fechados.html",
    "Consultar Dicas":         "consultar-dicas.html",
    "Dicas Produtos":          "dicas-produtos.html",
    "Ramos Seguro":            "ramos-seguro.html",
    "Relatório Visitas":       "visitas-relatorio.html",
    "Vencimentos":             "vencimentos.html",
    "Relatórios":              "relatorios.html"
  };

  // Listas por papel (definidas pelos HREFs)
  const MENU_ADMIN = [
    "cadastro-geral.html",
    "cadastro-empresa.html",
    "agencias.html",
    "agenda-visitas.html",
    "visitas.html",
    "empresas.html",
    "cotacoes.html",
    "negocios-fechados.html",
    "consultar-dicas.html",
    "dicas-produtos.html",
    "ramos-seguro.html",
    "visitas-relatorio.html",
    "vencimentos.html",
    "relatorios.html"
  ];

  const MENU_RM = [
    "cadastro-empresa.html",
    "agenda-visitas.html",
    "visitas.html",
    "empresas.html",
    "cotacoes.html",
    "negocios-fechados.html",
    "consultar-dicas.html",
    "visitas-relatorio.html",
    "vencimentos.html"
  ];

  const MENU_GERENTE_CHEFE = [...MENU_RM]; // mesmas coisas dos RMs

  const MENU_ASSISTENTE = [
    "agenda-visitas.html",
    "visitas.html",
    "cotacoes.html",
    "consultar-dicas.html"
    // chat-cotacao.htm NÃO aparece no menu (acessado dentro de cotações)
  ];

  // Seleciona a lista final conforme perfil
  let listaFinalHrefs = [];
  switch (perfil) {
    case "admin":
      listaFinalHrefs = MENU_ADMIN;
      break;
    case "rm":
      listaFinalHrefs = MENU_RM;
      break;
    case "gerente chefe":
    case "gerente_chefe":
    case "gerente-chefe":
      listaFinalHrefs = MENU_GERENTE_CHEFE;
      break;
    case "assistente":
    case "assistentes":
      listaFinalHrefs = MENU_ASSISTENTE;
      break;
    default:
      // fallback seguro: nada (ou ajuste aqui se quiser algo mínimo)
      listaFinalHrefs = [];
  }

  // Monta os itens do menu na ordem definida pela lista final
  const labelPorHref = inverterCatalogo(CATALOGO); // href -> label
  listaFinalHrefs.forEach(href => {
    const label = labelPorHref[href] || href;
    const a = document.createElement("a");
    a.href = href;
    a.innerHTML = `🔹 ${label}`;
    menu.appendChild(a);
  });
}

function normalizarPerfil(p) {
  return String(p || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase().trim();
}

function inverterCatalogo(cat) {
  const inv = {};
  Object.entries(cat).forEach(([label, href]) => inv[href] = label);
  return inv;
}

/** ===================== RESUMO DO PAINEL (mantido) ===================== */
function carregarResumoPainel() {
  // ============== VISITAS AGENDADAS (PRÓXIMAS 10) — aceita dataHoraTs | dataHoraStr | dataHora ==============
  db.collection("agenda_visitas")
    .get()
    .then(snapshot => {
      const todos = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        let dt = null;

        // ✅ qualquer um dos três formatos funciona
        if (d.dataHoraTs?.toDate) {
          dt = d.dataHoraTs.toDate();
        } else if (d.dataHoraStr) {
          dt = new Date(d.dataHoraStr);
        } else if (d.dataHora) {
          dt = new Date(d.dataHora);
        }

        if (dt && !isNaN(dt) && dt >= new Date()) {
          todos.push({ id: doc.id, ...d, dt });
        }
      });

      todos.sort((a, b) => a.dt - b.dt);
      const proximos = todos.slice(0, 10);

      const ul = document.getElementById("listaVisitasAgendadas");
      ul.innerHTML = "";

      if (proximos.length === 0) {
        ul.innerHTML = "<li>Nenhuma visita agendada.</li>";
        return;
      }

      proximos.forEach(v => {
        const dataFmt = v.dt.toLocaleDateString("pt-BR");
        const horaFmt = v.dt.toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' });
        const empresa = v.empresaNome || "Empresa";
        const rm      = v.rm || "-";
        const tipo    = v.tipo || "-";
        ul.innerHTML += `<li>${dataFmt} ${horaFmt} — <strong>${empresa}</strong> — ${rm} (${tipo})</li>`;
      });
    })
    .catch(err => console.error("Erro Visitas Agendadas:", err));

  // ============== MINHAS COTAÇÕES (ÚLTIMAS 5) ==============
  db.collection("cotacoes-gerentes")
    .orderBy("dataCriacao", "desc").limit(5).get()
    .then(snapshot => {
      const ul = document.getElementById("listaCotacoes");
      ul.innerHTML = "";
      if (snapshot.empty) { ul.innerHTML = "<li>Nenhuma cotação encontrada.</li>"; return; }
      snapshot.forEach(doc => {
        const d = doc.data();
        const valor = parseFloat(d.valorFinal || 0);
        const valorFormatado = `R$ ${valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}`;
        ul.innerHTML += `<li>${d.empresaNome || "Empresa"} - ${d.ramo || "Ramo"} - ${valorFormatado}</li>`;
      });
    })
    .catch(err => console.error("Erro Minhas Cotações:", err));

  // ============== PRODUÇÃO (NEGÓCIOS FECHADOS) — sem índice composto ==============
  db.collection("cotacoes-gerentes")
    .orderBy("dataCriacao", "desc")
    .limit(50)
    .get()
    .then(snapshot => {
      const ul = document.getElementById("listaProducao");
      ul.innerHTML = "";
      if (snapshot.empty) { ul.innerHTML = "<li>Nenhum negócio fechado.</li>"; return; }

      const emitidos = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        if ((d.status || "").toLowerCase() === "negócio emitido".toLowerCase()) emitidos.push(d);
      });

      if (emitidos.length === 0) { ul.innerHTML = "<li>Nenhum negócio fechado.</li>"; return; }
      emitidos.slice(0,5).forEach(d => {
        const valor = parseFloat(d.valorFinal || 0);
        const valorFormatado = `R$ ${valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}`;
        ul.innerHTML += `<li>${d.empresaNome || "Empresa"} - ${d.ramo || "Ramo"} - ${valorFormatado}</li>`;
      });
    })
    .catch(err => console.error("Erro Produção:", err));

  // ============== MINHAS VISITAS (HISTÓRICO ANTIGO) ==============
  db.collection("visitas")
    .orderBy("data", "desc").limit(5).get()
    .then(snapshot => {
      const ul = document.getElementById("listaVisitas");
      ul.innerHTML = "";
      if (snapshot.empty) { ul.innerHTML = "<li>Nenhuma visita encontrado.</li>"; return; }
      snapshot.forEach(doc => {
        const d = doc.data();
        const empresa = d.empresaId || "Empresa";
        const dataFormatada = d.data?.toDate?.().toLocaleDateString("pt-BR") || "Sem data";
        let ramo = "-";
        if (d.ramos?.vida) ramo = "VIDA";
        else if (d.ramos?.frota) ramo = "FROTA";
        ul.innerHTML += `<li>${empresa} - ${ramo} - ${dataFormatada}</li>`;
      });
    })
    .catch(err => console.error("Erro Minhas Visitas:", err));

  // ============== ÚLTIMAS CONVERSAS (INTERAÇÕES) ==============
  const ulConversas = document.getElementById("listaConversas");
  ulConversas.innerHTML = "";
  db.collection("cotacoes-gerentes")
    .orderBy("dataCriacao", "desc")
    .limit(5)
    .get()
    .then(snapshot => {
      if (snapshot.empty) { ulConversas.innerHTML = "<li>Nenhuma conversa recente.</li>"; return; }
      snapshot.forEach(doc => {
        const cotacaoId   = doc.id;
        const cotacaoData = doc.data();
        db.collection("cotacoes-gerentes").doc(cotacaoId)
          .collection("interacoes")
          .orderBy("dataHora", "desc")
          .limit(1)
          .get()
          .then(subSnap => {
            if (subSnap.empty) return;
            subSnap.forEach(subDoc => {
              const i = subDoc.data();
              ulConversas.innerHTML += `<li><strong>${cotacaoData.empresaNome || "Empresa"}</strong>: ${i.mensagem?.slice(0,70) || "Sem mensagem"}</li>`;
            });
          })
          .catch(err => console.error("Erro nas interações:", err));
      });
    })
    .catch(err => console.error("Erro Últimas Conversas:", err));
}
