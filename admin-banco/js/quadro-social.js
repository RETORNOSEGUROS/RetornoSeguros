// Inicialização Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Elements
const qs = new URLSearchParams(location.search);
const elBusca   = document.getElementById("busca");
const elSelect  = document.getElementById("empresaSelect");
const elLista   = document.getElementById("listaSocios");
const elAdd     = document.getElementById("addSocio");
const elSalvar  = document.getElementById("salvarTudo");
const elSoma    = document.getElementById("somaPerc");
const elHint    = document.getElementById("sumHint");

let empresaIdAtual = qs.get("empresaId") || "";
let unsubSocios = null;
let cacheAlteracoes = new Map(); // docId => {nome, dataNascimento, percentual}
let cacheNovos = []; // itens ainda sem docId

function ddmmyyyyMask(v){
  let s = (v || "").replace(/\D/g,'').slice(0,8);
  if (s.length >= 5) s = s.slice(0,2)+"/"+s.slice(2,4)+"/"+s.slice(4);
  else if (s.length >= 3) s = s.slice(0,2)+"/"+s.slice(2);
  return s;
}
function validaData(v){
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v||"");
  if (!m) return false;
  const d=+m[1], mo=+m[2], y=+m[3];
  const dt = new Date(y, mo-1, d);
  return dt.getFullYear()===y && dt.getMonth()+1===mo && dt.getDate()===d;
}
function pct(n){ return isNaN(+n) ? 0 : +(+n).toFixed(2) }

function setSomaPercentual(){
  let soma = 0;
  // ler do DOM atual:
  elLista.querySelectorAll("tr[data-id], tr[data-new]").forEach(tr=>{
    const perc = parseFloat(tr.querySelector(".inp-perc").value);
    if (!isNaN(perc)) soma += perc;
  });
  soma = +soma.toFixed(2);
  elSoma.textContent = soma;

  if (soma === 100) {
    elHint.textContent = "Fechado em 100%.";
    elHint.className = "help sum-ok";
  } else if (soma < 100) {
    elHint.textContent = `Faltam ${(100 - soma).toFixed(2)} p.p.`;
    elHint.className = "help";
  } else {
    elHint.textContent = `Excedeu ${(soma - 100).toFixed(2)} p.p.`;
    elHint.className = "help sum-warn";
  }
}

