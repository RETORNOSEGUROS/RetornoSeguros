// crm.js
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// helpers
const N = (x)=>Number(x)||0;
const norm = (s)=> (s||"").toString().normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().trim();
const byValDesc = (a,b)=> b.value - a.value;
const byQtyDesc = (a,b)=> b.qty - a.qty;

function qs(name){
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}
function pct(n,d){ return d>0 ? Math.round((n*100)/d) : 0; }

function classFromStatus(sRaw){
  const s = norm(sRaw);
  if (["negocio emitido"].includes(s)) return "verde";
  if (["negocio fechado","em emissao"].includes(s)) return "azul";
  if (["recusado cliente","recusado seguradora","emitido declinado","negocio emitido declinado"].includes(s)) return "vermelho";
  if (["pendente agencia","pendente corretor","pendente seguradora","pendente cliente","proposta enviada","proposta reenviada","cotacao iniciada","pedido de cotacao"].includes(s)) return "amarelo";
  return "nenhum";
}

function getAno(c){
  const cand = [c.ano,c.anoVigencia,c.anoReferencia,c.vigenciaAno,c.vigencia?.ano].filter(Boolean);
  if (cand.length){ const n = parseInt(cand[0],10); if(!isNaN(n)) return n; }
  const ts = c.createdAt||c.criadoEm||c.atualizadoEm||c.data||c.updatedAt;
  try{
    if (ts?.toDate) return ts.toDate().getFullYear();
    if (typeof ts==="string"){ const d=new Date(ts); if(!isNaN(d)) return d.getFullYear(); }
  }catch(_){}
  return new Date().getFullYear();
}

const filtros = {
  agencia: qs("agencia"),
  rm: qs("rm"),
  ano: qs("ano")
};

auth.onAuthStateChanged(async (user)=>{
  if(!user) return window.location.href="login.html";
  document.getElementById("filtros").innerHTML =
    `<span class="pill">Agência: ${filtros.agencia||"Todas"}</span>`+
    `<span class="pill">RM: ${filtros.rm||"Todos"}</span>`+
    `<span class="pill">Ano: ${filtros.ano||new Date().getFullYear()}</span>`;
  await montarPainel(user);
});

