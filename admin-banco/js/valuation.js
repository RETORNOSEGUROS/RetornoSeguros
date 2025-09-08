// ===== boot =====
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(); const db = firebase.firestore();

const CTX = { uid:null, empresaSel:null, autoCenarios:null };
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
  document.getElementById("valAuto").onclick = autoValuation;      // NOVO
  document.getElementById("valSalvar3").onclick = salvarTres;      // NOVO

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
  CTX.autoCenarios=null;
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

/* === util === */
const clamp=(v,a,b)=> Math.min(Math.max(v,a),b);
function table(rows){
  return `<table style="width:100%;border-collapse:collapse;margin-top:6px">
    <thead><tr>
      <th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb">Cenário</th>
      <th style="text-align:right;padding:6px;border-bottom:1px solid #e5e7eb">EV</th>
      <th style="text-align:right;padding:6px;border-bottom:1px solid #e5e7eb">Equity</th>
      <th style="text-align:right;padding:6px;border-bottom:1px solid #e5e7eb">WACC</th>
      <th style="text-align:right;padding:6px;border-bottom:1px solid #e5e7eb">g</th>
      <th style="text-align:right;padding:6px;border-bottom:1px solid #e5e7eb">CAGR Rec.</th>
      <th style="text-align:right;padding:6px;border-bottom:1px solid #e5e7eb">Margem FCF</th>
    </tr></thead>
    <tbody>${rows.map(r=>`
      <tr>
        <td style="padding:6px;border-bottom:1px solid #f1f5f9">${r.nome}</td>
        <td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right">${toBRL(r.ev)}</td>
        <td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right">${toBRL(r.eq)}</td>
        <td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right">${r.wacc}%</td>
        <td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right">${r.g}%</td>
        <td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right">${r.cagr}%</td>
        <td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right">${r.mfcf}%</td>
      </tr>`).join("")}
    </tbody></table>`;
}
function dcfEV({receita0, mfcfPct, cagrPct, anos=5, waccPct=15, gPct=3}){
  if(!Number.isFinite(receita0) || !Number.isFinite(mfcfPct)) return null;
  const wacc = waccPct/100, g = gPct/100;
  let ev = 0, rec = receita0;
  for(let t=1;t<=anos;t++){
    rec = rec * (1 + (cagrPct||0)/100);
    const fcf = rec * (mfcfPct/100);
    ev += fcf / Math.pow(1+wacc, t);
  }
  const fcfTerm = rec * (mfcfPct/100);
  const vt = (fcfTerm * (1+g)) / (wacc - g);
  ev += vt / Math.pow(1+wacc, anos);
  return ev;
}

// ===== Modo automático (3 cenários) =====
async function autoValuation(){
  const empresaId = CTX.empresaSel;
  if(!empresaId){ alert("Clique em 'Novo' na empresa desejada para abrir o modal."); return; }

  // pega denormalizados que já existem no Financeiro
  const doc = await db.collection("empresas").doc(empresaId).get();
  const d = doc.data()||{};
  const receita = Number(d.ultimaReceita)||0;
  const ebitda  = Number(d.ultimoEbitda)||0;
  const dl      = Number(d.ultimaDividaLiquida)||0;

  if(!(receita>0 && ebitda>0)){
    alert("Sem dados suficientes: preciso de Receita e EBITDA do último ano (vindos do Financeiro).");
    return;
  }

  // margem EBITDA e proxy de margem FCF baseada apenas nos dados existentes
  const margemEbitdaPct = (ebitda/receita)*100;                // ex.: 25%
  // Proxy FCF: 60% da margem EBITDA, com limites 8%–22%
  const mfcfBase = clamp(0.6 * margemEbitdaPct, 8, 22);        // industrial PME conservador

  // parâmetros padrão combinados
  const anos = 5;
  const C = {nome:"Conservador", wacc:17, g:0, cagr:-5, mfcf: clamp(mfcfBase-2, 6, 22)};
  const B = {nome:"Base",        wacc:15, g:3, cagr: 0, mfcf: mfcfBase};
  const O = {nome:"Otimista",    wacc:13, g:5, cagr: 5, mfcf: clamp(mfcfBase+2, 8, 24)};

  // calcula EV por DCF (sem inputs do usuário)
  const cenarios = [C,B,O].map(c=>{
    const ev = dcfEV({receita0:receita, mfcfPct:c.mfcf, cagrPct:c.cagr, anos, waccPct:c.wacc, gPct:c.g}) || 0;
    const eq = Number.isFinite(dl)? (ev - dl) : null;
    return { ...c, ev, eq };
  });

  // preenche a aba DCF com o cenário Base para “Salvar (Base)”
  document.getElementById("vReceita").value = formatBRL(receita);
  document.getElementById("vMFCF").value    = B.mfcf.toFixed(1);
  document.getElementById("vCAGR").value    = B.cagr.toFixed(1);
  document.getElementById("vAnos").value    = String(anos);
  document.getElementById("vWacc").value    = B.wacc.toFixed(1);
  document.getElementById("vGTerm").value   = B.g.toFixed(1);
  document.getElementById("vEbitda").value  = formatBRL(ebitda);
  document.getElementById("vDL").value      = formatBRL(dl);

  // mostra resultados
  const box = document.getElementById("valResultados");
  box.style.display="block";
  box.innerHTML = `
    <div><b>Resultado automático (3 cenários)</b></div>
    ${table(cenarios)}
    <pre style="white-space:pre-wrap;margin:8px 0 0">
Usando somente dados do Financeiro: Receita (últ.) ${toBRL(receita)}, EBITDA (últ.) ${toBRL(ebitda)}, DL ${toBRL(dl)}.
Margem EBITDA = ${margemEbitdaPct.toFixed(1)}%. Proxy de Margem FCF = 60% da margem EBITDA (limitado a 8–22%) ⇒ Base = ${B.mfcf.toFixed(1)}%.
Horizonte = ${anos} anos. EV por DCF. Equity = EV − DL.
    </pre>
    <div class="muted">Clique em <b>Salvar os 3 cenários</b> para gravar tudo; ou em <b>Salvar (Base)</b> para gravar só o Base.</div>
  `;

  CTX.autoCenarios = { receita, ebitda, dl, anos, cenarios:[C,B,O].map((c,i)=>({...c, ...cenarios[i]})) };
}

