// ===== Firebase =====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

const COL_USERS     = db.collection("usuarios_banco");
const COL_COMISSOES = db.collection("comissoes_negocios");
const COL_RESGATES  = db.collection("resgates_carteira");

// ===== Estado =====
let me = null;              // {uid, email, nome, perfil, agenciaId, isAdmin}
let viewUid = null;         // usuário “em visualização” (admin pode simular)
let entradas = [];          // [{empresa, competenciaISO, valor}]
let saidas  = [];           // [{dataISO, metodo, valor, status}]
let totais  = { ganho:0, resgatado:0, pendente:0, saldo:0 };

const $ = (id)=>document.getElementById(id);
const moneyFmt = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const money = n => moneyFmt.format(Number(n||0));
const norm  = s => (s||"").toString().normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
const todayISO = () => new Date().toISOString().slice(0,10);

// ===== Boot =====
window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return (location.href="login.html");

    const profSnap = await COL_USERS.doc(user.uid).get();
    const p = profSnap.exists ? (profSnap.data()||{}) : {};
    me = {
      uid: user.uid,
      email: user.email,
      nome: p.nome || user.email,
      perfil: (p.perfil || "").toLowerCase(),
      agenciaId: p.agenciaId || "",
      isAdmin: user.email === "patrick@retornoseguros.com.br" || (p.perfil||"").toLowerCase()==="admin",
    };

    $("labelPerfil").textContent = `Perfil: ${me.perfil || "-"}${me.isAdmin ? " (admin)" : ""}`;

    // Admin pode “ver como”
    if (me.isAdmin) {
      $("boxAdminSwitch").style.display = "block";
      await carregarListaUsuariosParaAdmin();
      $("btnAdminAplicar").onclick = () => {
        viewUid = $("adminUserView").value || me.uid;
        atualizarTudo();
      };
    }

    viewUid = me.uid;

    $("btnAplicar").onclick = aplicarFiltros;
    $("btnLimpar").onclick = () => {
      ["fIni","fFim","fEmpresa","fStatusSaida"].forEach(id => { const el=$(id); if(el) el.value=""; });
      aplicarFiltros();
    };

    $("btnNovoResgate").onclick   = abrirDrawer;
    $("btnSalvarResgate").onclick = salvarResgate;

    await atualizarTudo();
  });
});

async function carregarListaUsuariosParaAdmin(){
  const sel = $("adminUserView");
  sel.innerHTML = `<option value="${me.uid}">Eu (${me.email})</option>`;
  const snap = await COL_USERS.get();
  snap.forEach(doc=>{
    const u = doc.data()||{};
    sel.insertAdjacentHTML("beforeend",
      `<option value="${doc.id}">${u.nome||doc.id} — ${(u.perfil||"-").toLowerCase()}</option>`);
  });
}

// ===== Fluxo principal =====
async function atualizarTudo(){
  await carregarEntradas();
  await carregarSaidas();
  calcularTotais();  // agora garante métricas > 0 quando houver dados
  renderMetrica();
  aplicarFiltros();  // também atualiza os contadores com soma dos filtrados
}

// =========== Carregar ENTRADAS ===========
async function carregarEntradas(){
  entradas = [];
  const hoje = todayISO();

  // perfil/ agência do usuário em visualização
  let perfilView = me.perfil;
  let agenciaView = me.agenciaId;

  if (me.isAdmin && viewUid !== me.uid) {
    const vs = await COL_USERS.doc(viewUid).get();
    if (vs.exists) {
      const d = vs.data()||{};
      perfilView = (d.perfil||"").toLowerCase();
      agenciaView = d.agenciaId || "";
    }
  }

  if (perfilView === "rm") {
    // ⚠️ precisa das rules liberando leitura para RM
    let snap = await COL_COMISSOES.where("rmUid","==",viewUid).get();

    // fallback: se nada voltar (docs antigos sem rmUid), tenta por rmNome
    if (snap.empty) {
      const myDoc = await COL_USERS.doc(viewUid).get();
      const nome  = myDoc.exists ? (myDoc.data()?.nome || "") : "";
      if (nome) snap = await COL_COMISSOES.where("rmNome","==",nome).get();
    }

    snap.forEach(doc=>{
      const c = doc.data()||{};
      const nome = c.empresaNome || "-";
      const pars = Array.isArray(c.parcelas) ? c.parcelas : [];
      pars.forEach(p=>{
        const comp = p.competenciaISO || "";
        if (!comp || comp > hoje) return; // só disponíveis
        const valor = Number(p.rm || 0);
        if (valor > 0) entradas.push({ empresa:nome, competenciaISO:comp, valor });
      });
    });

  } else if (perfilView === "gerente_chefe" || perfilView === "gerente chefe") {
    if (!agenciaView) { entradas = []; return; }
    const snap = await COL_COMISSOES.where("agenciaId","==",agenciaView).get();
    snap.forEach(doc=>{
      const c = doc.data()||{};
      const nome = c.empresaNome || "-";
      const pars = Array.isArray(c.parcelas) ? c.parcelas : [];
      pars.forEach(p=>{
        const comp = p.competenciaISO || "";
        if (!comp || comp > hoje) return;
        const valor = Number(p.gf || 0);
        if (valor > 0) entradas.push({ empresa:nome, competenciaISO:comp, valor });
      });
    });

  } else {
    entradas = []; // outros perfis não têm carteira
  }

  // mais recentes primeiro
  entradas.sort((a,b)=> (a.competenciaISO < b.competenciaISO) ? 1 : -1);
}

