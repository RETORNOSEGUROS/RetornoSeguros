// ===== boot =====
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(); const db = firebase.firestore();

const CTX = { uid:null, empresaSel:null };
const toBRL = n => Number.isFinite(n)? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "—";
const formatBRL = n => Number.isFinite(n)? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "";
const parseBRL = s => { const only=String(s||"").replace(/\D+/g,""); return only? Number(only)/100:0; };

// máscara money
function moneyBind(scope=document){
  scope.querySelectorAll("input.money").forEach(el=>{
    el.addEventListener("focus", ()=>{ const v=parseBRL(el.value); el.value=v? String(v.toFixed(2)).replace(".",","):""; });
    el.addEventListener("input", ()=> el.value = el.value.replace(/[^\d,]/g,""));
    el.addEventListener("blur", ()=>{ const v=parseBRL(el.value); el.value=v? formatBRL(v):""; });
  });
}

// ===== auth & UI =====
auth.onAuthStateChanged(async user=>{
  if(!user) return location.href="login.html";
  CTX.uid=user.uid;
  try{
    const prof=await db.collection("usuarios_banco").doc(user.uid).get();
    const nome=(prof.data()?.nome||user.email); const perf=prof.data()?.perfil||"admin";
    document.getElementById("perfilUsuario").textContent = `${nome} (${perf})`;
  }catch{ document.getElementById("perfilUsuario").textContent = (user.email||"Usuário")+" (admin)"; }

  bindUI();
  listarEmpresas();
});

function bindUI(){
  document.getElementById("btnVoltarPainel").onclick=()=> (document.referrer? history.back() : location.href="empresas.html");
  document.getElementById("btnNovoValuation").onclick=()=> abrirModalVal(null);
  document.getElementById("valFechar").onclick=()=> fecharModal();

  document.querySelectorAll(".tabs .btn").forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll("[id^='tab-']").forEach(x=> x.style.display="none");
      const id = b.dataset.tab==="mult"?"tab-mult" : b.dataset.tab==="dcf"?"tab-dcf" : "tab-extra";
      document.getElementById(id).style.display="grid";
    };
  });

  // tooltip leve (usa atributo title)
  let tipEl=null, tipTimer=null;
  document.addEventListener("mouseover", ev=>{
    const t=ev.target.closest(".pill"); if(!t) return;
    const txt=t.getAttribute("title")||""; if(!txt) return;
    tipTimer=setTimeout(()=>{
      tipEl=document.createElement("div"); tipEl.className="tooltip"; tipEl.textContent=txt; document.body.appendChild(tipEl);
      const r=t.getBoundingClientRect(); tipEl.style.left=(r.left + r.width/2 - tipEl.offsetWidth/2)+"px"; tipEl.style.top=(r.bottom+8)+"px";
    },120);
  });
  document.addEventListener("mouseout", ()=>{ if(tipTimer){clearTimeout(tipTimer);tipTimer=null;} if(tipEl){tipEl.remove();tipEl=null;} });

  moneyBind(document);
}