function rowSocio(docId, data){
  const tr = document.createElement("tr");
  if (docId) tr.dataset.id = docId; else tr.dataset.new = "1";

  tr.innerHTML = `
    <td><input class="inp-nome" type="text" value="${data.nome||""}" placeholder="Nome completo" /></td>
    <td><input class="inp-nasc" type="text" value="${data.dataNascimento||""}" placeholder="dd/mm/aaaa" maxlength="10"/></td>
    <td><input class="inp-perc" type="number" step="0.01" min="0" max="100" value="${data.percentual??""}" /></td>
    <td class="td-upd">${data.atualizadoEm ? data.atualizadoEm.toDate?.().toLocaleString() : "-"}</td>
    <td class="actions">
      <button class="btn-sec bt-del">Excluir</button>
    </td>
  `;

  tr.querySelector(".inp-nasc").addEventListener("input", e=>{
    e.target.value = ddmmyyyyMask(e.target.value);
  });

  // marca alteração
  tr.querySelectorAll(".inp-nome,.inp-nasc,.inp-perc").forEach(inp=>{
    inp.addEventListener("input", ()=>{
      if (docId) {
        cacheAlteracoes.set(docId, {
          nome: tr.querySelector(".inp-nome").value.trim(),
          dataNascimento: tr.querySelector(".inp-nasc").value.trim(),
          percentual: pct(tr.querySelector(".inp-perc").value)
        });
      } else {
        // novo
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
    if (docId) {
      const ok = confirm("Excluir este sócio? Esta ação não pode ser desfeita.");
      if (!ok) return;
      await db.collection("empresas").doc(empresaIdAtual)
              .collection("quadro_social").doc(docId).delete();
    } else {
      tr.remove();
      setSomaPercentual();
    }
  });

  return tr;
}

function renderVazio(){
  elLista.innerHTML = `<tr><td class="empty" colspan="5">Nenhum sócio cadastrado.</td></tr>`;
  setSomaPercentual();
}

function listenSocios(){
  if (!empresaIdAtual) { renderVazio(); return; }
  if (unsubSocios) unsubSocios();

  cacheAlteracoes.clear();
  cacheNovos = [];

  unsubSocios = db.collection("empresas").doc(empresaIdAtual)
    .collection("quadro_social")
    .orderBy("nome")
    .onSnapshot(snap=>{
      elLista.innerHTML = "";
      if (snap.empty) { renderVazio(); return; }
      snap.forEach(doc=>{
        const d = doc.data() || {};
        elLista.appendChild(rowSocio(doc.id, d));
      });
      setSomaPercentual();
    }, err=>{
      console.error(err);
      renderVazio();
      alert("Erro ao carregar o quadro social. Verifique permissões.");
    });
}

async function carregarEmpresas(filtro=""){
  let ref = db.collection("empresas");
  // Firestore v8 não tem where com OR aqui simples; filtra no client:
  const snap = await ref.get();
  const itens = [];
  snap.forEach(doc=>{
    const d = doc.data() || {};
    const nome = d.nome || d.razaoSocial || d.fantasia || doc.id;
    const cnpj = d.cnpj || "";
    const agencia = d.agenciaId || d.agencia || "";
    const txt = `${nome} ${cnpj} ${agencia}`.toLowerCase();
    if (!filtro || txt.includes(filtro.toLowerCase())) {
      itens.push({id: doc.id, nome});
    }
  });
  itens.sort((a,b)=>a.nome.localeCompare(b.nome,'pt'));
  elSelect.innerHTML = `<option value="">Selecione...</option>`+
    itens.map(i=>`<option value="${i.id}">${i.nome}</option>`).join("");

  // pré-seleção se veio por querystring
  if (empresaIdAtual) {
    elSelect.value = empresaIdAtual;
    listenSocios();
  }
}

// Eventos UI
elBusca.addEventListener("input", (e)=>carregarEmpresas(e.target.value));
elSelect.addEventListener("change", ()=>{
  empresaIdAtual = elSelect.value || "";
  listenSocios();
});

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
  // validações
  for (const tr of elLista.querySelectorAll("tr[data-id], tr[data-new]")) {
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

  // updates
  for (const [docId, payload] of cacheAlteracoes.entries()) {
    batch.update(col.doc(docId), {...payload, atualizadoEm: now});
  }
  // creates
  elLista.querySelectorAll("tr[data-new]").forEach(tr=>{
    const nome = tr.querySelector(".inp-nome").value.trim();
    const nasc = tr.querySelector(".inp-nasc").value.trim();
    const perc = parseFloat(tr.querySelector(".inp-perc").value);
    const ref = col.doc();
    batch.set(ref, {
      nome,
      dataNascimento: nasc,
      percentual: pct(perc),
      origem: "admin",
      criadoEm: now,
      atualizadoEm: now
    });
  });

  try {
    await batch.commit();
    cacheAlteracoes.clear();
    cacheNovos = [];
    alert("Quadro social salvo com sucesso.");
  } catch (e){
    console.error(e);
    alert("Falha ao salvar. Verifique as rules e tente novamente.");
  }
});

// Boot
(async function init(){
  try { await auth.signInAnonymously(); } catch(e){ /* seu admin já deve autenticar; anon fallback */ }
  await carregarEmpresas("");
  if (!empresaIdAtual && elSelect.value) empresaIdAtual = elSelect.value;
  if (empresaIdAtual) listenSocios();
})();

