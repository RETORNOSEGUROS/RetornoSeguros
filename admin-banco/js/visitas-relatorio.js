// --- Firebase ---
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// --- DOM (mantendo os IDs do seu HTML) ---
const tbody = document.getElementById("tbodyRelatorio");
const kpiVisitas = document.getElementById("kpiVisitas");
const kpiPremio  = document.getElementById("kpiPremio");

// filtros (mantendo os IDs do seu HTML)
const el = id => document.getElementById(id);
const F = {
  agencia: el("filtroAgencia"),
  rm:      el("filtroRM"),          // aqui é NOME do RM (como no seu original)
  tipo:    el("filtroTipo"),
  mes:     el("filtroMesVenc"),
  ano:     el("filtroAnoVenc"),
  segur:   el("filtroSeguradora"),
  ramo:    el("filtroRamo"),
  empresa: el("filtroEmpresa"),
  di:      el("filtroDataInicio"),
  df:      el("filtroDataFim"),
};
el("btnAplicar").onclick = () => aplicar();
el("btnLimpar").onclick  = () => { Object.values(F).forEach(x=>{ if (x) x.value=''; }); aplicar(); };
el("btnExportar").onclick = () => exportarCSV();

// --- Estado / RBAC ---
let usuarioAtual = null;
let perfilAtual  = "";
let minhaAgencia = "";
let isAdmin      = false;

// --- Data holders ---
let visitasRaw = []; // docs de visitas (já RBAC)
let linhas = [];     // linhas flatten por ramo
let empresasDaMinhaAgencia = new Set(); // << NOVO

/* ===== Utils ===== */
const fmtBRL = v => (isFinite(v) ? v : 0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});

// Extrai {dd, mm, yyyy} aceitando "dd/mm", "dd/mm/aaaa" e Timestamp
function extrairDMY(venc) {
  if (typeof venc === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(venc)) {
    const [dd, mm, yyyy] = venc.split("/").map(n=>parseInt(n,10));
    return {dd, mm, yyyy};
  }
  if (typeof venc === "string" && /^\d{2}\/\d{2}$/.test(venc)) {
    const [dd, mm] = venc.split("/").map(n=>parseInt(n,10));
    return {dd, mm, yyyy: null};
  }
  if (venc && typeof venc.toDate === "function") {
    const d = venc.toDate();
    return {dd: d.getDate(), mm: d.getMonth()+1, yyyy: d.getFullYear()};
  }
  return {dd:null, mm:null, yyyy:null};
}
const dmyToString = ({dd,mm,yyyy}) => (dd && mm) ?
  `${String(dd).padStart(2,'0')}/${String(mm).padStart(2,'0')}${yyyy?"/"+yyyy:""}` : "-";

function toDate(val){
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(+d) ? null : d;
  }
  if (val instanceof Date) return val;
  return null;
}

async function getPerfilAgencia() {
  const user = auth.currentUser;
  if (!user) return { perfil:"", agenciaId:"", isAdmin:false, nome:"" };
  const snap = await db.collection("usuarios_banco").doc(user.uid).get();
  const d = snap.exists ? (snap.data() || {}) : {};
  const perfil = (d.perfil || d.roleId || "").toLowerCase();
  const agenciaId = d.agenciaId || "";
  const admin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");
  return { perfil, agenciaId, isAdmin: admin, nome: d.nome || user.email || "" };
}