// ===== listagem =====
async function listarEmpresas(){
  const tbody=document.getElementById("tbodyVal"); tbody.innerHTML="";
  const status=document.getElementById("statusVal"); status.textContent="Carregando…";

  const busca=(document.getElementById("buscaEmpresa").value||"").trim().toLowerCase();
  const snap=await db.collection("empresas").limit(1000).get();
  let arr=[];
  snap.forEach(doc=>{
    const d=doc.data()||{};
    const nome=d.nome||d.fantasia||d.razaoSocial||"Empresa";
    if(busca && !String(nome).toLowerCase().includes(busca)) return;

    arr.push({
      id:doc.id, nome,
      ano: d.ultimoAnoFinanceiro??null,
      ebitda: d.ultimoEbitda??null,
      dl: d.ultimaDividaLiquida??null,
      ev: d.ultimoValuationEV??null,
      eq: d.ultimoValuationEquity??null,
      metodo: d.ultimoValuationMetodo||"—",
      quando: d.ultimoValuationData? d.ultimoValuationData.toDate() : null
    });
  });

  arr.sort((a,b)=> String(a.nome).localeCompare(String(b.nome),'pt',{sensitivity:'base'}));
  if(!arr.length){ status.textContent="Nenhuma empresa encontrada."; return; }

  for(const it of arr){
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td><strong>${it.nome}</strong></td>
      <td>${it.ano??"—"}</td>
      <td class="money">${toBRL(it.ebitda)}</td>
      <td class="money">${toBRL(it.dl)}</td>
      <td class="money">${toBRL(it.ev)}</td>
      <td class="money">${toBRL(it.eq)}</td>
      <td>${it.metodo}</td>
      <td>${it.quando? it.quando.toLocaleDateString("pt-BR") :"—"}</td>
      <td><button class="btn outline" data-novo="${it.id}">Novo</button></td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll("[data-novo]").forEach(b=> b.onclick=()=> abrirModalVal(b.dataset.novo));
  status.textContent = `${arr.length} empresa(s) carregada(s).`;
}
document.getElementById("buscaEmpresa").addEventListener("input", listarEmpresas);

// ===== modal novo valuation =====
async function abrirModalVal(empresaId){
  CTX.empresaSel=empresaId;
  document.getElementById("modalVal").style.display="block";
  const vE = id=> document.getElementById(id);

  // limpa
  ["vEbitda","vDL","vMultEvEbitda","vHaircut","vReceita","vMFCF","vCAGR","vAnos","vWacc","vGTerm",
   "xCapex","xTax","xCresEBITDA","xQuotas","xObs"].forEach(id=> vE(id).value="");
  document.getElementById("valResultados").style.display="none";
  moneyBind(document.getElementById("modalVal"));

  if(!empresaId){ document.getElementById("valEmpresaAlvo").textContent="Selecione uma empresa na tabela para pré-preencher."; return; }

  const ds=await db.collection("empresas").doc(empresaId).get();
  const d=ds.data()||{};
  document.getElementById("valEmpresaAlvo").textContent = `${d.nome||d.fantasia||"Empresa"} (ID: ${empresaId})`;
  // defaults vindos do financeiro
  vE("vEbitda").value = d.ultimoEbitda!=null ? formatBRL(d.ultimoEbitda) : "";
  vE("vDL").value     = d.ultimaDividaLiquida!=null ? formatBRL(d.ultimaDividaLiquida) : "";
  vE("vReceita").value= d.ultimaReceita!=null ? formatBRL(d.ultimaReceita) : "";
}

function fecharModal(){ document.getElementById("modalVal").style.display="none"; }

// ===== cálculos =====
function calcMultiplo({ebitda, dl, mult, haircutPct}){
  if(!Number.isFinite(ebitda)||!Number.isFinite(mult)) return null;
  const evBruto = ebitda * mult;
  const ev = evBruto * (1 - (haircutPct||0)/100);
  const equity = Number.isFinite(dl)? (ev - dl) : null;
  return {ev, equity, explain:`EV = EBITDA (${toBRL(ebitda)}) × ${mult.toLocaleString("pt-BR",{maximumFractionDigits:1})} × (1 - ${haircutPct||0}%)
→ EV = ${toBRL(ev)}; Equity = EV – DL (${toBRL(dl)}) = ${toBRL(equity)}`};
}

function calcDCF({receita0, margemFCF, cagr, anos, waccPct, gTermPct}){
  if(![receita0,margemFCF,waccPct,gTermPct].every(Number.isFinite)) return null;
  const wacc=waccPct/100, g=gTermPct/100;
  let ev=0, rec=receita0, explic=[];
  for(let t=1;t<=anos;t++){
    rec = rec * (1 + (cagr||0)/100);
    const fcf = rec * (margemFCF/100);
    const pv = fcf / Math.pow(1+wacc, t);
    ev += pv; explic.push(`FCF${t}=${toBRL(fcf)} → PV=${toBRL(pv)}`);
  }
  const fcfTerm = rec * (margemFCF/100);
  const vt = (fcfTerm * (1+g)) / (wacc - g);
  const pvVT = vt / Math.pow(1+wacc, anos);
  ev += pvVT; explic.push(`VT=${toBRL(vt)} → PV(VT)=${toBRL(pvVT)}`);
  return {ev, explain:`DCF com WACC ${waccPct}% e g ${gTermPct}%\n${explic.join(" · ")}\nEV = ${toBRL(ev)}`};
}

// ===== salvar =====
document.getElementById("valSalvar").onclick = async ()=>{
  const e = id=> document.getElementById(id);
  const empresaId = CTX.empresaSel;
  if(!empresaId){ alert("Selecione a empresa pela tabela e clique em Novo."); return; }

  // MULT
  const ebitda = parseBRL(e("vEbitda").value);
  const dl     = parseBRL(e("vDL").value);
  const mult   = parseFloat(e("vMultEvEbitda").value||"");
  const haircut= parseFloat(e("vHaircut").value||"0");

  // DCF
  const receita= parseBRL(e("vReceita").value);
  const mfcf   = parseFloat(e("vMFCF").value||"");
  const cagr   = parseFloat(e("vCAGR").value||"");
  const anos   = parseInt(e("vAnos").value||"5",10);
  const wacc   = parseFloat(e("vWacc").value||"");
  const gterm  = parseFloat(e("vGTerm").value||"");

  // EXTRAS
  const capex  = parseBRL(e("xCapex").value);
  const tax    = parseFloat(e("xTax").value||"");
  const cEBIT  = parseFloat(e("xCresEBITDA").value||"");
  const quotas = parseFloat(e("xQuotas").value||"");
  const obs    = e("xObs").value || "";

  const fromMult = calcMultiplo({ ebitda, dl, mult, haircutPct:haircut });
  const fromDCF  = calcDCF({ receita0:receita, margemFCF:mfcf, cagr, anos, waccPct:wacc, gTermPct:gterm });

  const ev = Math.max( fromMult?.ev||0, fromDCF?.ev||0 ) || null;
  const equity = Number.isFinite(dl) && Number.isFinite(ev) ? (ev - dl) : (fromMult?.equity ?? null);
  const pricePerQuota = (Number.isFinite(quotas) && quotas>0 && Number.isFinite(equity)) ? (equity/quotas) : null;

  // explicação
  let expl = [];
  if(fromMult?.explain) expl.push("🔹 Múltiplos:\n"+fromMult.explain);
  if(fromDCF?.explain)  expl.push("\n🔹 DCF:\n"+fromDCF.explain);
  if(Number.isFinite(pricePerQuota)) expl.push(`\n🔹 Valor por cota: Equity (${toBRL(equity)}) ÷ ${quotas.toLocaleString("pt-BR")} = ${toBRL(pricePerQuota)}`);
  if(Number.isFinite(capex)) expl.push(`\nℹ️ CAPEX informado: ${toBRL(capex)}`);
  if(Number.isFinite(tax)) expl.push(`ℹ️ Imposto efetivo: ${tax.toLocaleString("pt-BR",{maximumFractionDigits:1})}%`);
  if(obs) expl.push(`\n📝 Observações: ${obs}`);

  const out = {
    metodo:"consolidado",
    anoBase: new Date().getFullYear(),
    ebitdaBase: Number.isFinite(ebitda)? ebitda : null,
    dividaLiquidaBase: Number.isFinite(dl)? dl : null,
    receitaBase: Number.isFinite(receita)? receita : null,
    multSetor:{ ev_ebitda_med: Number.isFinite(mult)? mult : null },
    haircutRisco: Number.isFinite(haircut)? haircut : 0,
    wacc: Number.isFinite(wacc)? wacc/100 : null,
    g_terminal: Number.isFinite(gterm)? gterm/100 : null,
    margemFCFPctRec: Number.isFinite(mfcf)? mfcf : null,
    cagrReceita: Number.isFinite(cagr)? cagr : null,
    anosProjecao: Number.isFinite(anos)? anos : 5,

    capex: Number.isFinite(capex)? capex:null,
    taxEfetivoPct: Number.isFinite(tax)? tax:null,
    crescEBITDAPct: Number.isFinite(cEBIT)? cEBIT:null,
    quotas: Number.isFinite(quotas)? quotas:null,
    observacoes: obs,

    evPorMetodo:{ multiplos: fromMult?.ev??null, dcf: fromDCF?.ev??null },
    ev: ev, equityValue: equity
  };

  // escreve subcoleção valuation + denormaliza
  const ref = db.collection("empresas").doc(empresaId);
  const vref = ref.collection("valuation").doc();
  await vref.set({ ...out, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: CTX.uid }, {merge:true});
  await ref.set({
    ultimoValuationEV: ev, ultimoValuationEquity: equity, ultimoValuationMetodo: out.metodo,
    ultimoValuationData: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge:true});

  // mostra explicação
  const box = document.getElementById("valResultados");
  box.style.display="block";
  box.innerHTML = `
    <div><span class="highlight">EV:</span> ${toBRL(ev)} · <span class="highlight">Equity:</span> ${toBRL(equity)}
    ${Number.isFinite(pricePerQuota)? ` · <span class="highlight">Valor/cota:</span> ${toBRL(pricePerQuota)}` : ""}</div>
    <pre style="white-space:pre-wrap;margin:8px 0 0">${expl.join("\n")}</pre>
  `;

  // recarrega listagem
  await listarEmpresas();
};
