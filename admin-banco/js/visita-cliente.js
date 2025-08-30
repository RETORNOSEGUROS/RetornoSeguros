/**************************************************************
 * visita-cliente.js — formulário público
 * - Lê empresa via querystring
 * - Faz login anônimo
 * - Carrega ramos/seguradoras do Firestore (após auth)
 * - Salva em /visitas com source: "cliente_link"
 **************************************************************/

// 0) Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();

// 1) Parâmetros do link (tolerantes)
const qp = new URLSearchParams(location.search);
function getQP(...keys){
  for (const k of keys){
    const v = qp.get(k) || qp.get(k.toLowerCase()) || qp.get(k.toUpperCase());
    if (v) return decodeURIComponent(v);
  }
  return "";
}
// aceita variações
const empresaId   = getQP("empresaId","empresa","idEmpresa","empresal");
const empresaNome = getQP("empresaNome","empresa_nome","nomeEmpresa");
const rmNomeURL   = getQP("rmNome","rm","rm_nome");

// pinta cabeçalho logo
document.getElementById("empresaNome").textContent = empresaNome || "(Empresa)";
document.getElementById("empresaInfo").textContent = empresaNome ? `Empresa: ${empresaNome}` : "";

// 2) Login anônimo
auth.signInAnonymously().catch(err => console.error("[auth anon]", err));

// 3) Helpers (máscaras/formatos)
function maskDDMMYYYY(value){
  let v=(value||"").replace(/\D/g,"").slice(0,8);
  if (v.length>=5) v=v.slice(0,2)+"/"+v.slice(2,4)+"/"+v.slice(4);
  else if (v.length>=3) v=v.slice(0,2)+"/"+v.slice(2);
  return v;
}
function validaDDMMYYYY(v){
  if (!v) return false;
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if(!m) return false;
  const d=+m[1], mo=+m[2], y=+m[3];
  if (d<1||d>31||mo<1||mo>12||y<1900) return false;
  const dt=new Date(y,mo-1,d);
  return dt.getFullYear()===y && (dt.getMonth()+1)===mo && dt.getDate()===d;
}
function maskMoedaBR(v){
  v=(v||"").toString().replace(/\D/g,"");
  if(!v) return "R$ 0,00";
  v=(parseInt(v,10)/100).toFixed(2);
  let [i,d]=v.split(".");
  i=i.replace(/\B(?=(\d{3})+(?!\d))/g,".");
  return "R$ "+i+","+d;
}
function parseMoedaBRToNumber(str){
  if(!str) return 0;
  return parseFloat(str.replace(/[R$\s\.]/g,"").replace(",", ".")) || 0;
}

// 4) Carregamento Firestore (seguradoras / ramos)
function carregarSeguradoras(){
  return db.collection("seguradoras").get()
    .then(snap=>{
      const arr=[];
      snap.forEach(doc=>{
        const n=(doc.data()?.nome||"").toString().trim();
        if (n) arr.push(n);
      });
      return arr.sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}));
    })
    .catch(err=>{
      console.warn("[seguradoras] read negado/erro:", err?.code||err);
      return [];
    });
}

async function carregarRamosSeguro(){
  // 1ª tentativa: orderBy("ordem")
  try{
    const snap = await db.collection("ramos-seguro").orderBy("ordem").get();
    const r=[]; snap.forEach(doc=>{
      const d=doc.data()||{};
      r.push({ id:doc.id, nome: d.nomeExibicao || d.nome || doc.id });
    });
    if (r.length) return r;
  }catch(e){
    // 2ª tentativa: sem orderBy (coleção sem campo "ordem")
    try{
      const snap = await db.collection("ramos-seguro").get();
      const r=[]; snap.forEach(doc=>{
        const d=doc.data()||{};
        r.push({ id:doc.id, nome: d.nomeExibicao || d.nome || doc.id });
      });
      if (r.length) return r;
    }catch(e2){
      console.warn("[ramos-seguro] read negado/erro:", e2?.code||e2);
    }
  }

  // fallback (para não quebrar UX em caso de bloqueio nas rules)
  return [
    { id:"auto",        nome:"Automóvel"     },
    { id:"vida",        nome:"Vida"          },
    { id:"saude",       nome:"Saúde"         },
    { id:"empresarial", nome:"Empresarial"   },
    { id:"residencial", nome:"Residencial"   },
  ];
}