/* ===== Boot ===== */
auth.onAuthStateChanged(async user=>{
  if (!user){ location.href="login.html"; return; }
  usuarioAtual = user;

  const ctx = await getPerfilAgencia();
  perfilAtual  = ctx.perfil;
  minhaAgencia = ctx.agenciaId;
  isAdmin      = ctx.isAdmin;

  // Pré-carrega empresas da própria agência (para GC/assistente)
  if (!isAdmin && ["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
    await carregarEmpresasDaMinhaAgencia();
  }

  await carregar();       // carrega e monta linhas (flatten) já com RBAC
  popularCombos();        // preenche os selects
  aplicar();              // aplica filtros atuais
});

/* ===== NOVO: cache de empresas da minha agência ===== */
async function carregarEmpresasDaMinhaAgencia(){
  empresasDaMinhaAgencia = new Set();
  try{
    const snap = await db.collection("empresas").where("agenciaId","==",minhaAgencia).get();
    snap.forEach(doc => empresasDaMinhaAgencia.add(doc.id));
  }catch(e){
    console.warn("Falha ao ler empresas da minha agência:", e);
  }
}

/* ===== Coleta de VISITAS respeitando RBAC ===== */
async function coletarVisitasPorPerfil() {
  const col = db.collection("visitas");

  // Admin → tudo
  if (isAdmin) {
    try { return (await col.orderBy("criadoEm","desc").get()).docs; }
    catch { return (await col.get()).docs; }
  }

  // Gerente-chefe / Assistente → por agência, incluindo docs legados via empresaId
  if (["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
    const map = new Map();

    // 1) com agenciaId no doc
    try {
      const snapA = await col.where("agenciaId","==",minhaAgencia).get();
      snapA.forEach(d => map.set(d.id, d));
    } catch(e) {
      console.warn("Query visitas.agenciaId falhou:", e);
    }

    // 2) complemento: visitas das EMPRESAS da minha agência (docs legados sem agenciaId)
    if (empresasDaMinhaAgencia.size) {
      const ids = Array.from(empresasDaMinhaAgencia);
      for (let i=0;i<ids.length;i+=10){
        const slice = ids.slice(i,i+10);
        try{
          const snapB = await col.where("empresaId","in", slice).get();
          snapB.forEach(d => map.set(d.id, d));
        }catch(e2){
          // fallback (custo maior): busca tudo e filtra em memória pela empresaId
          try{
            const snapAll = await col.get();
            snapAll.forEach(d => {
              const empId = (d.data()||{}).empresaId;
              if (empId && empresasDaMinhaAgencia.has(empId)) map.set(d.id, d);
            });
            break; // já resolvemos pelo fallback
          }catch(_){}
        }
      }
    }

    return Array.from(map.values());
  }

  // RM → somente próprias (vários campos por compatibilidade)
  const buckets = [];
  try { buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).get()); } catch(e){}
  try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch(e){}
  try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); } catch(e){}
  try { buckets.push(await col.where("gerenteId","==",usuarioAtual.uid).get()); } catch(e){}
  try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch(e){}

  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d)));
  return Array.from(map.values());
}

/* ===== Carregamento completo (com join de empresa/usuário + flatten por ramo) ===== */
async function carregar(){
  // Busca visitas conforme RBAC
  const snapDocs = await coletarVisitasPorPerfil();
  if (!snapDocs.length) {
    tbody.innerHTML = `<tr><td colspan="12">Nenhuma visita registrada.</td></tr>`;
    visitasRaw = []; linhas = [];
    return;
  }

  const cacheEmpresas = {};
  const cacheUsuarios = {};

  // Enriquecimento (empresa/usuário) mantendo seus campos/nomes
  visitasRaw = await Promise.all(snapDocs.map(async d=>{
    const v = {id: d.id, ...(d.data()||{})};

    // Data de criação (fallback: Date local)
    v.dataObj = toDate(v.criadoEm) || new Date();

    // Empresa
    if (v.empresaId){
      if (!cacheEmpresas[v.empresaId]){
        try{
          const e = await db.collection("empresas").doc(v.empresaId).get();
          cacheEmpresas[v.empresaId] = e.exists ? e.data() : {};
        }catch(_){ cacheEmpresas[v.empresaId] = {}; }
      }
      const emp = cacheEmpresas[v.empresaId];
      v._empresa = emp;
      v.empresaNome = v.empresaNome || emp.nome || "-";
      // >>> rótulo/ID da agência (suporta legado)
      v.agencia     = v.agenciaId || emp.agencia || emp.agenciaId || "-";
      v.rmNome      = v.rmNome || emp.rmNome || emp.rm || "-";
    } else {
      // sem empresaId: ainda tenta trazer agenciaId do próprio doc
      v.agencia = v.agenciaId || "-";
    }

    // Usuário (pode falhar p/ GC; não quebra)
    if (v.usuarioId && !cacheUsuarios[v.usuarioId]){
      try{
        const u = await db.collection("usuarios_banco").doc(v.usuarioId).get();
        cacheUsuarios[v.usuarioId] = u.exists ? (u.data().nome || u.data().email) : "-";
      }catch(_){ cacheUsuarios[v.usuarioId] = "-"; }
    }
    v.usuarioNome = v.usuarioNome || cacheUsuarios[v.usuarioId] || "-";

    return v;
  }));

  // Flatten por ramo (mesma estrutura do seu original)
  linhas = [];
  for (const v of visitasRaw){
    const ramos = v.ramos || {};
    for (const [ramo, info] of Object.entries(ramos)){
      const {dd, mm, yyyy} = extrairDMY(info.vencimento);
      const premioNum = Number(info.premio) || 0;

      linhas.push({
        visitaId: v.id,
        dataObj: v.dataObj,
        dataStr: v.dataObj.toLocaleDateString("pt-BR"),
        tipoVisita: v.tipoVisita || "-",
        usuarioNome: v.usuarioNome || "-",
        empresaNome: v.empresaNome || "-",
        agencia: v.agencia || "-",        // string que você usa no filtro "Agência"
        rmNome: v.rmNome || "-",
        numeroFuncionarios: (v.numeroFuncionarios ?? "-"),
        ramo: (ramo||"").toUpperCase(),
        vencDD: dd, vencMM: mm, vencYYYY: yyyy,
        vencStr: dmyToString({dd,mm,yyyy}),
        premio: premioNum,
        seguradora: info.seguradora || "-",
        observacoes: info.observacoes ?? "-"
      });
    }
  }
}

