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
  segur:   el("filtroSeguradora"),
  ramo:    el("filtroRamo"),
  empresa: el("filtroEmpresa"),
  di:      el("filtroDataInicio"),
  df:      el("filtroDataFim"),
};
el("btnAplicar").onclick = () => aplicar();
el("btnLimpar").onclick  = () => { Object.values(F).forEach(x=>{
  if (x.tagName==='SELECT') x.value = ''; else x.value='';
}); aplicar(); };
el("btnExportar").onclick = () => exportarCSV();

// --- Data holders ---
let visitasRaw = [];     // documentos de visitas
let linhas = [];         // linhas flatten por ramo (para filtrar/renderizar)

// Util: formata número BRL
const fmtBRL = v => (isFinite(v) ? v : 0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});

// Util: extrai {dd,mm} de vários formatos
function extrairDiaMes(venc) {
  // String "dd/mm"
  if (typeof venc === "string" && /^\d{2}\/\d{2}$/.test(venc)) {
    const [dd, mm] = venc.split("/").map(n=>parseInt(n,10));
    return {dd, mm};
  }
  // String "dd/mm/aaaa"
  if (typeof venc === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(venc)) {
    const [dd, mm] = venc.split("/").map(n=>parseInt(n,10));
    return {dd, mm};
  }
  // Timestamp
  if (venc && typeof venc.toDate === "function") {
    const d = venc.toDate();
    return {dd: d.getDate(), mm: d.getMonth()+1};
  }
  // vazio
  return {dd:null, mm:null};
}
const ddmmToString = ({dd,mm}) => (dd && mm) ? String(dd).padStart(2,'0') + "/" + String(mm).padStart(2,'0') : "-";

// Carrega tudo
auth.onAuthStateChanged(async user=>{
  if (!user){ location.href="login.html"; return; }
  await carregar();
  popularCombos();
  aplicar(); // primeira render
});

async function carregar(){
  // Visitas
  const snap = await db.collection("visitas").orderBy("data","desc").get();
  if (snap.empty){ tbody.innerHTML = `<tr><td colspan="11">Nenhuma visita registrada.</td></tr>`; return; }

  // caches
  const cacheEmpresas = {};
  const cacheUsuarios = {};

  visitasRaw = await Promise.all(snap.docs.map(async d=>{
    const v = {id: d.id, ...d.data()};
    v.dataObj = v.data?.toDate?.() || new Date();

    // Empresa
    if (v.empresaId){
      if (!cacheEmpresas[v.empresaId]){
        try{
          const e = await db.collection("empresas").doc(v.empresaId).get();
          cacheEmpresas[v.empresaId] = e.exists ? e.data() : {};
        }catch(_){ cacheEmpresas[v.empresaId] = {}; }
      }
      v._empresa = cacheEmpresas[v.empresaId];
      v.empresaNome = v._empresa.nome || "-";
      v.agencia     = v._empresa.agencia || v._empresa.agenciaId || "-";
      // RM: prefere o rmNome da visita; senão, da empresa (rmNome ou rm)
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
      const {dd, mm} = extrairDiaMes(info.vencimento);
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
        ramo: ramo.toUpperCase(),
        vencDD: dd, vencMM: mm,
        vencStr: ddmmToString({dd,mm}),
        premio: premioNum,
        seguradora: info.seguradora || "-",
        observacoes: info.observacoes || info.observacoes === "" ? info.observacoes : (info.observacoes || "-"),
      });
    }
  }
}

function popularCombos(){
  // Monta listas únicas a partir de 'linhas'
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a,b)=> (""+a).localeCompare(""+b,'pt-BR'));
  const agencias = uniq(linhas.map(x=>x.agencia));
  const rms      = uniq(linhas.map(x=>x.rmNome));
  const segs     = uniq(linhas.map(x=>x.seguradora).filter(s=>s!=="-"));
  const ramos    = uniq(linhas.map(x=>x.ramo));

  // helper para popular SELECT
  function fill(select, values){
    const cur = select.value;
    select.innerHTML = `<option value="">${select===F.agencia?'Todas':'Todos'}</option>` + values.map(v=>`<option>${v}</option>`).join("");
    if (values.includes(cur)) select.value = cur; // mantém se ainda existir
  }

  fill(F.agencia, agencias);
  fill(F.rm,      rms);
  fill(F.segur,   segs);
  fill(F.ramo,    ramos);
}

function aplicar(){
  const txtEmp = (F.empresa.value||"").toLowerCase().trim();
  const selAg  = F.agencia.value;
  const selRM  = F.rm.value;
  const selTp  = F.tipo.value;
  const selMes = F.mes.value ? parseInt(F.mes.value,10) : null;
  const selSeg = F.segur.value;
  const selRmo = F.ramo.value;

  const di = F.di.value ? new Date(F.di.value) : null;
  const df = F.df.value ? new Date(F.df.value + "T23:59:59") : null;

  const rows = linhas.filter(l=>{
    if (txtEmp && !l.empresaNome.toLowerCase().includes(txtEmp)) return false;
    if (selAg  && l.agencia !== selAg) return false;
    if (selRM  && l.rmNome !== selRM) return false;
    if (selTp  && l.tipoVisita !== selTp) return false;
    if (selMes && l.vencMM !== selMes) return false;  // filtro por mês de vencimento
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

  // Tabela
  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="11">Nenhum registro encontrado para os filtros selecionados.</td></tr>`;
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
  const header = ["Data","Tipo","Usuário","Empresa","Agência","RM","Produto","Vencimento (dia/mês)","Prêmio","Seguradora","Observações"];
  const csv = [header].concat(rows).map(cols=>cols.map(v=>`"${(v||"").replace(/"/g,'""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "relatorio-visitas.csv"; a.click();
}
