/* ===========================
   Negócios Fechados (escopos)
   =========================== */

/* Firebase */
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ===== Estado ===== */
let usuarioAtual  = null;
let perfilAtual   = "";     // "admin" | "gerente chefe" | "assistente" | "rm"
let minhaAgencia  = "";
let isAdmin       = false;

let agenciasMap   = {};     // { agenciaId: "Nome — Banco / Cidade - UF" }
let rmsDisponiveis = [];    // [{uid, nome, agenciaId}, ...]

// Status que consideramos “produção/fechado”
const STATUS_PRODUCAO = new Set([
  "Negócio Fechado",
  "Negócio Emitido",
  "Em Emissão"
]);

/* ===== Helpers DOM resilientes (aceitam múltiplos ids) ===== */
const $id = (id) => document.getElementById(id);
function getEl(ids) {
  for (const i of ids) {
    const el = $id(i);
    if (el) return el;
  }
  return null;
}
function getVal(ids) {
  const el = getEl(ids);
  return el ? (el.value || "").trim() : "";
}
function setText(ids, txt) {
  const el = getEl(ids);
  if (el) el.textContent = txt ?? "";
}
function setHTML(ids, html) {
  const el = getEl(ids);
  if (el) el.innerHTML = html ?? "";
}

/* ===== Boot ===== */
window.addEventListener("DOMContentLoaded", () => {
  // Botão “Voltar ao painel” caso não exista
  if (!getEl(["btnVoltarPainel"])) {
    const place = document.querySelector(".page-actions, .header-actions, body");
    if (place) {
      const a = document.createElement("a");
      a.id = "btnVoltarPainel";
      a.href = "painel.html";
      a.textContent = "⟵ Voltar ao Painel";
      a.style.cssText = "display:inline-block;margin:10px 0 0 10px;";
      place.prepend(a);
    }
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) return (window.location.href = "login.html");
    usuarioAtual = user;

    // Perfil + agência
    const up = await db.collection("usuarios_banco").doc(user.uid).get();
    const u  = up.exists ? (up.data() || {}) : {};
    perfilAtual  = ((u.perfil || u.roleId || "") + "").toLowerCase().replace(/[-_]+/g, " ");
    minhaAgencia = u.agenciaId || "";
    isAdmin      = (perfilAtual === "admin") || (user.email === "patrick@retornoseguros.com.br");

    await carregarAgenciasFiltro();
    await carregarRMsFiltro();
    await carregarRamosFiltro();

    instalarHandlers();
    carregarNegocios(); // 1ª carga
  });
});

/* ===== Carregadores de filtros ===== */
async function carregarAgenciasFiltro() {
  const sel = getEl(["filtroAgencia", "agenciaFiltro"]);
  if (!sel) return;

  sel.innerHTML = "";
  if (isAdmin) {
    sel.insertAdjacentHTML("beforeend", `<option value="">Todas as agências</option>`);
  } else {
    // gerente-chefe/assistente/RM: trava na própria
    const minha = minhaAgencia || "";
    sel.insertAdjacentHTML("beforeend", `<option value="${minha}">Minha agência</option>`);
    sel.value = minha;
    sel.disabled = true;
  }

  // Monta rótulos amigáveis SEM UID
  let snap;
  try { snap = await db.collection("agencias_banco").orderBy("nome").get(); }
  catch { snap = await db.collection("agencias_banco").get(); }

  snap.forEach(doc => {
    const a = doc.data() || {};
    const id = doc.id;

    const nome   = (a.nome || "(Sem nome)").toString();
    const banco  = a.banco ? ` — ${a.banco}` : "";
    const cidade = (a.Cidade || a.cidade || "").toString();
    const uf     = (a.estado || a.UF || "").toString().toUpperCase();

    const label = `${nome}${banco}${cidade ? ` / ${cidade}` : ""}${uf ? ` - ${uf}` : ""}`;
    agenciasMap[id] = label;

    if (isAdmin) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = label;
      sel.appendChild(opt);
    }
  });
}

