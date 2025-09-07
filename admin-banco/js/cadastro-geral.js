// ==== Firebase base ====
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ==== Contexto + RBAC (mesma lógica do painel) ====
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];
const normalizar = (s)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[-_]+/g," ").trim();

const CTX = { uid:null, perfil:null, agenciaId:null, nome:null, isAdmin:false };

async function initAuth(){
  auth.onAuthStateChanged(async (user)=>{
    if(!user){ location.href="login.html"; return; }
    CTX.uid = user.uid;

    // tenta puxar perfil do Firestore
    let snap = null;
    try { snap = await db.collection("usuarios_banco").doc(user.uid).get(); } catch(e){}

    if (snap && snap.exists) {
      const d = snap.data() || {};
      CTX.perfil    = normalizar(d.perfil||"");
      CTX.agenciaId = d.agenciaId || d.agenciaid || null;
      CTX.nome      = d.nome || user.email;
    } else {
      CTX.perfil = null;
      CTX.nome   = user.email || "Usuário";
    }

    // Admin pelo perfil OU fallback por email
    CTX.isAdmin = (CTX.perfil==="admin") || ADMIN_EMAILS.includes((user.email||"").toLowerCase());

    // ✅ CORREÇÃO: nada de optional chaining no LHS
    const elPerfil = document.getElementById("perfilUsuario");
    if (elPerfil) elPerfil.textContent = `${CTX.nome} (${CTX.perfil||"sem perfil"})`;

    // Só admin acessa esta tela
    if (!CTX.isAdmin) { alert("Acesso restrito ao admin."); location.href="painel.html"; return; }

    // (menu removido)
    await carregarAgencias();
    carregarGerentesChefes();
    prepararFiltros();
    listarUsuarios();

    // máscara do WhatsApp
    const w = document.getElementById("whatsapp");
    if (w) w.addEventListener("input", onMaskWhatsapp);
  });
}

// ==== Estado da página ====
let secondaryApp = null;
const getSecondaryAuth = ()=> {
  if (!secondaryApp) secondaryApp = firebase.initializeApp(firebaseConfig, "adminCreate");
  return secondaryApp.auth();
};

let editandoUsuarioId = null;
const agenciasCache = {}; // id -> label
let usuariosCache = [];   // para filtros

function fmtDataBR(ts){
  try{
    if(!ts) return "-";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("pt-BR");
  }catch(_){ return "-"; }
}

function onMaskWhatsapp(e){
  const el = e.target;
  const digits = (el.value||"").replace(/\D/g,"").slice(0,11);
  if (digits.length <= 10) {
    el.value = digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  } else {
    el.value = digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  }
}

// ==== Agências + Gerente-Chefe ====
async function carregarAgencias(){
  const selectCad   = document.getElementById("agenciaId");
  const selectFiltro= document.getElementById("filtroAgencia");
  if (selectCad)    selectCad.innerHTML    = '<option value="">Selecione</option>';
  if (selectFiltro) selectFiltro.innerHTML = '<option value="">Todas</option>';

  let snapshot;
  try { snapshot = await db.collection("agencias_banco").orderBy("nome").get(); }
  catch { snapshot = await db.collection("agencias_banco").get(); }

  snapshot.forEach(doc=>{
    const ag = doc.data()||{};
    const nome = (ag.nome || "(Sem nome)").toString();
    const banco= ag.banco ? ` — ${ag.banco}` : "";
    const cidade=(ag.Cidade||ag.cidade||"").toString();
    const uf = (ag.estado||ag.UF||"").toString().toUpperCase();
    const label = `${nome}${banco}${cidade?` / ${cidade}`:""}${uf?` - ${uf}`:""}`;
    agenciasCache[doc.id]=label;

    if (selectCad) {
      const o = document.createElement("option");
      o.value=doc.id; o.textContent=label; selectCad.appendChild(o);
    }
    if (selectFiltro) {
      const o2 = document.createElement("option");
      o2.value=doc.id; o2.textContent=label; selectFiltro.appendChild(o2);
    }
  });
}

function toggleCamposVinculo(){
  const perfil = document.getElementById("perfil").value;
  const box = document.getElementById("gerenteChefeBox");
  box.style.display = (perfil==="rm" || perfil==="assistente") ? "block" : "none";
}

