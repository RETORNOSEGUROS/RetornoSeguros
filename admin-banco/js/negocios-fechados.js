/* ============================
   Negócios Fechados (drop‑in)
   ============================ */

/* Firebase */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* ======== Config ======== */
// nomes de status considerados “negócio fechado”
const FECHADOS_STATUS = [
  "Negócio Fechado",
  "Negócio fechado",
  "Negócio fechado / Em Emissão",
  "Emissão",
  "Em Emissão"
];

// ids/nomes alternativos aceitos para cada campo da sua tela
const IDS = {
  dataIni:  ["fDataIni","iniDe","inicioDe","dataIni","dtIni"],
  dataFim:  ["fDataFim","iniAte","inicioAte","dataFim","dtFim"],
  selRM:    ["fRm","filtroRm","rm","selectRm","rmSelect"],
  selAg:    ["fAgencia","filtroAgencia","agencia","agenciaId","selAgencia"],
  selRamo:  ["fRamo","filtroRamo","ramo","ramoId","selRamo"],
  txtEmp:   ["fEmpresa","filtroEmpresa","empresa","empresaNome","txtEmpresa"],
  btnVoltar:["btnVoltarPainel","voltarPainel"]
};

// helper para achar o 1º elemento existente entre várias opções de id
function $(cands) {
  for (const id of cands) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

// DOM (tenta múltiplos ids – não precisa alterar HTML)
const elDataIni  = $(IDS.dataIni);
const elDataFim  = $(IDS.dataFim);
const elSelRM    = $(IDS.selRM);
const elSelAg    = $(IDS.selAg);
const elSelRamo  = $(IDS.selRamo);
const elTxtEmp   = $(IDS.txtEmp);

// tabela e total
const tbody      = document.querySelector("#tabela-negocios tbody") || document.querySelector("tbody");
const chipTotal  = document.getElementById("totalPremioChip");

// estado atual
let PERFIL   = "";
let MY_UID   = "";
let MY_NAME  = "";
let MY_AGID  = "";
let IS_ADMIN = false;

// caches leves
const cacheEmpresasDaAgencia = new Map(); // agenciaId -> [empresaId, ...]
const cacheRMsDaAgencia       = new Map(); // agenciaId -> [{uid,nome}, ...]
const cacheEmpresaDoc         = new Map(); // empresaId -> {nome,agenciaId,...}

// utils
const money = v => (typeof v==="number" ? v : 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmt   = d => d && d.toDate ? d.toDate() : (d instanceof Date ? d : null);
function toStart(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function toEnd(d){ const x=new Date(d); x.setHours(23,59,59,999); return x; }

// monta botão voltar (sem depender do HTML)
(function ensureVoltar(){
  if (!$(IDS.btnVoltar)) {
    const a = document.createElement("a");
    a.href = "painel.html";
    a.id = "btnVoltarPainel";
    a.className = "btn-voltar-painel";
    a.style.display = "inline-block";
    a.style.margin = "12px 0 0 12px";
    a.textContent = "← Voltar ao Painel";
    const h1 = document.querySelector("h1, .page-title, .titulo") || document.body;
    h1.parentNode.insertBefore(a, h1);
  }
})();

// auth
auth.onAuthStateChanged(async (user)=>{
  if(!user){ return (window.location.href="login.html"); }
  MY_UID   = user.uid;
  IS_ADMIN = (user.email === "patrick@retornoseguros.com.br");

  const uSnap = await db.collection("usuarios_banco").doc(MY_UID).get();
  const u     = uSnap.exists ? (uSnap.data()||{}) : {};
  PERFIL  = (u.perfil||"").toLowerCase();   // "admin", "rm", "gerente-chefe", etc
  MY_AGID = u.agenciaId || "";
  MY_NAME = u.nome || "";

  await prepararFiltrosRMeAgencia();

  // eventos de filtro
  [elDataIni, elDataFim, elSelRM, elSelAg, elSelRamo, elTxtEmp]
    .filter(Boolean)
    .forEach(el => el.addEventListener("change", () => carregar()));

  // carrega
  await carregar();
});

/* =============================
   Carregamento / Filtros (UI)
   ============================= */
async function prepararFiltrosRMeAgencia(){
  // Agências (apenas se houver select na tela — você já lista todas aí)
  if (elSelAg && elSelAg.options.length === 0) {
    // mantém padrão “Todas”
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Todas";
    elSelAg.appendChild(opt);

    const agSnap = await db.collection("agencias_banco").orderBy("nome").get().catch(()=>db.collection("agencias_banco").get());
    agSnap.forEach(d=>{
      const a = d.data()||{};
      const banco  = a.banco?` — ${a.banco}`:"";
      const cidade = (a.Cidade||a.cidade||"");
      const uf     = (a.estado||a.UF||"");
      const rotulo = `${a.nome||"(Sem nome)"}${banco}${cidade?` / ${cidade}`:""}${uf?` - ${uf}`:""}`;
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = rotulo;
      elSelAg.appendChild(o);
    });

    // gerente‑chefe: fixa na sua agência
    if (!IS_ADMIN && PERFIL.includes("gerente")) {
      elSelAg.value = MY_AGID || "";
      elSelAg.disabled = true;
    }
  }

  // RMs
  if (elSelRM) {
    elSelRM.innerHTML = "";
    const optTodos = document.createElement("option");
    optTodos.value = "";
    optTodos.textContent = "Todos";
    elSelRM.appendChild(optTodos);

    if (IS_ADMIN) {
      // todos os RMs
      const snap = await db.collection("usuarios_banco").where("perfil","in",["rm","RM (Gerente de Conta)"]).get();
      snap.forEach(d=>{
        const u=d.data()||{};
        const o=document.createElement("option");
        o.value=d.id;
        o.textContent=u.nome||"(sem nome)";
        elSelRM.appendChild(o);
      });
    } else if (PERFIL.includes("gerente")) {
      // só RMs da agência do gerente‑chefe
      const lista = await rmsDaAgencia(MY_AGID);
      for (const rm of lista) {
        const o=document.createElement("option");
        o.value=rm.uid;
        o.textContent=rm.nome||"(sem nome)";
        elSelRM.appendChild(o);
      }
    } else if (PERFIL==="rm") {
      const o=document.createElement("option");
      o.value=MY_UID;
      o.textContent=MY_NAME||"(Eu)";
      elSelRM.appendChild(o);
      elSelRM.value = MY_UID;
      elSelRM.disabled = true;
    }
  }
}

// util: RMs por agência com cache
async function rmsDaAgencia(agenciaId){
  if (!agenciaId) return [];
  if (cacheRMsDaAgencia.has(agenciaId)) return cacheRMsDaAgencia.get(agenciaId);
  const res=[];
  const snap = await db.collection("usuarios_banco")
    .where("perfil","==","rm")
    .where("agenciaId","==",agenciaId)
    .get();
  snap.forEach(d=>res.push({uid:d.id, nome:(d.data()||{}).nome||""}));
  cacheRMsDaAgencia.set(agenciaId,res);
  return res;
}

// util: empresas por agência com cache (retorna array de ids)
async function empresasDaAgencia(agenciaId){
  if (!agenciaId) return [];
  if (cacheEmpresasDaAgencia.has(agenciaId)) return cacheEmpresasDaAgencia.get(agenciaId);
  const ids=[];
  const snap = await db.collection("empresas").where("agenciaId","==",agenciaId).get();
  snap.forEach(d=>ids.push(d.id));
  cacheEmpresasDaAgencia.set(agenciaId,ids);
  return ids;
}

/* ============================
   Carregar lista (principal)
   ============================ */
async function carregar(){
  // feedback
  if (tbody) { tbody.innerHTML = `<tr><td colspan="7">Carregando...</td></tr>`; }
  if (chipTotal) chipTotal.textContent = money(0);

  // filtros
  const di = elDataIni?.value ? toStart(elDataIni.value) : null;
  const df = elDataFim?.value ? toEnd(elDataFim.value)   : null;
  const fRM   = elSelRM?.value || "";
  const fAg   = elSelAg?.value || "";
  const fRamo = elSelRamo?.value || "";
  const fEmp  = (elTxtEmp?.value || "").trim().toLowerCase();

  // 1) busca base conforme papel
  let docs = [];
  if (IS_ADMIN) {
    docs = await buscarPorQueryPadrao(di, df, fRM, fAg, fRamo, fEmp);
  } else if (PERFIL==="rm") {
    docs = await buscarComoRM(di, df, fRM || MY_UID, fRamo, fEmp);
  } else if (PERFIL.includes("gerente")) {
    docs = await buscarComoGerenteChefe(di, df, fRM, fRamo, fEmp);
  } else {
    docs = []; // sem papel conhecido
  }

  // 2) monta tabela + total
  let total = 0;
  if (!docs.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">Sem resultados para os filtros atuais.</td></tr>`;
    if (chipTotal) chipTotal.textContent = money(0);
    return;
  }

  const linhas = [];
  for (const d of docs) {
    // somente status “fechados”
    if (!FECHADOS_STATUS.includes(d.status)) continue;

    const premio = Number(d.premioLiquido || 0);
    total += premio;

    // resolve nome da empresa (cache)
    const emp = await getEmpresa(d.empresaId);
    const agRot = await agenciaRotuloPorEmpresa(emp);

    linhas.push({
      empresa: emp?.nome || d.empresaNome || "-",
      ramo:    d.ramo || "-",
      rm:      d.rmNome || "-",
      agencia: agRot || "-",
      premio:  premio,
      inicio:  d.inicioVigencia ? fmt(d.inicioVigencia) : null,
      fim:     d.fimVigencia ? fmt(d.fimVigencia) : null
    });
  }

  // render
  if (tbody) {
    tbody.innerHTML = "";
    for (const li of linhas) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${li.empresa}</td>
        <td>${li.ramo}</td>
        <td>${li.rm}</td>
        <td>${li.agencia}</td>
        <td>${money(li.premio)}</td>
        <td>${li.inicio ? li.inicio.toLocaleDateString("pt-BR") : "-"}</td>
        <td>${li.fim ? li.fim.toLocaleDateString("pt-BR") : "-"}</td>
      `;
      tbody.appendChild(tr);
    }
  }
  if (chipTotal) chipTotal.textContent = money(total);
}

/* ============================
   Estratégias de busca
   ============================ */

// ADMIN: aplica filtros direto na coleção (usa agenciaId SE existir; se não existir não filtra por agência)
async function buscarPorQueryPadrao(di, df, fRM, fAg, fRamo, fEmp){
  let q = db.collection("cotacoes-gerentes");

  if (di) q = q.where("inicioVigencia", ">=", di);
  if (df) q = q.where("inicioVigencia", "<=", df);
  if (fRM) q = q.where("rmUid", "==", fRM);
  if (fRamo) q = q.where("ramo", "==", fRamo);

  // para admin, não filtra por agência aqui (docs podem não ter agenciaId)
  const snap = await q.get();

  const arr = [];
  snap.forEach(d=>{
    const x = d.data()||{};
    // filtro “empresa contém”
    if (fEmp && !( (x.empresaNome||"").toLowerCase().includes(fEmp) )) return;
    // se filtro de agência foi escolhido manualmente, validamos pelo empresaId
    if (elSelAg && elSelAg.value) {
      if (x.empresaId) {
        // confere agência da empresa
        arr.push({id:d.id,...x});
      } else {
        arr.push({id:d.id,...x}); // mantém (sem empresaId não dá para cruzar)
      }
    } else {
      arr.push({id:d.id,...x});
    }
  });

  // caso “agência escolhida” pelo admin: pós‑filtro pelo empresaId
  if (elSelAg && elSelAg.value) {
    const ag = elSelAg.value;
    const out=[];
    for (const d of arr) {
      if (!d.empresaId) { out.push(d); continue; }
      const emp = await getEmpresa(d.empresaId);
      if (emp?.agenciaId === ag) out.push(d);
    }
    return out;
  }
  return arr;
}

// RM: força rmUid do usuário
async function buscarComoRM(di, df, rmUid, fRamo, fEmp){
  let q = db.collection("cotacoes-gerentes").where("rmUid","==",rmUid);
  if (di) q = q.where("inicioVigencia", ">=", di);
  if (df) q = q.where("inicioVigencia", "<=", df);
  if (fRamo) q = q.where("ramo","==",fRamo);
  const snap = await q.get();

  const arr=[];
  snap.forEach(d=>{
    const x=d.data()||{};
    if (fEmp && !( (x.empresaNome||"").toLowerCase().includes(fEmp) )) return;
    arr.push({id:d.id,...x});
  });
  return arr;
}

// GERENTE‑CHEFE: busca pelas empresas da própria agência, em lotes (empresaId in [...])
async function buscarComoGerenteChefe(di, df, fRM, fRamo, fEmp){
  const empresaIds = await empresasDaAgencia(MY_AGID);
  if (!empresaIds.length) return [];

  // se gerente selecionou um RM específico filtramos depois (nem sempre podemos compor com in)
  const chunks = [];
  for (let i=0;i<empresaIds.length;i+=10) chunks.push(empresaIds.slice(i,i+10));

  const arr=[];
  for (const c of chunks) {
    let q = db.collection("cotacoes-gerentes").where("empresaId","in",c);
    if (di) q = q.where("inicioVigencia", ">=", di);
    if (df) q = q.where("inicioVigencia", "<=", df);
    // não dá para usar outro “in” (limite do Firestore), então fRM e fRamo filtramos depois
    const snap = await q.get();
    snap.forEach(d=>arr.push({id:d.id,...(d.data()||{})}));
  }

  // pós‑filtro por RM, Ramo e “empresa contém”
  const out=[];
  for (const x of arr) {
    if (fRM   && x.rmUid !== fRM) continue;
    if (fRamo && (x.ramo||"") !== fRamo) continue;
    if (fEmp  && !( (x.empresaNome||"").toLowerCase().includes(fEmp) )) continue;
    out.push(x);
  }
  return out;
}

/* ============================
   Resolvedores auxiliares
   ============================ */
async function getEmpresa(empId){
  if (!empId) return null;
  if (cacheEmpresaDoc.has(empId)) return cacheEmpresaDoc.get(empId);
  const s = await db.collection("empresas").doc(empId).get();
  const v = s.exists ? (s.data()||{}) : null;
  cacheEmpresaDoc.set(empId, v);
  return v;
}

async function agenciaRotuloPorEmpresa(emp){
  if (!emp?.agenciaId) return null;
  // tenta localizar option já renderizado
  if (elSelAg) {
    const opt = elSelAg.querySelector(`option[value="${emp.agenciaId}"]`);
    if (opt) return opt.textContent;
  }
  // fallback: busca no banco
  const s = await db.collection("agencias_banco").doc(emp.agenciaId).get();
  if (!s.exists) return null;
  const a=s.data()||{};
  const banco  = a.banco?` — ${a.banco}`:"";
  const cidade = (a.Cidade||a.cidade||"");
  const uf     = (a.estado||a.UF||"");
  return `${a.nome||"(Sem nome)"}${banco}${cidade?` / ${cidade}`:""}${uf?` - ${uf}`:""}`;
}
