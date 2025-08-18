/* ============================
   Negócios Fechados (gerente-chefe por agência)
   Fonte: cotacoes-gerentes
   ============================ */

/* Firebase */
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* Estado */
let usuarioAtual = null;
let perfilAtual  = "";           // admin | gerente chefe | rm | assistente
let minhaAgencia = "";
let isAdmin      = false;

let agenciasMap  = {};           // {agenciaId: "Nome — Banco / Cidade - UF"}
let filtroRMCache = [];          // [{uid, nome, agenciaId}]
let totalPremio  = 0;

/* Config: que status contam como “fechados” */
const CLOSED_STATUSES = new Set(["Negócio Emitido", "Negócio Fechado"]);

/* Helpers DOM */
const $  = (id) => document.getElementById(id);
const txt = (el, v) => { if (el) el.textContent = v ?? ""; };

/* Normalizadores */
const normalize = (s) =>
  (s || "").toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();
const roleNorm = (s) => normalize(s).replace(/[-_]+/g, " ");

/* Boot */
window.addEventListener("DOMContentLoaded", () => {
  // Garantir um link “Voltar ao Painel” quando o HTML não tiver
  if (!document.querySelector('[data-js="voltar-painel"]')) {
    const a = document.createElement("a");
    a.href = "painel.html";
    a.textContent = "← Voltar ao Painel";
    a.style.display = "inline-block";
    a.style.margin = "8px 0 4px";
    a.setAttribute("data-js","voltar-painel");
    const container = document.querySelector("h1, h2, .page-title, body");
    (container || document.body).insertAdjacentElement("afterbegin", a);
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) return (window.location.href = "login.html");
    usuarioAtual = user;

    const ctx = await getPerfilAgencia();
    perfilAtual  = ctx.perfil;          // já normalizado
    minhaAgencia = ctx.agenciaId;
    isAdmin      = ctx.isAdmin;

    try {
      await Promise.all([
        carregarAgencias(),
        carregarFiltroRMs(),
        carregarRamos()
      ]);
      await carregarLista();  // primeira carga
    } catch (e) {
      console.error("Falha inicial:", e);
    }

    // Botões
    $("btnAplicar")?.addEventListener("click", carregarLista);
    $("btnLimpar")?.addEventListener("click", () => {
      ["dtIni","dtFim","filtroEmpresa","filtroRamo"].forEach(id => { const el=$(id); if (el) el.value=""; });
      const ag = $("filtroAgencia");
      const rm = $("filtroRM");
      if (ag && !isAdmin) { ag.value = minhaAgencia || ""; }
      if (ag && isAdmin) { ag.value = ""; }
      if (rm) rm.value = "";
      carregarLista();
    });
  });
});

/* Perfil + agência do usuário */
async function getPerfilAgencia() {
  const user = auth.currentUser;
  if (!user) return { perfil: "", agenciaId: "", isAdmin: false };
  const snap = await db.collection("usuarios_banco").doc(user.uid).get();
  const u = snap.exists ? (snap.data() || {}) : {};
  const perfil = roleNorm(u.perfil || u.roleId || "");
  const agenciaId = u.agenciaId || "";
  const admin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");
  return { perfil, agenciaId, isAdmin: admin };
}

/* Agências para filtro + rótulos (SEM UID no label) */
async function carregarAgencias() {
  const sel = $("filtroAgencia");
  if (sel) sel.innerHTML = "";

  // linha topo
  if (isAdmin) {
    sel?.insertAdjacentHTML("beforeend", `<option value="">Todas as agências</option>`);
  } else {
    const minha = minhaAgencia || "";
    sel?.insertAdjacentHTML("beforeend", `<option value="${minha}">Minha agência</option>`);
    if (sel) { sel.value = minha; sel.disabled = true; }
  }

  let qs;
  try { qs = await db.collection("agencias_banco").orderBy("nome").get(); }
  catch { qs = await db.collection("agencias_banco").get(); }

  qs.forEach(doc => {
    const a = doc.data() || {};
    const id = doc.id;
    const nome   = (a.nome || "(Sem nome)").toString();
    const banco  = a.banco ? ` — ${a.banco}` : "";
    const cidade = (a.Cidade || a.cidade || "").toString();
    const cidadeFmt = cidade ? ` / ${cidade}` : "";
    const uf = (a.estado || a.UF || "").toString().toUpperCase();
    const ufFmt = uf ? ` - ${uf}` : "";
    const rotulo = `${nome}${banco}${cidadeFmt}${ufFmt}`;

    agenciasMap[id] = rotulo;

    if (isAdmin && sel) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = rotulo;
      sel.appendChild(opt);
    }
  });
}

/* RMs para filtro (apenas admin/chefe/assistente) */
async function carregarFiltroRMs() {
  const sel = $("filtroRM");
  if (!sel) return;

  if (!isAdmin && !["gerente chefe","assistente"].includes(perfilAtual)) {
    sel.innerHTML = ""; sel.style.display = "none"; return;
  }

  sel.innerHTML = `<option value="">Todos</option>`;
  filtroRMCache = [];

  try {
    let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
    if (!isAdmin && minhaAgencia) q = q.where("agenciaId","==",minhaAgencia);
    const snap = await q.get();

    const nomes = new Set();
    snap.forEach(doc => {
      const u = doc.data() || {};
      const nome = u.nome || "";
      if (nome && !nomes.has(nome)) {
        nomes.add(nome);
        filtroRMCache.push({ uid: doc.id, nome, agenciaId: u.agenciaId || "" });
        const opt = document.createElement("option");
        opt.value = nome; opt.textContent = nome;
        sel.appendChild(opt);
      }
    });
  } catch (e) {
    console.warn("Filtro RM:", e);
  }
}

