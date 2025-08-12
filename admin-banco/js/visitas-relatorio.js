// --- Firebase ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// --- DOM ---
const tbody = document.getElementById("tbodyRelatorio");
const kpiVisitas = document.getElementById("kpiVisitas");
const kpiPremio  = document.getElementById("kpiPremio");

// filtros
const el = id => document.getElementById(id);
const F = {
  agencia: el("filtroAgencia"),
  rm:      el("filtroRM"),
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
el("btnLimpar").onclick  = () => { Object.values(F).forEach(x=>{ if (x.tagName==='SELECT') x.value=''; else x.value=''; }); aplicar(); };
el("btnExportar").onclick = () => exportarCSV();

// --- Data holders ---
let visitasRaw = []; // docs de visitas
let linhas = [];     // linhas flatten por ramo

// Util: formata número BRL
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

// Carrega tudo
auth.onAuthStateChanged(async user=>{
  if (!user){ location.href="login.html"; return; }
  await carregar();
  popularCombos();
  aplicar();
});

async function carregar(){
  // ATENÇÃO: agora ordena por 'criadoEm' (era 'data')
  const snap = await db.collection("visitas").orderBy("criadoEm","desc").get();
  if (snap.empty){ tbody.innerHTML = `<tr><td colspan="12">Nenhuma visita registrada.</td></tr>`; return; }

  const cacheEmpresas = {};
  const cacheUsuarios = {};

  visitasRaw = await Promise.all(snap.docs.map(async d=>{
    const v = {id: d.id, ...d.data()};
    // data da criação da visita (fallback para Date local)
    v.dataObj = v.criadoEm?.toDate?.() || new Date();

    // Empresa
    if (v.empresaId){
      if (!cacheEmpresas[v.empresaId]){
        try{
          const e = await db.collection("empresas").doc(v.empresaId).get();
          cacheEmpresas[v.empresaId] = e.exists ? e.data() : {};
        }catch(_){ cacheEmpresas[v.empresaId] = {}; }
      }
      v._empresa = cacheEmpresas[v.empresaId];
      v.empresaNome = v.empresaNome || v._empresa.nome || "-";
      v.agencia     = v._empresa.agencia || v._empresa.agenciaId || "-";
      v.rmNome      = v.rmNome || v._empresa.rmNome || v._empresa.rm || "-";
    }

    // Usuário (quem registrou)
    if (v.usuarioId){
      if (!cacheUsuarios[v.usuarioId]){
        try{
          const u = await db.collection("usuarios_banco").doc(v.usuarioId).get();
          cacheUsuarios[v.usuarioId] = u.exists ? (u.data().nome || u.data().email) : "-";
        }catch(_){ cacheUsuarios[v.usuarioId] = "-"; }
      }
      v.usuarioNome = cacheUsuarios[v.usuarioId];
    }

    return v;
  }));

  // Flatten por ramo
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
        agencia: v.agencia || "-",
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

function popularCombos(){
  const uniq = (arr) => [...new Set(arr.filter(v=>v!==undefined && v!==null && v!=="" && v!=="-"))]
                       .sort((a,b)=> (""+a).localeCompare(""+b,'pt-BR'));

  const agencias = uniq(linhas.map(x=>x.agencia));
  const rms      = uniq(linhas.map(x=>x.rmNome));
  const segs     = uniq(linhas.map(x=>x.seguradora));
  const ramos    = uniq(linhas.map(x=>x.ramo));
  const anos     = uniq(linhas.map(x=>x.vencYYYY).filter(Boolean));

  function fill(select, values, firstLabel){
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

function aplicar(){
  const txtEmp = (F.empresa.value||"").toLowerCase().trim();
  const selAg  = F.agencia.value;
  const selRM  = F.rm.value;
  const selTp  = F.tipo.value;
  const selMes = F.mes.value ? parseInt(F.mes.value,10) : null;
  const selAno = F.ano.value ? parseInt(F.ano.value,10) : null;
  const selSeg = F.segur.value;
  const selRmo = F.ramo.value;

  const di = F.di.value ? new Date(F.di.value) : null;
  const df = F.df.value ? new Date(F.df.value + "T23:59:59") : null;

  const rows = linhas.filter(l=>{
    if (txtEmp && !l.empresaNome.toLowerCase().includes(txtEmp)) return false;
    if (selAg  && l.agencia !== selAg) return false;
    if (selRM  && l.rmNome !== selRM) return false;
    if (selTp  && l.tipoVisita !== selTp) return false;
    if (selMes && l.vencMM !== selMes) return false;
    if (selAno && l.vencYYYY !== selAno) return false; // >>> ANO aplicado aqui
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
  kpiVisitas.textContent = visitasUnicas.toString();
  kpiPremio.textContent  = "R$ " + fmtBRL(totalPremio);

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
  const rows = [...tbody.querySelectorAll("tr")].map(tr=>[...tr.children].map(td=>td.innerText));
  if (!rows.length) return;
  const header = ["Data","Tipo","Usuário","Empresa","Agência","RM","Nº Funcionários","Produto","Vencimento (dia/mês/ano)","Prêmio","Seguradora","Observações"];
  const csv = [header].concat(rows).map(cols=>cols.map(v=>`"${(v||"").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "relatorio-visitas.csv"; a.click();
}
