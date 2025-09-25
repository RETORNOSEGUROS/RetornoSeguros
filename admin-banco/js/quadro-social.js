// /admin-banco/js/quadro-social.js

// ==== Firebase ====
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ==== UI ====
const qs        = new URLSearchParams(location.search);
const elBusca   = document.getElementById("busca");
const elSelect  = document.getElementById("empresaSelect");
const elLista   = document.getElementById("listaSocios");
const elAdd     = document.getElementById("addSocio");
const elSalvar  = document.getElementById("salvarTudo");
const elSoma    = document.getElementById("somaPerc");
const elHint    = document.getElementById("sumHint");
const elErr     = document.getElementById("err");

// Debug banner
function showErr(msg){ if(!elErr) return; elErr.textContent = msg; elErr.style.display = "block"; }
function showDebug(obj){
  const s = `[QuadroSocial] uid=${obj.uid||"-"} | role=${obj.role||"-"} | agenciaId=${obj.agenciaId??"-"} | admin=${obj.isAdmin}`;
  console.log(s);
  showErr(s);
}

let empresaIdAtual = qs.get("empresaId") || "";
let unsubSocios = null;
let cacheAlteracoes = new Map();
let cacheNovos = [];
let perfil = { role: "user", agenciaId: null, isAdmin: false };

// ==== Utils ====
const ddmmyyyyMask = v => { let s=(v||"").replace(/\D/g,'').slice(0,8); if(s.length>=5)s=s.slice(0,2)+"/"+s.slice(2,4)+"/"+s.slice(4); else if(s.length>=3)s=s.slice(0,2)+"/"+s.slice(2); return s; };
const validaData   = v => { const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v||""); if(!m)return false; const d=+m[1],mo=+m[2],y=+m[3]; const dt=new Date(y,mo-1,d); return dt.getFullYear()===y&&dt.getMonth()+1===mo&&dt.getDate()===d; };
const pct          = n => isNaN(+n)?0:+(+n).toFixed(2);
const looksAdmin   = r => { if(!r) return false; const s=(Array.isArray(r)?r.join(','):String(r)).toLowerCase(); return s.includes("admin"); };

function setSomaPercentual(){
  let soma = 0;
  elLista.querySelectorAll("tr[data-id], tr[data-new]").forEach(tr=>{
    const p = parseFloat(tr.querySelector(".inp-perc").value);
    if(!isNaN(p)) soma += p;
  });
  soma = +soma.toFixed(2);
  elSoma.textContent = soma;
  if (soma === 100) { elHint.textContent = "Fechado em 100%."; elHint.className = "help sum-ok"; }
  else if (soma < 100){ elHint.textContent = `Faltam ${(100-soma).toFixed(2)} p.p.`; elHint.className = "help"; }
  else { elHint.textContent = `Excedeu ${(soma-100).toFixed(2)} p.p.`; elHint.className = "help sum-warn"; }
}

function rowSocio(docId, data){
  const tr = document.createElement("tr");
  if (docId) tr.dataset.id = docId; else tr.dataset.new = "1";
  tr.innerHTML = `
    <td><input class="inp-nome" type="text" value="${data.nome||""}" placeholder="Nome completo" /></td>
    <td><input class="inp-nasc" type="text" value="${data.dataNascimento||""}" placeholder="dd/mm/aaaa" maxlength="10"/></td>
    <td><input class="inp-perc" type="number" step="0.01" min="0" max="100" value="${data.percentual??""}" /></td>
    <td class="td-upd">${data.atualizadoEm ? (data.atualizadoEm.toDate?.().toLocaleString?.() || "-") : "-"}</td>
    <td class="actions"><button class="btn-sec bt-del">Excluir</button></td>
  `;
  tr.querySelector(".inp-nasc").addEventListener("input", e=> e.target.value = ddmmyyyyMask(e.target.value));
  tr.querySelectorAll(".inp-nome,.inp-nasc,.inp-perc").forEach(inp=>{
    inp.addEventListener("input", ()=>{
      if (docId){
        cacheAlteracoes.set(docId, {
          nome: tr.querySelector(".inp-nome").value.trim(),
          dataNascimento: tr.querySelector(".inp-nasc").value.trim(),
          percentual: pct(tr.querySelector(".inp-perc").value)
        });
      } else {
        const idx = [...elLista.querySelectorAll('tr[data-new]')].indexOf(tr);
        cacheNovos[idx] = {
          nome: tr.querySelector(".inp-nome").value.trim(),
          dataNascimento: tr.querySelector(".inp-nasc").value.trim(),
          percentual: pct(tr.querySelector(".inp-perc").value)
        };
      }
      setSomaPercentual();
    });
  });
  tr.querySelector(".bt-del").addEventListener("click", async ()=>{
    if (docId){
      if (!confirm("Excluir este sócio?")) return;
      await db.collection("empresas").doc(empresaIdAtual).collection("quadro_social").doc(docId).delete();
    } else {
      tr.remove(); setSomaPercentual();
    }
  });
  return tr;
}