async function carregarRMsFiltro() {
  const sel = getEl(["filtroRM", "rmFiltro"]);
  if (!sel) return;

  // RM não precisa de filtro RM
  if (!isAdmin && !["gerente chefe", "assistente"].includes(perfilAtual)) {
    sel.innerHTML = "";
    sel.style.display = "none";
    return;
  }

  sel.innerHTML = `<option value="">Todos</option>`;
  let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
  if (!isAdmin && minhaAgencia) q = q.where("agenciaId", "==", minhaAgencia);

  const nomes = new Set();
  const snap = await q.get();
  snap.forEach(doc => {
    const d = doc.data() || {};
    const nome = d.nome || "";
    const uid  = doc.id;
    rmsDisponiveis.push({ uid, nome, agenciaId: d.agenciaId || "" });
    if (nome && !nomes.has(nome)) {
      nomes.add(nome);
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      sel.appendChild(opt);
    }
  });
}

async function carregarRamosFiltro() {
  const sel = getEl(["filtroRamo", "ramoFiltro"]);
  if (!sel) return;
  sel.innerHTML = `<option value="">Todos</option>`;
  let snap;
  try { snap = await db.collection("ramos-seguro").orderBy("ordem").get(); }
  catch { snap = await db.collection("ramos-seguro").get(); }
  snap.forEach(doc => {
    const nome = doc.data()?.nomeExibicao || doc.id;
    const opt  = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    sel.appendChild(opt);
  });
}

/* ===== Handlers ===== */
function instalarHandlers() {
  const btnAplicar = getEl(["btnAplicar", "aplicar", "btnFiltrar"]);
  const btnLimpar  = getEl(["btnLimpar", "limpar", "btnClear"]);
  btnAplicar && btnAplicar.addEventListener("click", carregarNegocios);
  btnLimpar  && btnLimpar.addEventListener("click", () => {
    const campos = [
      ["filtroEmpresa", "empresaFiltro"],
      ["filtroRM", "rmFiltro"],
      ["filtroRamo", "ramoFiltro"],
      ["filtroAgencia", "agenciaFiltro"],
      ["filtroInicioDe", "dataInicioDe", "inicioDe"],
      ["filtroInicioAte", "dataInicioAte", "inicioAte"]
    ];
    campos.forEach(ids => {
      const el = getEl(ids);
      if (!el) return;
      if (el.disabled) return; // “Minha agência” travado
      if (el.tagName === "SELECT" || el.tagName === "INPUT") el.value = "";
    });
    carregarNegocios();
  });
}

