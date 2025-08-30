/**************************************************************
 * visita-cliente.js — público (cliente)
 * Mostra APENAS o que vier do Firestore. Sem fallback.
 **************************************************************/
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();

/* ---------- QueryString (tolerante) ---------- */
const qp = new URLSearchParams(location.search);
const getQP = (...keys) => {
  for (const k of keys) {
    const v = qp.get(k) || qp.get(k.toLowerCase()) || qp.get(k.toUpperCase());
    if (v) return decodeURIComponent(v);
  }
  return "";
};
const empresaId   = getQP("empresaId","empresa","idEmpresa","empresal");
const empresaNome = getQP("empresaNome","empresa_nome","nomeEmpresa");
const rmNomeURL   = getQP("rmNome","rm","rm_nome");

document.getElementById("empresaNome").textContent = empresaNome || "(Empresa)";
document.getElementById("empresaInfo").textContent = empresaNome ? `Empresa: ${empresaNome}` : "";

/* ---------- Helpers ---------- */
function maskDDMMYYYY(value){let v=(value||"").replace(/\D/g,"").slice(0,8);if(v.length>=5)v=v.slice(0,2)+"/"+v.slice(2,4)+"/"+v.slice(4);else if(v.length>=3)v=v.slice(0,2)+"/"+v.slice(2);return v;}
function validaDDMMYYYY(v){if(!v)return false;const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);if(!m)return false;const d=+m[1],mo=+m[2],y=+m[3];const dt=new Date(y,mo-1,d);return dt.getFullYear()===y&&(dt.getMonth()+1)===mo&&dt.getDate()===d;}
function maskMoedaBR(v){v=(v||"").toString().replace(/\D/g,"");if(!v)return"R$ 0,00";v=(parseInt(v,10)/100).toFixed(2);let[i,d]=v.split(".");i=i.replace(/\B(?=(\d{3})+(?!\d))/g,".");return"R$ "+i+","+d;}
function parseMoedaBRToNumber(str){if(!str)return 0;return parseFloat(str.replace(/[R$\s\.]/g,"").replace(",", "."))||0;}

/* ---------- Nomes das coleções (confirme) ---------- */
const COLEC_RAMO = "ramos-seguro";
const COLEC_SEG  = "seguradoras";

/* ---------- Carregadores Firestore (sem fallback) ---------- */
async function carregarRamos() {
  try {
    let snap;
    try {
      snap = await db.collection(COLEC_RAMO).orderBy("ordem").get();
    } catch {
      // se a coleção não tem 'ordem', tenta sem orderBy
      snap = await db.collection(COLEC_RAMO).get();
    }
    const r = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      const nome = d.nomeExibicao || d.nome || doc.id;
      if (nome) r.push({ id: doc.id, nome });
    });
    return r; // pode vir vazio (mostramos aviso)
  } catch (e) {
    console.error("[ramos] erro ao ler Firestore:", e);
    throw e;
  }
}

async function carregarSeguradoras() {
  try {
    const snap = await db.collection(COLEC_SEG).get();
    const arr = [];
    snap.forEach(doc => {
      const n = (doc.data()?.nome || "").toString().trim();
      if (n) arr.push(n);
    });
    return arr.sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}));
  } catch (e) {
    console.error("[seguradoras] erro ao ler Firestore:", e);
    // retornamos null para indicar erro e trocar por input texto
    return null;
  }
}

/* ---------- UI ---------- */
function aviso(container, msg) {
  container.innerHTML =
    `<div style="background:#fff3cd;border:1px solid #ffe58f;color:#7a5d00;padding:12px;border-radius:10px">
       ${msg}
     </div>`;
}