function carregarGerentesChefes(){
  const select = document.getElementById("gerenteChefeId");
  if(!select) return;
  select.innerHTML = '<option value="">Selecionar</option>';
  db.collection("usuarios_banco").where("perfil","==","gerente_chefe").get()
    .then(snap=>{
      snap.forEach(doc=>{
        const u = doc.data()||{};
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = `${u.nome||"(Sem nome)"} (${u.agenciaId||"-"})`;
        select.appendChild(opt);
      });
    })
    .catch(err=>console.error("Erro gerentes-chefe:", err));
}

// ==== CRUD ====
async function cadastrarUsuario(){
  const nome   = document.getElementById("nome").value.trim();
  const email  = document.getElementById("email").value.trim();
  const senha  = document.getElementById("senha").value.trim(); // só criação
  const perfil = document.getElementById("perfil").value;
  const agenciaId = document.getElementById("agenciaId").value.trim();
  const gerenteChefeId = document.getElementById("gerenteChefeId").value;
  const whatsapp = document.getElementById("whatsapp").value.trim();

  if (!nome || !email || !perfil || !agenciaId){
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  // Edição
  if (editandoUsuarioId){
    const atualizacao = {
      nome, perfil, agenciaId, whatsapp,
      gerenteChefeId: (perfil==="rm"||perfil==="assistente") ? (gerenteChefeId||"") : ""
    };
    try{
      await db.collection("usuarios_banco").doc(editandoUsuarioId).update(atualizacao);
      alert("✅ Usuário atualizado com sucesso.");
      limparFormulario(); carregarGerentesChefes(); listarUsuarios();
    }catch(err){
      console.error(err); alert("Erro ao atualizar: "+(err?.message||err));
    }
    return;
  }

  // Criação
  if (!senha || senha.length<6){
    alert("Defina uma senha (mínimo 6 caracteres) para criar o login.");
    return;
  }
  const secondaryAuth = getSecondaryAuth();
  try{
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, senha);
    const uid  = cred.user.uid;

    await db.collection("usuarios_banco").doc(uid).set({
      nome, email, perfil, agenciaId, whatsapp: whatsapp || "",
      ativo:true,
      gerenteChefeId: (perfil==="rm"||perfil==="assistente") ? (gerenteChefeId||"") : "",
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await secondaryAuth.signOut();
    alert("✅ Usuário criado no Auth e cadastrado no banco.");
    limparFormulario(); carregarGerentesChefes(); listarUsuarios();
  }catch(err){
    console.error("Erro ao criar:", err);
    if (err?.code==="auth/email-already-in-use"){
      alert("Este e-mail já existe no Auth. Use 'Redefinir por e-mail' ou escolha outro e-mail.");
    } else {
      alert("Erro ao criar login: "+(err?.message||err));
    }
    try{ await secondaryAuth.signOut(); }catch(_){}
  }
}

async function listarUsuarios(){
  const tbody = document.getElementById("listaUsuarios");
  if(!tbody) return;
  tbody.innerHTML = "";
  usuariosCache = [];

  try{
    const snap = await db.collection("usuarios_banco").orderBy("nome").get();
    snap.forEach(doc=>{
      usuariosCache.push({ id:doc.id, ...(doc.data()||{}) });
    });
    renderLista(usuariosCache);
  }catch(err){
    console.error("Erro ao listar:", err);
  }
}

function renderLista(arr){
  const tbody = document.getElementById("listaUsuarios");
  if(!tbody) return;
  tbody.innerHTML = "";

  arr.forEach(u=>{
    const tr = document.createElement("tr");
    const agenciaRot = u.agenciaId ? (agenciasCache[u.agenciaId] || u.agenciaId) : "-";
    const criadoFmt  = fmtDataBR(u.criadoEm);
    tr.innerHTML = `
      <td class="p-2">${u.nome||"-"}</td>
      <td class="p-2">${u.email||"-"}</td>
      <td class="p-2">${u.perfil||"-"}</td>
      <td class="p-2">${agenciaRot}</td>
      <td class="p-2">${u.whatsapp||"-"}</td>
      <td class="p-2">${criadoFmt}</td>
      <td class="p-2">
        <div class="flex gap-2">
          <button class="rounded-md border px-2 py-1" onclick="editarUsuario('${u.id}', '${(u.nome||"").replace(/'/g,"&#39;")}', '${(u.email||"").replace(/'/g,"&#39;")}', '${u.perfil||""}', '${u.agenciaId||""}', '${u.gerenteChefeId||""}', '${(u.whatsapp||"").replace(/'/g,"&#39;")}')">Editar</button>
          <button class="rounded-md border px-2 py-1" onclick="resetarSenha('${(u.email||"").replace(/'/g,"&#39;")}')">Redefinir por e-mail</button>
          <button class="rounded-md bg-red-50 text-red-700 border border-red-200 px-2 py-1" onclick="excluirUsuario('${u.id}', '${(u.email||"").replace(/'/g,"&#39;")}')">🗑 Excluir</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function prepararFiltros(){
  const nome = document.getElementById("filtroNome");
  if (nome) nome.addEventListener("input", aplicarFiltros);
  const pf = document.getElementById("filtroPerfil");
  const ag = document.getElementById("filtroAgencia");
  pf?.addEventListener("change", aplicarFiltros);
  ag?.addEventListener("change", aplicarFiltros);
}

function aplicarFiltros(){
  const ag = (document.getElementById("filtroAgencia")?.value || "").trim();
  const pf = (document.getElementById("filtroPerfil")?.value || "").trim();
  const nm = (document.getElementById("filtroNome")?.value || "").toLowerCase().trim();

  const filtrados = usuariosCache.filter(u=>{
    const byAg = ag ? u.agenciaId===ag : true;
    const byPf = pf ? u.perfil===pf : true;
    const byNm = nm ? (u.nome||"").toLowerCase().includes(nm) : true;
    return byAg && byPf && byNm;
  });
  renderLista(filtrados);
}

function limparFiltros(){
  const fAg=document.getElementById("filtroAgencia");
  const fPf=document.getElementById("filtroPerfil");
  const fNm=document.getElementById("filtroNome");
  if(fAg) fAg.value="";
  if(fPf) fPf.value="";
  if(fNm) fNm.value="";
  renderLista(usuariosCache);
}

// editar / excluir
function editarUsuario(id, nome, email, perfil, agenciaId, gerenteChefeId, whatsapp){
  editandoUsuarioId = id;
  document.getElementById("nome").value = nome||"";
  document.getElementById("email").value = email||"";
  document.getElementById("email").disabled = true;
  document.getElementById("senha").value = "";
  document.getElementById("perfil").value = perfil||"";
  document.getElementById("agenciaId").value = agenciaId||"";
  document.getElementById("whatsapp").value = whatsapp||"";
  toggleCamposVinculo();
  setTimeout(()=>{
    const sel = document.getElementById("gerenteChefeId");
    if (sel) sel.value = gerenteChefeId || "";
  }, 150);
}

async function excluirUsuario(usuarioId, email){
  if (!confirm(`Deseja mesmo excluir o usuário ${email}? Isso removerá APENAS o perfil (Firestore).`)) return;
  try{
    await db.collection("usuarios_banco").doc(usuarioId).delete();
    alert("Perfil excluído do banco. (O login no Auth permanece.)");
    listarUsuarios();
  }catch(err){
    console.error("Erro ao excluir:", err);
    alert("Erro ao excluir: "+(err?.message||err));
  }
}

function limparFormulario(){
  editandoUsuarioId = null;
  document.getElementById("nome").value = "";
  document.getElementById("email").value = "";
  document.getElementById("email").disabled = false;
  document.getElementById("senha").value = "";
  document.getElementById("perfil").value = "";
  document.getElementById("agenciaId").value = "";
  const sel = document.getElementById("gerenteChefeId");
  if (sel) sel.value = "";
  document.getElementById("whatsapp").value = "";
  document.getElementById("gerenteChefeBox").style.display = "none";
}

// ==== Reset de senha ====
async function resetarSenha(email){
  if(!email){ alert("E-mail inválido."); return; }
  try{
    await auth.sendPasswordResetEmail(email);
    alert("E-mail de redefinição enviado (se o e-mail existir no Auth).");
  }catch(err){
    console.error("Reset:", err);
    alert(err?.message || "Erro ao enviar e-mail de redefinição.");
  }
}

// ==== expose ====
window.cadastrarUsuario = cadastrarUsuario;
window.toggleCamposVinculo = toggleCamposVinculo;
window.aplicarFiltros = aplicarFiltros;
window.limparFiltros = limparFiltros;
window.editarUsuario = editarUsuario;
window.excluirUsuario = excluirUsuario;
window.resetarSenha = resetarSenha;

initAuth();
