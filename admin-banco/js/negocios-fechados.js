/* ===== Firebase ===== */
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ===== Estado ===== */
let usuarioAtual = null;
let perfilAtual  = "";
let minhaAgencia = "";
let isAdmin      = false;

let docsBrutos = []; // cotações já normalizadas p/ tabela (apenas “Negócio Emitido”)
const mapaRM   = new Map(); // rmUid -> {nome, agenciaId}
const money = (n)=> (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

/* ===== Utils ===== */
const toISO = (input) => {
  // dd/mm/aaaa -> aaaa-mm-dd (para comparar)
  if (!input) return "";
  const [d,m,y] = String(input).split("/");
  return (y && m && d) ? `${y.padStart(4,"0")}-${m.padStart(2,"0")}-${d.padStart(2,"0")}` : "";
};
const fmtBR = (iso) => iso && iso.includes("-") ? iso.split("-").reverse().join("/") : "-";
const norm  = (s) => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

/* ===== Perfil + agência ===== */
async function carregarPerfil() {
  const u = auth.currentUser;
  if (!u) return;
  usuarioAtual = u;

  const doc = await db.collection("usuarios_banco").doc(u.uid).get();
  const d   = doc.exists ? (doc.data()||{}) : {};
  perfilAtual  = (d.perfil || "").toLowerCase();
  minhaAgencia = d.agenciaId || "";
  isAdmin      = (perfilAtual === "admin") || (u.email === "patrick@retornoseguros.com.br");
}

/* ===== Bootstrap ===== */
auth.onAuthStateChanged(async (user) => {
  if (!user) return (window.location.href = "login.html");

  await carregarPerfil();

  // Assistente não usa esta página
  if (perfilAtual === "assistente") {
    const tbody = document.getElementById("listaNegociosFechados");
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="muted">Seu perfil não possui acesso a Negócios Fechados.</td></tr>`;
    return;
  }

  await coletarCotacoesNoEscopo();  // carrega docsBrutos + mapaRM
  montarCombos();                    // preenche combos RM/Agência/Ramo conforme escopo
  aplicarFiltros();                  // render inicial

  document.getElementById("btnAplicar")?.addEventListener("click", aplicarFiltros);
  document.getElementById("btnLimpar")?.addEventListener("click", () => {
    ["fDataIni","fDataFim","fRm","fAgencia","fRamo","fEmpresa"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    aplicarFiltros();
  });
});

/* ===== Coleta no escopo (RBAC) ===== */
async function coletarCotacoesNoEscopo() {
  docsBrutos = [];
  mapaRM.clear();

  const col = db.collection("cotacoes-gerentes");
  let baseDocs = [];

  // 1) Traz somente cotações com status “Negócio Emitido”
  if (isAdmin) {
    baseDocs = (await col.where("status","==","Negócio Emitido").get()).docs;
  } else if (["gerente-chefe","gerente chefe"].includes(perfilAtual) && minhaAgencia) {
    // Primeiro tento filtrar por agenciaId no servidor;
    // se der erro/índice ausente, pego tudo e filtro no cliente.
    try {
      baseDocs = (await col
        .where("status","==","Negócio Emitido")
        .where("agenciaId","==",minhaAgencia)
        .get()).docs;
    } catch (e) {
      const snap = await col.where("status","==","Negócio Emitido").get();
      baseDocs = snap.docs.filter(d => (d.data().agenciaId || minhaAgencia) === minhaAgencia);
    }
  } else {
    // RM: une várias possibilidades de “dono” e filtra status
    const buckets = [];
    try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).where("status","==","Negócio Emitido").get()); } catch {}
    try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).where("status","==","Negócio Emitido").get()); } catch {}
    try { buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).where("status","==","Negócio Emitido").get()); } catch {}
    try { buckets.push(await col.where("gerenteId","==",usuarioAtual.uid).where("status","==","Negócio Emitido").get()); } catch {}
    try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).where("status","==","Negócio Emitido").get()); } catch {}
    const map = new Map();
    buckets.forEach(s => s?.docs?.forEach(d => { if (d?.id) map.set(d.id, d); }));
    baseDocs = Array.from(map.values());
  }

  // 2) Normaliza docs para a tabela e coleta info de RM/Agência
  for (const doc of baseDocs) {
    const c = doc.data() || {};
    const rmUid  = c.rmUid || c.rmId || c.usuarioId || c.gerenteId || "";
    const rmNome = c.rmNome || c.rm || "-";

    // cache leve de RM -> agência (para filtrar gerente‑chefe quando faltar agenciaId)
    if (rmUid && !mapaRM.has(rmUid)) {
      try {
        const u = await db.collection("usuarios_banco").doc(rmUid).get();
        if (u.exists) {
          const ud = u.data() || {};
          mapaRM.set(rmUid, { nome: ud.nome || rmNome, agenciaId: ud.agenciaId || "" });
        }
      } catch {}
    }

    // valor do prêmio (compat com campos usados no painel)
    const premio = c.valorFinal ?? c.valorNegocio ?? c.premio ?? c.valorDesejado ?? 0;

    docsBrutos.push({
      id: doc.id,
      empresaNome: c.empresaNome || "-",
      ramo:        c.ramo || "-",
      rmUid,
      rmNome,
      agenciaId:   c.agenciaId || "",  // pode estar vazio em legados
      premioLiquido: Number(premio)||0,
      inicioVigencia: (c.vigenciaInicial || c.vigenciaInicio || c.vigencia_de || c.inicioVigencia || ""),
      fimVigencia:    (c.vigenciaFinal   || c.vigenciaFim    || c.vigencia_ate || c.fimVigencia    || "")
    });
  }

  // 3) Filtro extra para gerente‑chefe quando faltar agenciaId no doc:
  if (!isAdmin && ["gerente-chefe","gerente chefe"].includes(perfilAtual) && minhaAgencia) {
    docsBrutos = docsBrutos.filter(d => {
      const ag = d.agenciaId || (mapaRM.get(d.rmUid)?.agenciaId || "");
      return !ag || ag === minhaAgencia;
    });
  }
}

/* ===== UI – combos a partir do escopo atual ===== */
function montarCombos() {
  // RM
  const selRM = document.getElementById("fRm");
  if (selRM) {
    const nomes = Array.from(new Set(docsBrutos.map(d => d.rmNome).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"pt-BR"));
    selRM.innerHTML = `<option value="">Todos</option>` + nomes.map(n=>`<option value="${n}">${n}</option>`).join("");
  }

  // Agência (apenas admin enxerga todas; gerente‑chefe fixa na dele)
  const selAg = document.getElementById("fAgencia");
  if (selAg) {
    if (!isAdmin && ["gerente-chefe","gerente chefe"].includes(perfilAtual) && minhaAgencia) {
      selAg.innerHTML = `<option value="${minhaAgencia}">Minha agência</option>`;
      selAg.disabled  = true;
    } else {
      const agencias = new Set();
      docsBrutos.forEach(d => {
        const ag = d.agenciaId || (mapaRM.get(d.rmUid)?.agenciaId || "");
        if (ag) agencias.add(ag);
      });
      selAg.innerHTML = `<option value="">Todas</option>` + Array.from(agencias).map(a=>`<option value="${a}">${a}</option>`).join("");
    }
  }

  // Ramo
  const selRamo = document.getElementById("fRamo");
  if (selRamo) {
    const ramos = Array.from(new Set(docsBrutos.map(d => d.ramo).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"pt-BR"));
    selRamo.innerHTML = `<option value="">Todos</option>` + ramos.map(r=>`<option value="${r}">${r}</option>`).join("");
  }
}

/* ===== Aplicar filtros + render ===== */
function aplicarFiltros() {
  const di = toISO(document.getElementById("fDataIni")?.value || "");
  const df = toISO(document.getElementById("fDataFim")?.value || "");
  const rmNomeSel = document.getElementById("fRm")?.value || "";
  const agSel     = document.getElementById("fAgencia")?.value || "";
  const ramoSel   = document.getElementById("fRamo")?.value || "";
  const empTxt    = norm(document.getElementById("fEmpresa")?.value || "");

  const lista = docsBrutos.filter(d => {
    // datas (compara por string ISO)
    const ini = toISO(fmtBR(d.inicioVigencia));
    const fim = toISO(fmtBR(d.fimVigencia));
    if (di && (!ini || ini < di)) return false;
    if (df && (!fim || fim > df)) return false;

    if (rmNomeSel && (d.rmNome || "-") !== rmNomeSel) return false;

    if (agSel) {
      const ag = d.agenciaId || (mapaRM.get(d.rmUid)?.agenciaId || "");
      if (ag !== agSel) return false;
    }

    if (ramoSel && d.ramo !== ramoSel) return false;
    if (empTxt && !norm(d.empresaNome).includes(empTxt)) return false;

    return true;
  });

  renderTabela(lista);
  atualizarResumo(lista);
}

function atualizarResumo(lista){
  const infoQtd    = document.getElementById("infoQtd");
  const totalPremio= document.getElementById("totalPremio");
  const soma = lista.reduce((acc,cur)=> acc + (Number(cur.premioLiquido)||0), 0);
  if (infoQtd)     infoQtd.textContent = `${lista.length} negócio(s)`;
  if (totalPremio) totalPremio.textContent = `Total prêmio: ${money(soma)}`;
}

function renderTabela(lista){
  const tbody = document.getElementById("listaNegociosFechados");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sem resultados para os filtros atuais.</td></tr>`;
    return;
  }

  for (const d of lista) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.empresaNome}</td>
      <td>${d.ramo}</td>
      <td>${d.rmNome || "-"}</td>
      <td>${(d.agenciaId || (mapaRM.get(d.rmUid)?.agenciaId || "-"))}</td>
      <td>${money(d.premioLiquido)}</td>
      <td>${fmtBR(toISO(fmtBR(d.inicioVigencia)))}</td>
      <td>${fmtBR(toISO(fmtBR(d.fimVigencia)))}</td>
    `;
    tbody.appendChild(tr);
  }
}