// ===== Salvar (cenário Base) — reusa fluxo atual =====
document.getElementById("valSalvar").onclick = async ()=>{
  const e = id=> document.getElementById(id);
  const empresaId = CTX.empresaSel;
  if(!empresaId){ alert("Selecione a empresa pela tabela e clique em Novo."); return; }

  const receita= parseBRL(e("vReceita").value);
  const mfcf   = parseFloat(e("vMFCF").value||"");
  const cagr   = parseFloat(e("vCAGR").value||"");
  const anos   = parseInt(e("vAnos").value||"5",10);
  const wacc   = parseFloat(e("vWacc").value||"");
  const gterm  = parseFloat(e("vGTerm").value||"");
  const ebitda = parseBRL(e("vEbitda").value);
  const dl     = parseBRL(e("vDL").value);

  const dcf = calcDCF({receita0:receita, margemFCF:mfcf, cagr, anos, waccPct:wacc, gTermPct:gterm});
  const ev = dcf?.ev ?? null;
  const equity = Number.isFinite(dl) && Number.isFinite(ev) ? (ev - dl) : null;

  await salvarDocValuation({
    empresaId, metodo:"auto_base", ev, equity, receita, ebitda, dl,
    wacc, g:gterm, cagr, mfcf, anos,
    denormalizar:true  // atualiza “último valuation” com o Base
  });
  await listarEmpresas();
};

// ===== Salvar os 3 cenários =====
async function salvarTres(){
  const empresaId = CTX.empresaSel;
  if(!empresaId){ alert("Abra o modal pela tabela (Novo)."); return; }
  if(!CTX.autoCenarios){ alert("Clique primeiro em 'Auto (3 cenários)' para calcular."); return; }

  const {receita, ebitda, dl, anos, cenarios} = CTX.autoCenarios;

  // salva C, B, O
  for(const c of cenarios){
    await salvarDocValuation({
      empresaId,
      metodo: "auto_"+c.nome.toLowerCase(), // auto_conservador/auto_base/auto_otimista
      ev: c.ev, equity: c.eq, receita, ebitda, dl,
      wacc: c.wacc, g: c.g, cagr: c.cagr, mfcf: c.mfcf, anos,
      denormalizar: (c.nome==="Base") // usa o Base para atualizar “último”
    });
  }

  // feedback
  const box = document.getElementById("valResultados");
  box.style.display="block";
  box.innerHTML += `<div style="margin-top:8px;color:#065f46"><b>✔ Salvo:</b> conservador, base e otimista.</div>`;
  await listarEmpresas();
}

async function salvarDocValuation({empresaId, metodo, ev, equity, receita, ebitda, dl, wacc, g, cagr, mfcf, anos, denormalizar=false}){
  const ref = db.collection("empresas").doc(empresaId);
  const vref = ref.collection("valuation").doc();
  await vref.set({
    metodo, ev, equityValue:equity,
    receitaBase: receita??null, ebitdaBase: ebitda??null, dividaLiquidaBase: dl??null,
    wacc: Number.isFinite(wacc)? wacc/100 : null,
    g_terminal: Number.isFinite(g)? g/100 : null,
    cagrReceita: cagr??null,
    margemFCFPctRec: mfcf??null,
    anosProjecao: anos??5,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: CTX.uid
  }, {merge:true});

  if(denormalizar){
    await ref.set({
      ultimoValuationEV: ev??null,
      ultimoValuationEquity: equity??null,
      ultimoValuationMetodo: metodo,
      ultimoValuationData: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
  }
}