async function gerarCamposRamos() {
  const container = document.getElementById("ramos-container");
  container.innerHTML = '<div style="color:#6b7280">Carregando ramos…</div>';

  let ramos;
  try {
    ramos = await carregarRamos();
  } catch (e) {
    aviso(container, `Não foi possível carregar os ramos.<br>
      Verifique se <strong>Authentication → Anonymous</strong> está habilitado e se as
      <strong>Rules</strong> permitem <code>read</code> em <code>${COLEC_RAMO}</code> para anônimo.`);
    return;
  }

  if (!ramos || ramos.length === 0) {
    aviso(container, `Nenhum ramo encontrado em <code>${COLEC_RAMO}</code>.<br>
      Se esta coleção existe, confirme as <strong>Rules</strong> de leitura para anônimo.`);
    return;
  }

  // tenta carregar seguradoras; se falhar, usaremos input texto
  const seguradoras = await carregarSeguradoras();

  container.innerHTML = "";
  ramos.forEach(r => {
    const box = document.createElement("div");
    box.className = "ramo-box";

    const head = document.createElement("div");
    head.className = "head";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "ramo";
    chk.value = r.id;

    const lbl = document.createElement("label");
    lbl.style.margin = "0";
    lbl.append(" " + r.nome);

    head.appendChild(chk);
    head.appendChild(lbl);
    box.appendChild(head);

    const sub = document.createElement("div");
    sub.className = "subcampos";
    sub.id = `campos-${r.id}`;

    // bloco "Seguradora": se não conseguimos ler do banco, vira <input type="text">
    const campoSeguradora = (seguradoras && seguradoras.length)
      ? `<label>Seguradora:</label>
         <select id="${r.id}-seguradora">
           <option value="">Selecione</option>
           ${seguradoras.map(s=>`<option value="${s}">${s}</option>`).join("")}
         </select>`
      : `<label>Seguradora (digite):</label>
         <input type="text" id="${r.id}-seguradora" placeholder="Ex.: Porto, Bradesco, Tokio..." />`;

    sub.innerHTML = `
      <label>Vencimento (dd/mm/aaaa):</label>
      <input type="text" id="${r.id}-vencimento" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">

      <label>Prêmio anual (R$):</label>
      <input type="text" id="${r.id}-premio" placeholder="R$ 0,00">

      ${campoSeguradora}

      <label>Observações:</label>
      <textarea id="${r.id}-observacoes" placeholder="Comentários ou detalhes adicionais..."></textarea>
    `;

    sub.querySelector(`#${r.id}-vencimento`).addEventListener("input", e => {
      e.target.value = maskDDMMYYYY(e.target.value);
    });
    const premioInput = sub.querySelector(`#${r.id}-premio`);
    premioInput.addEventListener("input", e => {
      e.target.value = maskMoedaBR(e.target.value);
    });

    chk.addEventListener("change", () => {
      sub.style.display = chk.checked ? "block" : "none";
    });

    box.appendChild(sub);
    container.appendChild(box);
  });

  // se não conseguimos ler seguradoras, mostre um lembrete sob a seção
  if (seguradoras === null) {
    const note = document.createElement("div");
    note.style.cssText = "margin-top:8px;color:#7a5d00;font-size:13px";
    note.innerHTML = `Não foi possível carregar <strong>${COLEC_SEG}</strong> do Firestore.
      O cliente poderá digitar a seguradora manualmente. Verifique Rules para leitura anônima.`;
    container.appendChild(note);
  }
}

/* ---------- Enviar ---------- */
async function enviar(){
  if (!empresaId){ alert("Link inválido (sem empresa)."); return; }

  const user = auth.currentUser;
  const nfStr = (document.getElementById("numFuncionarios")?.value || "").trim();
  const numeroFuncionarios = nfStr==="" ? null : Math.max(0, parseInt(nfStr,10) || 0);

  const visita = {
    source: "cliente_link",
    empresaId,
    empresaNome,
    tipoVisita: "Cliente",
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
    if(!chk.checked) return; algum=true;
    const id=chk.value;
    const venc=(document.getElementById(`${id}-vencimento`)?.value||"").trim();
    const premioStr=(document.getElementById(`${id}-premio`)?.value||"");
    const seg=(document.getElementById(`${id}-seguradora`)?.value||"");
    const obs=(document.getElementById(`${id}-observacoes`)?.value||"");
    if(!validaDDMMYYYY(venc)) erro=`Vencimento inválido em ${id}. Use dd/mm/aaaa.`;
    visita.ramos[id]={ vencimento:venc, premio:parseMoedaBRToNumber(premioStr), seguradora:seg, observacoes:obs };
  });

  if (erro) return alert(erro);
  if (!algum) return alert("Marque pelo menos um ramo.");

  try{
    await db.collection("visitas").add(visita);
    document.getElementById("ok").style.display="block";
  }catch(e){
    console.error("[visitas.add]", e);
    alert("Erro ao enviar. Tente novamente.");
  }
}
window.enviar = enviar;

/* ---------- Bootstrap: só depois do login anônimo ---------- */
document.addEventListener("DOMContentLoaded", () => {
  auth.signInAnonymously()
    .then(()=>{
      auth.onAuthStateChanged(user=>{
        if (!user) return;
        gerarCamposRamos().catch(e=>console.error("Falha ao montar ramos:", e));
      });
    })
    .catch(err=>{
      console.error("[auth anon] erro:", err);
      // mesmo assim tenta montar (vai mostrar aviso se não conseguir ler)
      gerarCamposRamos().catch(e=>console.error("Falha ao montar ramos:", e));
    });
});
