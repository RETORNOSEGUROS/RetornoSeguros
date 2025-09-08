// js/valuation.js (núcleo mínimo)
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(); const db = firebase.firestore();

let CTX = { uid:null, empresaSel:null, perf:null };
const toBRL = n=> Number.isFinite(n)? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "—";
const parseBRL = s=> { const only=String(s||"").replace(/\D+/g,""); return only? Number(only)/100:0; };

auth.onAuthStateChanged(async user=>{
  if(!user) location.href="login.html";
  CTX.uid=user.uid;
  const prof=await db.collection("usuarios_banco").doc(user.uid).get().catch(()=>null);
  document.getElementById("perfilUsuario").textContent = (prof?.data()?.nome||user.email) + " ("+(prof?.data()?.perfil||"admin")+")";
  carregarListaValuations();
});

async function carregarListaValuations(){
  // exemplo: lista por empresas, lendo últimos denormalizados p/ preencher tabelão
  const tbody=document.getElementById("tbodyVal"); tbody.innerHTML="";
  const snap=await db.collection("empresas").limit(500).get();
  snap.forEach(doc=>{
    const d=doc.data()||{};
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${d.nome||d.fantasia||"Empresa"}</td>
      <td>${d.ultimoAnoFinanceiro??"—"}</td>
      <td>${toBRL(d.ultimoEbitda??null)}</td>
      <td>${toBRL(d.ultimaDividaLiquida??null)}</td>
      <td>${toBRL(d.ultimoValuationEV??null)}</td>
      <td>${toBRL(d.ultimoValuationEquity??null)}</td>
      <td>${d.ultimoValuationMetodo||"—"}</td>
      <td>${d.ultimoValuationData? d.ultimoValuationData.toDate().toLocaleDateString("pt-BR"):"—"}</td>
      <td><button class="btn outline" data-novo="${doc.id}">Novo</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-novo]").forEach(b=>{
    b.onclick=()=> abrirModalVal(b.getAttribute("data-novo"));
  });
}

// --------- Cálculos -----------
function valuationMultiplo({ebitda, dl, mult, haircutPct}){
  if(!Number.isFinite(ebitda)||!Number.isFinite(mult)) return null;
  const evBruto = ebitda * mult;
  const ev = evBruto * (1 - (haircutPct||0)/100);
  const equity = Number.isFinite(dl)? (ev - dl) : null;
  return {ev, equity};
}
function valuationDCF({receita0, margemFCF, cagr, anos, waccPct, gTermPct}){
  if(!Number.isFinite(receita0)||!Number.isFinite(margemFCF)||!Number.isFinite(waccPct)||!Number.isFinite(gTermPct)) return null;
  const wacc = waccPct/100, g = gTermPct/100;
  let ev=0, rec=receita0;
  for(let t=1;t<=anos;t++){
    rec = rec * (1 + (cagr||0)/100);
    const fcf = rec * (margemFCF/100);
    ev += fcf / Math.pow(1+wacc, t);
  }
  // valor terminal
  const fcfTerm = rec * (margemFCF/100);
  const vt = (fcfTerm * (1+g)) / (wacc - g);
  ev += vt / Math.pow(1+wacc, anos);
  return {ev};
}
function scoreRisco({alav, liq, conc, gov}){
  // exemplo simples (0 pior, 100 melhor)
  const s1 = (!Number.isFinite(alav))?50: Math.max(0, 100 - (alav*20));  // 0x→100, 5x→0
  const s2 = (!Number.isFinite(liq))?50: Math.min(100, liq*60+40);       // 1.0→100 (cap), 0.5→70, etc.
  const s3 = (10-(conc||5))*10;  // menor concentração, maior nota
  const s4 = (gov||5)*10;
  const score = Math.round((s1+s2+s3+s4)/4);
  return {score, haircutPct: Math.max(0, 30 - score*0.2)}; // score alto → haircut baixo
}

