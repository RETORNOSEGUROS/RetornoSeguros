/* ===== Firebase init ===== */
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ===== Estado ===== */
let usuarioAtual = null;
let perfilAtual  = "";        // "admin" | "gerente chefe" | "assistente" | "rm"
let minhaAgencia = "";
let isAdmin      = false;

let agenciasMap = {};         // {agenciaId: "Nome — Banco / Cidade - UF"}
let rmsCache    = [];         // [{uid, nome, agenciaId}]
let ramosCache  = [];         // ["Ramo A", "Ramo B", ...]

/* ===== Helpers DOM (tolerante a IDs diferentes) ===== */
const first = (...ids) => ids.map(id => document.getElementById(id)).find(Boolean);
const $ = id => document.getElementById(id);

// tenta encontrar elementos por variações de id usadas no projeto
const els = {
  dtIni : () => first("dataInicioDe","iniVigenciaDe","vigenciaDe","dataDe"),
  dtFim : () => first("dataInicioAte","iniVigenciaAte","vigenciaAte","dataAte"),
  selRM : () => first("filtroRM","rm","selectRM"),
  selAg : () => first("filtroAgencia","agencia","selectAgencia"),
  selR  : () => first("filtroRamo","ramo","selectRamo"),
  inpEmp: () => first("filtroEmpresa","empresaBusca","empresaNome","empresa"),
  tbody : () => first("listaNegocios","tbodyLista","lista"),
  total : () => first("totalPremio","badgeTotalPremio"),
  status: () => first("statusLista","status"),
  btnAplicar: () => first("btnAplicar","aplicar","btnFiltrar"),
  btnLimpar : () => first("btnLimpar","limpar"),
  voltar   : () => first("voltarPainel","btnVoltar","voltar")
};

/* ===== Utils ===== */
const roleNorm = s => (s||"").toString().normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[-_]+/g," ").trim();
const toDate   = ts => ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : (ts ? new Date(ts) : null));
const moneyBR  = v => Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

/* ===== Boot ===== */
auth.onAuthStateChanged(async (user) => {
  if (!user) return (window.location.href = "login.html");
  usuarioAtual = user;

  // perfil + agência
  const up = await db.collection("usuarios_banco").doc(user.uid).get();
  const u  = up.exists ? (up.data()||{}) : {};
  perfilAtual  = roleNorm(u.perfil || u.roleId || "");
  minhaAgencia = u.agenciaId || "";
  isAdmin      = (perfilAtual === "admin") || (user.email === "patrick@retornoseguros.com.br");

  // botão voltar (opcional)
  const v = els.voltar();
  if (v) v.addEventListener("click", (e) => { e.preventDefault(); window.location.href = "painel.html"; });

  await Promise.all([
    carregarAgencias(),
    carregarRMs(),
    carregarRamos()
  ]);

  instalarUI();
  carregarLista();
});

/* ===== Carregadores de catálogos ===== */
async function carregarAgencias() {
  const sel = els.selAg();
  if (sel) sel.innerHTML = "";

  // opção inicial
  if (isAdmin) {
    sel?.insertAdjacentHTML("beforeend", `<option value="">Todas as agências</option>`);
  } else if (sel) {
    const minha = minhaAgencia || "";
    sel.insertAdjacentHTML("beforeend", `<option value="${minha}">Minha agência</option>`);
    sel.value = minha;
    sel.disabled = true;
  }

  let snap;
  try {
    snap = await db.collection("agencias_banco").orderBy("nome").get();
    if (snap.empty) snap = await db.collection("agencias_banco").get();
  } catch {
    snap = await db.collection("agencias_banco").get();
  }

  snap.forEach(doc => {
    const a = doc.data() || {};
    const id = doc.id;
    const nome   = (a.nome || "(Sem nome)").toString();
    const banco  = a.banco ? ` — ${a.banco}` : "";
    const cidade = (a.Cidade || a.cidade || "").toString();
    const cidadeFmt = cidade ? ` / ${cidade}` : "";
    const uf = (a.estado || a.UF || "").toString().toUpperCase();
    const ufFmt = uf ? ` - ${uf}` : "";
    const label = `${nome}${banco}${cidadeFmt}${ufFmt}`;

    agenciasMap[id] = label;

    if (isAdmin && sel) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = label;
      sel.appendChild(opt);
    }
  });
}

async function carregarRMs() {
  const sel = els.selRM();
  if (!sel) return;

  sel.innerHTML = `<option value="">Todos os RMs</option>`;

  let q = db.collection("usuarios_banco").where("perfil","==","rm");
  if (!isAdmin && minhaAgencia) q = q.where("agenciaId","==",minhaAgencia);
  const snap = await q.get();

  rmsCache = [];
  snap.forEach(d => {
    const u = d.data()||{};
    rmsCache.push({ uid:d.id, nome:u.nome||"(sem nome)", agenciaId:u.agenciaId||"" });
  });
  rmsCache
    .sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR"))
    .forEach(rm=>{
      const opt=document.createElement("option");
      opt.value = rm.uid;  // filtraremos por UID, mais preciso
      opt.textContent = rm.nome;
      sel.appendChild(opt);
    });
}

async function carregarRamos() {
  const sel = els.selR();
  if (!sel) return;
  sel.innerHTML = `<option value="">Todos os ramos</option>`;
  let snap;
  try { snap = await db.collection("ramos-seguro").orderBy("ordem").get(); }
  catch { snap = await db.collection("ramos-seguro").get(); }
  ramosCache = [];
  snap.forEach(d=>{
    const nome = d.data()?.nomeExibicao || d.id;
    ramosCache.push(nome);
  });
  ramosCache.sort((a,b)=>a.localeCompare(b,"pt-BR"))
            .forEach(n => sel.insertAdjacentHTML("beforeend", `<option value="${n}">${n}</option>`));
}