/* ===== Query + render ===== */
async function listarPorPerfil() {
  const col = db.collection("cotacoes-gerentes");

  // admin vê tudo
  if (isAdmin) {
    const snap = await col.get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
  }

  // gerente-chefe/assistente: por agência
  if (["gerente chefe", "assistente"].includes(perfilAtual) && minhaAgencia) {
    try {
      const snap = await col.where("agenciaId", "==", minhaAgencia).get();
      return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    } catch {
      // fallback: client filter
      const snap = await col.get();
      return snap.docs
        .map(d => ({ id: d.id, ...(d.data() || {}) }))
        .filter(c => (c.agenciaId || minhaAgencia) === minhaAgencia);
    }
  }

  // RM: apenas seus
  const buckets = [];
  try { buckets.push(await col.where("rmId", "==", usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("rmUid", "==", usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("usuarioId", "==", usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("gerenteId", "==", usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("criadoPorUid", "==", usuarioAtual.uid).get()); } catch {}

  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data() || {})));
  return Array.from(map.entries()).map(([id, data]) => ({ id, ...data }));
}

async function carregarNegocios() {
  setText(["statusLista", "lblStatus", "statusMsg"], "Carregando...");
  setText(["totalPremio", "totalPremioSpan"], "R$ 0,00");
  setHTML(["listaNegocios", "tbodyNegocios"], "");

  const filtroAg   = getVal(["filtroAgencia", "agenciaFiltro"]);
  const filtroRM   = getVal(["filtroRM", "rmFiltro"]);       // rmNome
  const filtroRamo = getVal(["filtroRamo", "ramoFiltro"]);
  const filtroEmp  = getVal(["filtroEmpresa", "empresaFiltro"]).toLowerCase();
  const deStr      = getVal(["filtroInicioDe", "dataInicioDe", "inicioDe"]);
  const ateStr     = getVal(["filtroInicioAte", "dataInicioAte", "inicioAte"]);

  let de  = deStr  ? new Date(deStr  + "T00:00:00") : null;
  let ate = ateStr ? new Date(ateStr + "T23:59:59") : null;

  try {
    let docs = await listarPorPerfil();

    // Admin pode trocar agência no filtro
    if (isAdmin && filtroAg) {
      docs = docs.filter(c => (c.agenciaId || "") === filtroAg);
    }

    // Apenas status de produção
    docs = docs.filter(c => STATUS_PRODUCAO.has(String(c.status || "")));

    // Aplicar filtros
    docs = docs.filter(c => {
      if (filtroRM && (c.rmNome || "") !== filtroRM) return false;
      if (filtroRamo && (c.ramo || "") !== filtroRamo) return false;
      if (filtroEmp) {
        const nome = (c.empresaNome || "").toLowerCase();
        if (!nome.includes(filtroEmp)) return false;
      }
      if (de || ate) {
        // usamos inicioVigencia quando existir; se não, ignora datas
        const ini = c.inicioVigencia?.toDate?.() ||
                    (typeof c.inicioVigencia === "string" ? new Date(c.inicioVigencia) : null);
        if (ini) {
          if (de  && ini < de)  return false;
          if (ate && ini > ate) return false;
        }
      }
      return true;
    });

    // Monta linhas
    let totalPremio = 0;
    const rowsHTML = [];
    docs.forEach(c => {
      const agenciaLabel = c.agenciaId ? (agenciasMap[c.agenciaId] || c.agenciaId) : "-";
      const ini = c.inicioVigencia?.toDate?.() ||
                  (typeof c.inicioVigencia === "string" ? new Date(c.inicioVigencia) : null);
      const fim = c.fimVigencia?.toDate?.() ||
                  (typeof c.fimVigencia === "string" ? new Date(c.fimVigencia) : null);

      const premio = typeof c.premio === "number" ? c.premio :
                     typeof c.valorDesejado === "number" ? c.valorDesejado : 0;
      totalPremio += premio || 0;

      rowsHTML.push(`
        <tr>
          <td>${c.empresaNome || "-"}</td>
          <td>${c.ramo || "-"}</td>
          <td>${c.rmNome || "-"}</td>
          <td>${agenciaLabel}</td>
          <td>${premio ? premio.toLocaleString("pt-BR", {style:"currency",currency:"BRL"}) : "-"}</td>
          <td>${ini ? ini.toLocaleDateString("pt-BR") : "-"}</td>
          <td>${fim ? fim.toLocaleDateString("pt-BR") : "-"}</td>
        </tr>
      `);
    });

    setHTML(["listaNegocios", "tbodyNegocios"], rowsHTML.join("") || `
      <tr><td colspan="7" style="text-align:center;color:#666">Nenhum registro no escopo atual.</td></tr>
    `);
    setText(["totalPremio", "totalPremioSpan"], totalPremio.toLocaleString("pt-BR", {style:"currency",currency:"BRL"}));
    setText(["statusLista", "lblStatus", "statusMsg"], `${docs.length} negócio(s) no período.`);
  } catch (e) {
    console.error("Erro ao carregar negócios fechados:", e);
    setText(["statusLista", "lblStatus", "statusMsg"], "Erro ao carregar. Verifique as regras e o login.");
  }
}

/* ===== Exports para HTML (botões) ===== */
window.carregarNegocios = carregarNegocios;