// --------- UI do Modal ----------
function abrirModalVal(empresaId){
  CTX.empresaSel=empresaId;
  document.getElementById("modalVal").style.display="block";
  // pré-preenche com “últimos” da raiz
  db.collection("empresas").doc(empresaId).get().then(ds=>{
    const d=ds.data()||{};
    document.getElementById("valEmpresaAlvo").textContent = `${d.nome||"Empresa"} (ID:${empresaId})`;
    document.getElementById("vEbitda").value = (d.ultimoEbitda? (d.ultimoEbitda).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"");
    document.getElementById("vDL").value     = (d.ultimaDividaLiquida? (d.ultimaDividaLiquida).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"");
    document.getElementById("vReceita").value= (d.ultimaReceita? (d.ultimaReceita).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"");
  });
}
document.getElementById("valFechar").onclick=()=> (document.getElementById("modalVal").style.display="none");

// alternância de abas
document.querySelectorAll(".tabs .btn").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll("[id^='tab-']").forEach(x=> x.style.display="none");
    const id = btn.dataset.tab==="mult"?"tab-mult": btn.dataset.tab==="dcf"?"tab-dcf":"tab-score";
    document.getElementById(id).style.display="grid";
  };
});

// preview + salvar
document.getElementById("valSalvar").onclick=async()=>{
  const ebitda = parseBRL(document.getElementById("vEbitda").value);
  const dl     = parseBRL(document.getElementById("vDL").value);
  const mult   = parseFloat(document.getElementById("vMultEvEbitda").value||"");
  const haircut= parseFloat(document.getElementById("vHaircut").value||"0");

  const receita= parseBRL(document.getElementById("vReceita").value);
  const wacc   = parseFloat(document.getElementById("vWacc").value||"");
  const gterm  = parseFloat(document.getElementById("vGTerm").value||"");
  const mfcf   = parseFloat(document.getElementById("vMFCF").value||"");
  const cagr   = parseFloat(document.getElementById("vCAGR").value||"");
  const anos   = parseInt(document.getElementById("vAnos").value||"5",10);

  const resMult = valuationMultiplo({ebitda, dl, mult, haircutPct:haircut});
  const resDCF  = valuationDCF({receita0:receita, margemFCF:mfcf, cagr, anos, waccPct:wacc, gTermPct:gterm});
  const {score, haircutPct} = scoreRisco({
    alav: (dl && ebitda)? (dl/ebitda) : null,
    liq: null, conc:5, gov:7
  });

  const out = {
    metodo:"consolidado",
    anoBase: new Date().getFullYear(),
    ebitdaBase: ebitda, dividaLiquidaBase: dl, receitaBase: receita,
    multSetor:{ev_ebitda_med:mult}, haircutRisco:haircut,
    wacc:wacc/100, g_terminal:gterm/100, margemFCFPctRec:mfcf, cagrReceita:cagr, anosProjecao:anos,
    evPorMetodo:{ multiplos: resMult?.ev||null, dcf: resDCF?.ev||null, score: score },
    ev: Math.max( resMult?.ev||0, resDCF?.ev||0 ), // exemplo: pegar o maior
    equityValue: (resMult?.equity!=null)? resMult.equity : ((resDCF?.ev!=null && Number.isFinite(dl))? (resDCF.ev-dl): null),
    seloNoDia: null, alavancagemNoDia: (dl && ebitda)? (dl/ebitda): null
  };

  // salva snapshot
  const ref = db.collection("empresas").doc(CTX.empresaSel).collection("valuation").doc();
  await ref.set({
    ...out,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: CTX.uid
  },{merge:true});

  // denormaliza na raiz p/ “último valuation”
  await db.collection("empresas").doc(CTX.empresaSel).set({
    ultimoValuationEV: out.ev || null,
    ultimoValuationEquity: out.equityValue || null,
    ultimoValuationMetodo: out.metodo,
    ultimoValuationData: firebase.firestore.FieldValue.serverTimestamp()
  },{merge:true});

  document.getElementById("valResultados").innerHTML =
    `<div><b>EV:</b> ${toBRL(out.ev||null)} · <b>Equity:</b> ${toBRL(out.equityValue||null)} · <b>Score:</b> ${score} (haircut ${haircutPct}%)</div>`;

  carregarListaValuations();
};