function renderVazio(msg="Nenhum sócio cadastrado."){
  elLista.innerHTML = `<tr><td class="empty" colspan="5">${msg}</td></tr>`;
  setSomaPercentual();
}

function listenSocios(){
  if (!empresaIdAtual){ renderVazio("Selecione uma empresa para carregar o quadro social."); return; }
  if (unsubSocios) unsubSocios();
  cacheAlteracoes.clear(); cacheNovos = [];

  db.collection("empresas").doc(empresaIdAtual)
    .collection("quadro_social")
    .orderBy("nome")
    .onSnapshot(snap=>{
      elLista.innerHTML = "";
      if (snap.empty){ renderVazio(); return; }
      snap.forEach(doc=> elLista.appendChild(rowSocio(doc.id, doc.data()||{})) );
      setSomaPercentual();
    }, err=>{
      console.error("listenSocios error:", err);
      showErr("Sem permissão para ler quadro_social ou rules bloqueando.");
      renderVazio("Erro ao carregar (permissão).");
    });
}

// ==== PERFIL e EMPRESAS ====
async function getPerfil(uid){
  // tenta claims e coleções
  let isAdminClaim = false;
  try {
    const token = await auth.currentUser.getIdTokenResult(true);
    const c = token.claims || {};
    isAdminClaim = !!(c.admin || c.isAdmin || (Array.isArray(c.roles)&&c.roles.includes('admin')) || c.role === 'admin');
  } catch(e){ /* ignore */ }

  let p = {};
  for (const ref of [
    db.collection("usuarios_banco").doc(uid),
    db.collection("usuarios").doc(uid)
  ]) {
    try { const d = await ref.get(); if (d.exists) { p = d.data()||{}; break; } }
    catch(e){ /* ignore */ }
  }
  const role = p.role || p.perfil || (isAdminClaim ? "admin" : "user");
  const agenciaId = qs.get("agenciaId") || p.agenciaId || p.agencia || null; // permite forçar via ?agenciaId=3495
  return { role, agenciaId, isAdmin: isAdminClaim || looksAdmin(role) };
}