/* ===== UI ===== */
function instalarUI() {
  els.btnAplicar()?.addEventListener("click", (e)=>{ e.preventDefault(); carregarLista(); });
  els.btnLimpar()?.addEventListener("click", (e)=>{ 
    e.preventDefault();
    if (isAdmin) { const a=els.selAg(); if (a) a.value=""; }
    const r=els.selRM(); if (r) r.value="";
    const rm=els.selR(); if (rm) rm.value="";
    const t=els.inpEmp(); if (t) t.value="";
    const di=els.dtIni(); if (di) di.value="";
    const df=els.dtFim(); if (df) df.value="";
    carregarLista();
  });
}

/* ===== Listagem =====
   Estrutura esperada em cada doc da coleção "negocios-fechados":
   {
     empresaNome, ramo, premio, inicioVigencia (Timestamp), fimVigencia (Timestamp),
     agenciaId, rmUid, rmNome
   }
   Se algum campo estiver com outro nome no seu banco, o render continua
   funcionando (usa defaults), e os filtros extras serão aplicados em memória.
*/
async function listarBasePorPerfil() {
  const col = db.collection("negocios-fechados");

  // Escopo por perfil
  if (isAdmin) {
    const snap = await col.get();
    return snap.docs.map(d=>({id:d.id, ...(d.data()||{})}));
  }

  if (["gerente chefe","assistente"].includes(perfilAtual)) {
    if (minhaAgencia) {
      try {
        const snap = await col.where("agenciaId","==",minhaAgencia).get();
        return snap.docs.map(d=>({id:d.id, ...(d.data()||{})}));
      } catch(e) {
        // fallback: filtra cliente
        const snap = await col.get();
        return snap.docs.map(d=>({id:d.id, ...(d.data()||{})}))
                        .filter(n => (n.agenciaId||minhaAgencia)===minhaAgencia);
      }
    }
    const snap = await col.get();
    return snap.docs.map(d=>({id:d.id, ...(d.data()||{})}));
  }

  // RM: pega por rmUid (e mais alguns possíveis nomes de campos)
  const buckets = [];
  try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).get()); } catch {}
  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data())));
  return Array.from(map.entries()).map(([id,data])=>({id,...data}));
}

async function carregarLista() {
  const tbody = els.tbody();
  const badge = els.total();
  const status= els.status();
  if (tbody) tbody.innerHTML = `<tr><td colspan="8">Carregando...</td></tr>`;
  if (status) status.textContent = "Carregando...";

  try {
    // base por perfil
    let rows = await listarBasePorPerfil();

    // filtros UI
    const agUI = els.selAg(); const filtroAg = agUI && !agUI.disabled ? (agUI.value||"") : (isAdmin ? "" : (minhaAgencia||""));
    const rmUI = els.selRM(); const filtroRM = rmUI ? (rmUI.value||"") : "";
    const rrUI = els.selR();  const filtroR  = rrUI ? (rrUI.value||"")  : "";
    const txUI = els.inpEmp();const busca    = (txUI ? txUI.value : "").toLowerCase().trim();
    const diUI = els.dtIni(); const diVal    = diUI && diUI.value ? new Date(diUI.value) : null;
    const dfUI = els.dtFim(); const dfVal    = dfUI && dfUI.value ? new Date(dfUI.value+"T23:59:59") : null;

    // aplica filtros em memória (evita problemas de índice)
    rows = rows.filter(n => {
      if (filtroAg && (n.agenciaId||"") !== filtroAg) return false;
      if (filtroRM && (n.rmUid||n.rmId||"") !== filtroRM) return false;
      if (filtroR  && (n.ramo||"") !== filtroR) return false;
      if (busca) {
        const nome = (n.empresaNome || "").toString().toLowerCase();
        if (!nome.includes(busca)) return false;
      }
      const ini = toDate(n.inicioVigencia);
      if (diVal && ini && ini < diVal) return false;
      if (dfVal && ini && ini > dfVal) return false;
      return true;
    });

    // render
    let total = 0;
    const html = rows.map(n => {
      const empresa = n.empresaNome || "-";
      const ramo    = n.ramo || "-";
      const rmNome  = n.rmNome || "-";
      const agLabel = n.agenciaId ? (agenciasMap[n.agenciaId] || n.agenciaId) : "-";
      const premioN = Number(n.premio || n.premioTotal || 0) || 0;
      total += premioN;
      const ini = toDate(n.inicioVigencia)?.toLocaleDateString("pt-BR") || "-";
      const fim = toDate(n.fimVigencia)?.toLocaleDateString("pt-BR")    || "-";
      return `<tr>
        <td data-label="Empresa">${empresa}</td>
        <td data-label="Ramo">${ramo}</td>
        <td data-label="RM">${rmNome}</td>
        <td data-label="Agência">${agLabel}</td>
        <td data-label="Prêmio">${moneyBR(premioN)}</td>
        <td data-label="Início">${ini}</td>
        <td data-label="Fim">${fim}</td>
      </tr>`;
    }).join("");

    if (tbody) {
      tbody.innerHTML = html || `<tr><td colspan="8">Nenhum registro no escopo atual.</td></tr>`;
    }
    if (badge) badge.textContent = moneyBR(total);
    if (status) status.textContent = `${rows.length} negócio(s) listado(s).`;
  } catch (e) {
    console.error("Erro ao carregar negócios fechados:", e);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8">Erro ao carregar. Verifique as permissões/regras.</td></tr>`;
    if (els.total()) els.total().textContent = moneyBR(0);
    if (status) status.textContent = `Erro ao carregar.`;
  }
}