/* ===== Popular combos (mantendo seus IDs e rótulos) ===== */
function popularCombos(){
  const uniq = (arr) => [...new Set(arr.filter(v=>v!==undefined && v!==null && v!=="" && v!=="-"))]
                       .sort((a,b)=> (""+a).localeCompare(""+b,'pt-BR'));

  const agencias = uniq(linhas.map(x=>x.agencia));
  const rms      = uniq(linhas.map(x=>x.rmNome));
  const segs     = uniq(linhas.map(x=>x.seguradora));
  const ramos    = uniq(linhas.map(x=>x.ramo));
  const anos     = uniq(linhas.map(x=>x.vencYYYY).filter(Boolean));

  function fill(select, values, firstLabel){
    if (!select) return;
    const cur = select.value;
    select.innerHTML = `<option value="">${firstLabel}</option>` + values.map(v=>`<option>${v}</option>`).join("");
    if (values.includes(cur)) select.value = cur;
  }

  fill(F.agencia, agencias, "Todas");
  fill(F.rm,      rms,      "Todos");
  fill(F.segur,   segs,     "Todas");
  fill(F.ramo,    ramos,    "Todos");
  fill(F.ano,     anos,     "Todos");
}

/* ===== Aplicar filtros e render ===== */
function aplicar(){
  const txtEmp = (F.empresa?.value||"").toLowerCase().trim();
  const selAg  = F.agencia?.value || "";
  const selRM  = F.rm?.value || "";
  const selTp  = F.tipo?.value || "";
  const selMes = F.mes?.value ? parseInt(F.mes.value,10) : null;
  const selAno = F.ano?.value ? parseInt(F.ano.value,10) : null;
  const selSeg = F.segur?.value || "";
  const selRmo = F.ramo?.value || "";

  const di = F.di?.value ? new Date(F.di.value) : null;
  const df = F.df?.value ? new Date(F.df.value + "T23:59:59") : null;

  const rows = linhas.filter(l=>{
    if (txtEmp && !l.empresaNome.toLowerCase().includes(txtEmp)) return false;
    if (selAg  && l.agencia !== selAg) return false;        // Agência é string (como no seu original)
    if (selRM  && l.rmNome !== selRM) return false;         // RM por NOME (igual seu select)
    if (selTp  && l.tipoVisita !== selTp) return false;
    if (selMes && l.vencMM !== selMes) return false;
    if (selAno && l.vencYYYY !== selAno) return false;
    if (selSeg && l.seguradora !== selSeg) return false;
    if (selRmo && l.ramo !== selRmo) return false;
    if (di && l.dataObj < di) return false;
    if (df && l.dataObj > df) return false;
    return true;
  });

  render(rows);
}

function render(rows){
  // KPIs
  const visitasUnicas = new Set(rows.map(r=>r.visitaId)).size;
  const totalPremio   = rows.reduce((s,r)=> s + (Number(r.premio)||0), 0);
  if (kpiVisitas) kpiVisitas.textContent = visitasUnicas.toString();
  if (kpiPremio)  kpiPremio.textContent  = "R$ " + fmtBRL(totalPremio);

  if (!tbody) return; // segurança
  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="12">Nenhum registro encontrado para os filtros selecionados.</td></tr>`;
    return;
  }

  const html = rows.map(r=>`
    <tr>
      <td>${r.dataStr}</td>
      <td>${r.tipoVisita}</td>
      <td>${r.usuarioNome}</td>
      <td>${r.empresaNome}</td>
      <td>${r.agencia}</td>
      <td>${r.rmNome}</td>
      <td>${r.numeroFuncionarios}</td>
      <td>${r.ramo}</td>
      <td>${r.vencStr}</td>
      <td>R$ ${fmtBRL(r.premio)}</td>
      <td>${r.seguradora}</td>
      <td>${r.observacoes || '-'}</td>
    </tr>
  `).join("");
  tbody.innerHTML = html;
}

function exportarCSV(){
  if (!tbody) return;
  const rows = [...tbody.querySelectorAll("tr")].map(tr=>[...tr.children].map(td=>td.innerText));
  if (!rows.length) return;
  const header = ["Data","Tipo","Usuário","Empresa","Agência","RM","Nº Funcionários","Produto","Vencimento (dia/mês/ano)","Prêmio","Seguradora","Observações"];
  const csv = [header].concat(rows).map(cols=>cols.map(v=>`"${(v||"").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "relatorio-visitas.csv"; a.click();
}