// =========== Carregar SAÍDAS ===========
async function carregarSaidas(){
  saidas = [];
  const snap = await COL_RESGATES.where("userId","==",viewUid).get();
  snap.forEach(doc=>{
    const r = doc.data()||{};
    saidas.push({
      dataISO:   r.criadoISO || (r.createdAt?.toDate?.()?.toISOString()?.slice(0,10) || ""),
      metodo:    r.metodo || "-",
      valor:     Number(r.valor||0),
      status:    (r.status || "pendente").toLowerCase()
    });
  });
  saidas.sort((a,b)=> (a.dataISO < b.dataISO) ? 1 : -1);
}

// ================= Totais & Métricas =================
function calcularTotais(){
  const ganho = entradas.reduce((s,e)=> s + Number(e.valor||0), 0);
  const resgatado = saidas.filter(s=>s.status==="pago").reduce((s,e)=> s + Number(e.valor||0), 0);
  const pendente  = saidas.filter(s=>s.status==="pendente").reduce((s,e)=> s + Number(e.valor||0), 0);
  const saldo = ganho - resgatado; // pendente não reduz disponível
  totais = { ganho, resgatado, pendente, saldo };
}

function renderMetrica(){
  $("mTotalGanho").textContent = money(totais.ganho);
  $("mResgatado").textContent  = money(totais.resgatado);
  $("mPendente").textContent   = money(totais.pendente);
  $("mSaldo").textContent      = money(totais.saldo);
  $("hintSaldo").textContent   = `Saldo disponível: ${money(totais.saldo)} • Em solicitação: ${money(totais.pendente)}`;
}

// ================== Filtros & Render ==================
function aplicarFiltros(){
  // Entradas
  const ini = $("fIni")?.value || "";
  const fim = $("fFim")?.value || "";
  const emp = norm($("fEmpresa")?.value || "");
  const entradasFiltradas = entradas.filter(e=>{
    if (ini && e.competenciaISO < ini) return false;
    if (fim && e.competenciaISO > fim) return false;
    if (emp && !norm(e.empresa).includes(emp)) return false;
    return true;
  });

  const tbE = $("tbEntradas");
  tbE.innerHTML = "";
  if (!entradasFiltradas.length){
    tbE.innerHTML = `<tr><td colspan="3" class="muted">Sem entradas neste período.</td></tr>`;
  } else {
    entradasFiltradas.forEach(e=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${e.empresa}</td><td>${e.competenciaISO.split("-").reverse().join("/")}</td><td>${money(e.valor)}</td>`;
      tbE.appendChild(tr);
    });
  }
  // contador com soma
  const somaEntradas = entradasFiltradas.reduce((s,e)=> s + Number(e.valor||0), 0);
  $("qtdEntradas").textContent = `${entradasFiltradas.length} item(ns) — ${money(somaEntradas)}`;

  // Saídas
  const st = $("fStatusSaida")?.value || "";
  const saidasFiltradas = saidas.filter(s=>{
    if (st && s.status !== st) return false;
    return true;
  });

  const tbS = $("tbSaidas");
  tbS.innerHTML = "";
  if (!saidasFiltradas.length){
    tbS.innerHTML = `<tr><td colspan="4" class="muted">Sem solicitações.</td></tr>`;
  } else {
    saidasFiltradas.forEach(s=>{
      const tr = document.createElement("tr");
      const stLabel = s.status==="pago"
        ? `<span class="tag" style="background:#ecfdf5;border-color:#a7f3d0;color:#065f46">Pago</span>`
        : `<span class="tag">Pendente</span>`;
      tr.innerHTML = `<td>${s.dataISO ? s.dataISO.split("-").reverse().join("/") : "-"}</td>
                      <td>${s.metodo}</td>
                      <td>${money(s.valor)}</td>
                      <td>${stLabel}</td>`;
      tbS.appendChild(tr);
    });
  }
  const somaSaidas = saidasFiltradas.reduce((s,e)=> s + Number(e.valor||0), 0);
  $("qtdSaidas").textContent = `${saidasFiltradas.length} item(ns) — ${money(somaSaidas)}`;

  // sempre manter métricas atualizadas (caso mude período, etc.)
  calcularTotais();
  renderMetrica();
}

// ============== Drawer (Solicitar Resgate) ==============
function abrirDrawer(){ $("drawer").classList.add("open"); }
function fecharDrawer(){ $("drawer").classList.remove("open"); }

async function salvarResgate(){
  const metodo   = $("rMetodo").value;
  const valorNum = Number($("rValor").value || 0);
  const detalhes = $("rDetalhes").value.trim();

  if (!valorNum || valorNum <= 0) return alert("Informe um valor válido.");
  if (valorNum > totais.saldo) {
    return alert(`Valor acima do saldo disponível (${money(totais.saldo)}).`);
    }

  const payload = {
    userId: viewUid,
    userNome: me.nome,
    perfil: me.perfil,
    agenciaId: me.agenciaId || null,

    metodo,
    valor: Number(valorNum.toFixed(2)),
    detalhes,

    status: "pendente",
    criadoISO: new Date().toISOString().slice(0,10),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  await COL_RESGATES.add(payload);
  alert("Solicitação enviada. Aguarde aprovação do admin.");

  fecharDrawer();
  await carregarSaidas();
  calcularTotais();
  renderMetrica();
  aplicarFiltros();
}

// ====== Exports ======
window.abrirDrawer   = abrirDrawer;
window.fecharDrawer  = fecharDrawer;
window.aplicarFiltros= aplicarFiltros;