async function montarPainel(user){
  // 1) buscar empresas dentro do escopo
  let qEmp = db.collection("empresas");
  if (filtros.agencia) qEmp = qEmp.where("agenciaId","==",filtros.agencia);
  const empDocs = (await qEmp.get()).docs
    .map(d=>({ id:d.id, ...d.data() }))
    .filter(e => !filtros.rm || (e.rmNome||e.rm)===filtros.rm);

  const empresas = empDocs;
  const totalEmp = empresas.length;
  if(!totalEmp){
    document.getElementById("kpiEmpresas").textContent = "0";
    return;
  }

  // 2) buscar cotações por empresa (coleção: cotacoes-gerentes)
  const mapEmpresaStats = new Map(); // empresaId -> {nome, rm, statusPorRamo, counts}
  const countsStatus = { verde:0, amarelo:0, vermelho:0, azul:0, nenhum:0 };
  const countsProdutos = {};    // produto -> {cot: n, fech: n}
  const countsRMs = {};         // rm -> {cot: n, fech: n}
  const countsEmpCot = {};      // empresaNome -> {cot, fech}

  for (const e of empresas){
    const eid = e.id;
    const nome = e.nome || e.razaoSocial || e.fantasia || "-";
    const rmNome = e.rmNome || e.rm || "-";

    let qs = db.collection("cotacoes-gerentes").where("empresaId","==",eid);
    const docs = (await qs.get()).docs.map(d=>({id:d.id, ...d.data()}));

    let teveMov = false;
    let statusCounter = { verde:0, amarelo:0, vermelho:0, azul:0, nenhum:0 };

    docs.forEach(c=>{
      const ano = getAno(c);
      if (filtros.ano && filtros.ano !== "todos" && String(ano)!==String(filtros.ano)) return;

      const st = classFromStatus(c.status);
      statusCounter[st] = (statusCounter[st]||0)+1;
      countsStatus[st] = (countsStatus[st]||0)+1;

      const ramo = (c.ramo||"").trim();
      const k = norm(ramo)||"outros";
      if(!countsProdutos[k]) countsProdutos[k] = {cot:0, fech:0, label: ramo||"Outros"};
      countsProdutos[k].cot += 1;
      if (st==="verde" || st==="azul"){ countsProdutos[k].fech += 1; teveMov = true; }

      if(!countsRMs[rmNome]) countsRMs[rmNome] = {cot:0, fech:0};
      countsRMs[rmNome].cot += 1;
      if (st==="verde" || st==="azul") countsRMs[rmNome].fech += 1;

      if(!countsEmpCot[nome]) countsEmpCot[nome] = {cot:0, fech:0};
      countsEmpCot[nome].cot += 1;
      if (st==="verde" || st==="azul") countsEmpCot[nome].fech += 1;
    });

    mapEmpresaStats.set(eid, {nome, rmNome, statusCounter, teveMov});
  }

  // KPIs
  const empresasComMov = Array.from(mapEmpresaStats.values()).filter(x=>x.teveMov).length;
  document.getElementById("kpiEmpresas").textContent = String(totalEmp);
  document.getElementById("kpiMovimento").textContent = `${pct(empresasComMov,totalEmp)}%`;

  const topProd = Object.values(countsProdutos).sort((a,b)=>b.cot-a.cot)[0];
  document.getElementById("kpiProduto").textContent = topProd ? `${topProd.label} (${topProd.cot} cot.)` : "—";
  const topRM = Object.entries(countsRMs).map(([rm,v])=>({rm, ...v})).sort((a,b)=>b.cot-a.cot)[0];
  document.getElementById("kpiRM").textContent = topRM ? `${topRM.rm} (${topRM.cot} cot.)` : "—";

  // Gráfico de Status
  const totCels = Object.values(countsStatus).reduce((a,b)=>a+b,0);
  const ctxS = document.getElementById("chartStatus");
  new Chart(ctxS, {
    type: "doughnut",
    data: {
      labels: ["Emitido","Pendente","Recusado","Fechado/Emissão","Sem cot."],
      datasets: [{ data: [
        countsStatus.verde, countsStatus.amarelo, countsStatus.vermelho, countsStatus.azul, countsStatus.nenhum
      ]}]
    },
    options: { plugins:{ legend:{ position:"bottom" } } }
  });

  // Gráfico Produtos
  const prodArr = Object.entries(countsProdutos)
    .map(([k,v])=>({label:v.label||k, cot:v.cot, fech:v.fech}))
    .sort((a,b)=>b.cot-a.cot).slice(0,10);
  new Chart(document.getElementById("chartProdutos"), {
    type:"bar",
    data:{
      labels: prodArr.map(x=>x.label),
      datasets:[
        { label:"Cotações", data: prodArr.map(x=>x.cot) },
        { label:"Fechamentos", data: prodArr.map(x=>x.fech) }
      ]
    },
    options:{ responsive:true, plugins:{ legend:{ position:"bottom" } } }
  });

  // Gráfico RMs
  const rmArr = Object.entries(countsRMs).map(([k,v])=>({rm:k, ...v}))
    .sort((a,b)=>b.cot-a.cot).slice(0,10);
  new Chart(document.getElementById("chartRMs"), {
    type:"bar",
    data:{
      labels: rmArr.map(x=>x.rm),
      datasets:[
        { label:"Cotações", data: rmArr.map(x=>x.cot) },
        { label:"Fechamentos", data: rmArr.map(x=>x.fech) }
      ]
    },
    options:{ responsive:true, plugins:{ legend:{ position:"bottom" } } }
  });

  // Tabela Top Empresas
  const tbodyEmp = document.querySelector("#tblEmpresas tbody");
  Object.entries(countsEmpCot)
    .map(([nome,v])=>({nome, ...v}))
    .sort((a,b)=>b.cot-a.cot).slice(0,15)
    .forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.nome}</td><td>${r.cot}</td><td>${r.fech}</td>`;
      tbodyEmp.appendChild(tr);
    });

  // Cross-Sell (regra simples e eficaz)
  // - mapeia presença/ausência por combos relevantes
  // - score = combos faltantes + peso pela adoção média na carteira
  const combos = [
    {need:["vida","saude funcionarios"], label:"Saúde Funcionários"},
    {have:["empresarial","patrimonial"], need:["responsabilidade civil","danos elétricos"], label:"RC / Danos Elétricos"},
    {need:["dental funcionarios"], label:"Dental Funcionários"},
    {have:["frota"], need:["vida"], label:"Vida Motorista"},
    {have:["residencial"], need:["vida"], label:"Vida (família)"},
  ];

  // adoção média por produto (para ponderar)
  const adocao = {};
  Object.entries(countsProdutos).forEach(([k,v])=>{
    adocao[k] = (v.cot>0) ? v.cot : 0;
  });

  const cross = [];
  for (const e of empresas){
    const nome = e.nome || e.razaoSocial || e.fantasia || "-";
    // presença por produto nesta empresa (considera cot/fechamentos)
    const pres = new Set();
    const docs = (await db.collection("cotacoes-gerentes").where("empresaId","==",e.id).get()).docs
      .map(d=>d.data());
    docs.forEach(c=>{
      const ano = getAno(c);
      if (filtros.ano && filtros.ano!=="todos" && String(ano)!==String(filtros.ano)) return;
      const k = norm(c.ramo||"");
      if(!k) return;
      pres.add(k);
    });

    let sugeridos = [];
    let score = 0;

    combos.forEach(cb=>{
      const hasAllHave = (cb.have||[]).every(h=> pres.has(norm(h)));
      const lacksAny   = (cb.need||[]).some(n=> !pres.has(norm(n)));
      if( (cb.have?hasAllHave:true) && lacksAny ){
        const faltantes = (cb.need||[]).filter(n=> !pres.has(norm(n)));
        faltantes.forEach(f=>{
          sugeridos.push(f);
          score += 1 + (adocao[norm(f)]||0)/100; // pondera pela adoção média
        });
      }
    });

    if (sugeridos.length){
      cross.push({ nome, sugestoes: Array.from(new Set(sugeridos)), score: Math.round(score*10)/10 });
    }
  }

  cross.sort((a,b)=> b.score - a.score);
  const tbodyCross = document.querySelector("#tblCross tbody");
  cross.slice(0,10).forEach(x=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${x.nome}</td><td>${x.sugestoes.join(", ")}</td><td>${x.score}</td>`;
    tbodyCross.appendChild(tr);
  });
}