/* Ramos (opcional) */
async function carregarRamos() {
  const sel = $("filtroRamo");
  if (!sel) return;
  sel.innerHTML = `<option value="">Todos</option>`;

  try {
    let snap;
    try { snap = await db.collection("ramos-seguro").orderBy("ordem").get(); }
    catch { snap = await db.collection("ramos-seguro").get(); }
    snap.forEach(doc => {
      const nome = doc.data()?.nomeExibicao || doc.id;
      const opt = document.createElement("option");
      opt.value = nome; opt.textContent = nome;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn("Ramos:", e);
  }
}

/* Util: label de agência pelo id */
function agenciaLabel(id) {
  return id ? (agenciasMap[id] || id) : "-";
}

/* Carrega dados visíveis conforme perfil */
async function listarVisiveisPorPerfil() {
  const col = db.collection("cotacoes-gerentes");

  // ADMIN: todos
  if (isAdmin) {
    const snap = await col.get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data()) }));
  }

  // GERENTE-CHEFE / ASSISTENTE: pela agência
  if (["gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
    try {
      const snap = await col.where("agenciaId","==",minhaAgencia).get();
      return snap.docs.map(d => ({ id: d.id, ...(d.data()) }));
    } catch (e) {
      // fallback sem índice: filtra no cliente
      const snap = await col.get();
      return snap.docs
        .map(d => ({ id: d.id, ...(d.data()) }))
        .filter(c => (c.agenciaId || minhaAgencia) === minhaAgencia);
    }
  }

  // RM: por vários campos de posse/autoria
  const buckets = [];
  try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("gerenteId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch {}

  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data())));
  return Array.from(map.entries()).map(([id, data]) => ({ id, ...data }));
}

/* Carregar / filtrar / renderizar */
async function carregarLista() {
  const tbody = $("tbodyNegocios");
  const totalBadge = $("totalPremio");
  totalPremio = 0;

  if (tbody) tbody.innerHTML = `<tr><td colspan="7">Carregando...</td></tr>`;

  try {
    const dtIni  = $("dtIni")?.value || "";
    const dtFim  = $("dtFim")?.value || "";
    const selRM  = $("filtroRM")?.value || "";           // nome do RM
    const selAg  = $("filtroAgencia")?.value || "";      // agenciaId (admin pode mudar)
    const selRamo= $("filtroRamo")?.value || "";
    const empTxt = normalize($("filtroEmpresa")?.value || "");

    let docs = await listarVisiveisPorPerfil();

    // Admin pode trocar agência
    if (isAdmin && selAg) docs = docs.filter(d => (d.agenciaId || "") === selAg);

    // Filtra somente “fechados” (status finais)
    docs = docs.filter(d => CLOSED_STATUSES.has((d.status || "").trim()));

    // Demais filtros
    docs = docs.filter(d => {
      // Empresa (texto)
      if (empTxt) {
        const alvo = normalize(d.empresaNome || "");
        if (!alvo.includes(empTxt)) return false;
      }
      // Ramo
      if (selRamo && (d.ramo || "") !== selRamo) return false;
      // RM (por nome)
      if (selRM && (d.rmNome || "") !== selRM) return false;
      // Vigência (compara campo inicioVigencia)
      const inicioVig = d.inicioVigencia?.toDate?.() || (d.inicioVigencia instanceof Date ? d.inicioVigencia : null);
      if (dtIni) {
        const x = inicioVig || d.dataCriacao?.toDate?.() || null;
        if (x && x < new Date(dtIni)) return false;
      }
      if (dtFim) {
        const x = inicioVig || d.dataCriacao?.toDate?.() || null;
        if (x && x > new Date(dtFim + "T23:59:59")) return false;
      }
      return true;
    });

    // Monta linhas
    const rows = docs.map(d => {
      const inicio = d.inicioVigencia?.toDate?.() || null;
      const fim    = d.fimVigencia?.toDate?.()    || null;
      const premioNum = (typeof d.premio === "number" && d.premio > 0)
        ? d.premio
        : (typeof d.valorDesejado === "number" ? d.valorDesejado : 0);

      totalPremio += premioNum;

      return {
        id: d.id,
        empresa: d.empresaNome || "-",
        ramo: d.ramo || "-",
        rm: d.rmNome || "-",
        agencia: agenciaLabel(d.agenciaId),
        premioFmt: premioNum ? premioNum.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "-",
        iniFmt: inicio ? inicio.toLocaleDateString("pt-BR") : "-",
        fimFmt: fim ? fim.toLocaleDateString("pt-BR") : "-"
      };
    });

    // Render
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7">Sem resultados para os filtros atuais.</td></tr>`;
    } else {
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td data-label="Empresa">${r.empresa}</td>
          <td data-label="Ramo">${r.ramo}</td>
          <td data-label="RM">${r.rm}</td>
          <td data-label="Agência">${r.agencia}</td>
          <td data-label="Prêmio">${r.premioFmt}</td>
          <td data-label="Início">${r.iniFmt}</td>
          <td data-label="Fim">${r.fimFmt}</td>
        </tr>
      `).join("");
    }

    if (totalBadge) {
      totalBadge.textContent = totalPremio.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
    }
  } catch (e) {
    console.error("Erro ao carregar negócios fechados:", e);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">Erro ao carregar. Verifique as permissões/regras.</td></tr>`;
  }
}

/* Exports (se seus botões usam onclick no HTML) */
window.carregarLista = carregarLista;