async function carregarEmpresas(filtro=""){
  try {
    let ref = db.collection("empresas");

    // Filtragem por agência obrigatória para não-admin.
    if (!perfil.isAdmin) {
      const ag = (perfil.agenciaId ? String(perfil.agenciaId) : "__none__");
      ref = ref.where("agenciaId","==", ag);
    }

    // orderBy seguro
    let snap;
    try { snap = await ref.orderBy("nome").get(); }
    catch { try { snap = await ref.orderBy("razaoSocial").get(); } catch { snap = await ref.get(); } }

    const itens = [];
    snap.forEach(doc=>{
      const d = doc.data() || {};
      const nome = d.nome || d.razaoSocial || d.fantasia || doc.id;
      const cnpj = d.cnpj || "";
      const agencia = d.agenciaId || d.agencia || "";
      const txt = `${nome} ${cnpj} ${agencia}`.toLowerCase();
      if (!filtro || txt.includes(filtro.toLowerCase())) itens.push({id:doc.id, nome});
    });
    itens.sort((a,b)=> a.nome.localeCompare(b.nome,'pt'));
    elSelect.innerHTML = `<option value="">Selecione...</option>` + itens.map(i=>`<option value="${i.id}">${i.nome}</option>`).join("");

    if (empresaIdAtual){
      elSelect.value = empresaIdAtual;
      listenSocios();
    } else if (itens.length === 0){
      renderVazio(perfil.isAdmin ? "Nenhuma empresa encontrada." : "Nenhuma empresa para sua agência.");
    }
  } catch (e){
    console.error("carregarEmpresas error:", e);
    showErr("Erro ao listar empresas. Verifique rules/permissões.");
    elSelect.innerHTML = `<option value="">(erro ao carregar)</option>`;
    renderVazio("Erro ao carregar empresas.");
  }
}

// ==== Eventos ====
elBusca.addEventListener("input", (e)=>carregarEmpresas(e.target.value));
elSelect.addEventListener("change", ()=>{ empresaIdAtual = elSelect.value || ""; listenSocios(); });
elAdd.addEventListener("click", ()=>{
  if (!empresaIdAtual) return alert("Selecione uma empresa primeiro.");
  if (elLista.querySelector(".empty")) elLista.innerHTML = "";
  const tr = rowSocio(null, {nome:"", dataNascimento:"", percentual:""});
  elLista.appendChild(tr);
  setSomaPercentual();
  tr.querySelector(".inp-nome").focus();
});
elSalvar.addEventListener("click", async ()=>{
  if (!empresaIdAtual) return alert("Selecione uma empresa.");
  for (const tr of elLista.querySelectorAll("tr[data-id], tr[data-new]")){
    const nome = tr.querySelector(".inp-nome").value.trim();
    const nasc = tr.querySelector(".inp-nasc").value.trim();
    const perc = parseFloat(tr.querySelector(".inp-perc").value);
    if (!nome) return alert("Há sócio sem nome.");
    if (!validaData(nasc)) return alert(`Data inválida (${nasc}). Use dd/mm/aaaa.`);
    if (isNaN(perc) || perc < 0 || perc > 100) return alert(`Percentual inválido (${perc}).`);
  }
  const batch = db.batch();
  const col = db.collection("empresas").doc(empresaIdAtual).collection("quadro_social");
  const now = firebase.firestore.FieldValue.serverTimestamp();

  for (const [docId, payload] of cacheAlteracoes.entries()){
    batch.update(col.doc(docId), {...payload, atualizadoEm: now});
  }
  elLista.querySelectorAll("tr[data-new]").forEach(tr=>{
    const nome = tr.querySelector(".inp-nome").value.trim();
    const nasc = tr.querySelector(".inp-nasc").value.trim();
    const perc = parseFloat(tr.querySelector(".inp-perc").value);
    batch.set(col.doc(), { nome, dataNascimento:nasc, percentual:pct(perc), origem:"admin", criadoEm:now, atualizadoEm:now });
  });

  try { await batch.commit(); cacheAlteracoes.clear(); cacheNovos = []; alert("Quadro social salvo."); }
  catch (e){ console.error("commit error:", e); showErr("Falha ao salvar (rules)."); }
});

// ==== Boot com guard e debug ====
auth.onAuthStateChanged(async (u)=>{
  if (!u) {
    const next = encodeURIComponent(location.pathname.replace(/^\/+/,''));
    location.href = `/admin-banco/login.html?next=${next}`;
    return;
  }
  perfil = await getPerfil(u.uid);
  showDebug({ uid: u.uid, role: perfil.role, agenciaId: perfil.agenciaId, isAdmin: perfil.isAdmin });
  await carregarEmpresas("");
  if (!empresaIdAtual && elSelect.value) empresaIdAtual = elSelect.value;
  if (empresaIdAtual) listenSocios();
});