// 5) Montagem da UI
async function gerarCamposRamos(){
  const [seguradoras, ramos] = await Promise.all([
    carregarSeguradoras(),
    carregarRamosSeguro()
  ]);

  const container = document.getElementById("ramos-container");
  container.innerHTML = "";

  ramos.forEach(ramo=>{
    const box = document.createElement("div");
    box.className = "ramo-box";

    const head = document.createElement("div");
    head.className = "head";

    const chk = document.createElement("input");
    chk.type="checkbox"; chk.className="ramo"; chk.value=ramo.id;

    const lbl = document.createElement("label");
    lbl.style.margin="0"; lbl.append(" "+ramo.nome);

    head.appendChild(chk);
    head.appendChild(lbl);
    box.appendChild(head);

    const sub = document.createElement("div");
    sub.className = "subcampos";
    sub.id = `campos-${ramo.id}`;
    sub.innerHTML = `
      <label>Vencimento (dd/mm/aaaa):</label>
      <input type="text" id="${ramo.id}-vencimento" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">

      <label>Prêmio anual (R$):</label>
      <input type="text" id="${ramo.id}-premio" placeholder="R$ 0,00">

      <label>Seguradora:</label>
      <select id="${ramo.id}-seguradora">
        <option value="">Selecione</option>
        ${seguradoras.map(s=>`<option value="${s}">${s}</option>`).join("")}
      </select>

      <label>Observações:</label>
      <textarea id="${ramo.id}-observacoes" placeholder="Comentários ou detalhes adicionais..."></textarea>
    `;

    sub.querySelector(`#${ramo.id}-vencimento`).addEventListener("input", e=>{
      e.target.value = maskDDMMYYYY(e.target.value);
    });
    const premioInput = sub.querySelector(`#${ramo.id}-premio`);
    premioInput.addEventListener("input", e=>{
      e.target.value = maskMoedaBR(e.target.value);
    });
    premioInput.addEventListener("focus", e=>{
      if (!e.target.value) e.target.value = "R$ 0,00";
    });

    chk.addEventListener("change", ()=>{
      sub.style.display = chk.checked ? "block" : "none";
    });

    box.appendChild(sub);
    container.appendChild(box);
  });
}

// 6) Envio
async function enviar(){
  if (!empresaId){ alert("Link inválido (sem empresa)."); return; }

  const user = auth.currentUser;
  const tipoVisita = "Cliente";
  const nfStr = (document.getElementById("numFuncionarios")?.value || "").trim();
  const numeroFuncionarios = nfStr==="" ? null : Math.max(0, parseInt(nfStr,10) || 0);

  const visita = {
    source: "cliente_link",
    empresaId, empresaNome,
    tipoVisita,
    rmNome: rmNomeURL || "",
    rmUid: null,
    agenciaId: "",
    usuarioId: user?.uid || null,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    numeroFuncionarios,
    ramos: {}
  };

  let algum=false, erro=null;
  document.querySelectorAll(".ramo").forEach(chk=>{
    if (!chk.checked) return;
    algum=true;
    const id=chk.value;

    const venc = (document.getElementById(`${id}-vencimento`)?.value || "").trim();
    const premioStr = (document.getElementById(`${id}-premio`)?.value || "");
    const seg = (document.getElementById(`${id}-seguradora`)?.value || "");
    const obs = (document.getElementById(`${id}-observacoes`)?.value || "");

    if (!validaDDMMYYYY(venc)) erro = `Vencimento inválido em ${id}. Use dd/mm/aaaa.`;

    visita.ramos[id] = {
      vencimento: venc,
      premio: parseMoedaBRToNumber(premioStr),
      seguradora: seg,
      observacoes: obs
    };
  });

  if (erro) return alert(erro);
  if (!algum) return alert("Marque pelo menos um ramo e preencha os campos.");

  try{
    await db.collection("visitas").add(visita);
    document.getElementById("ok").style.display = "block";
  }catch(e){
    console.error("[visitas.add]", e);
    alert("Erro ao enviar. Tente novamente.");
  }
}
window.enviar = enviar;

// 7) Bootstrap — **só carrega ramos após auth anônima**
document.addEventListener("DOMContentLoaded", ()=>{
  auth.onAuthStateChanged(user=>{
    if (!user) return; // espera logar anonimamente
    gerarCamposRamos().catch(e=>console.error("Falha ao montar ramos:", e));
  });
});
