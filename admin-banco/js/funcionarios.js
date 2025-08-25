// funcionarios.js — v8 compatível com seu projeto (mobile + contadores dinâmicos)

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };

const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase()
  .replace(/[-_]+/g," ")
  .trim();

const toDate  = (x)=> x?.toDate ? x.toDate() : (x ? new Date(x) : null);
const fmtDataHora = (d)=> d ? d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-";

// ====== Auth/contexto
auth.onAuthStateChanged(async (user)=>{
  if(!user) return location.href="login.html";
  CTX.uid = user.uid;

  // carrega perfil
  const prof = await db.collection("usuarios_banco").doc(user.uid).get();
  if(!prof.exists){ document.getElementById("perfilUsuario").textContent="Usuário não encontrado"; return; }

  const d = prof.data();
  CTX.perfil    = normalizarPerfil(d.perfil || "");
  CTX.agenciaId = d.agenciaId || d.agenciaid || null;
  CTX.nome      = d.nome || user.email;

  document.getElementById("perfilUsuario").textContent = `${CTX.nome} (${d.perfil||"sem perfil"})`;
  montarMenuLateral(CTX.perfil);
  wireUi();
  carregarEmpresas();
});

// ====== Menu igual ao do painel (com Funcionários)
function montarMenuLateral(perfilBruto){
  const menu=document.getElementById("menuNav"); if(!menu) return; menu.innerHTML="";
  const perfil=normalizarPerfil(perfilBruto);

  const CAT_BASE={
    "Cadastrar Gerentes":"cadastro-geral.html","Cadastrar Empresa":"cadastro-empresa.html","Agências":"agencias.html",
    "Agenda Visitas":"agenda-visitas.html","Visitas":"visitas.html","Empresas":"empresas.html",
    "Solicitações de Cotação":"cotacoes.html","Produção":"negocios-fechados.html","Consultar Dicas":"consultar-dicas.html",
    "Dicas Produtos":"dicas-produtos.html","Ramos Seguro":"ramos-seguro.html","Relatório Visitas":"visitas-relatorio.html",
    "Vencimentos":"vencimentos.html","Relatórios":"relatorios.html",
    "Funcionários":"funcionarios.html"
  };
  const CAT_ADMIN_ONLY={
    "Carteira":"carteira.html","Comissões":"comissoes.html","Resgates (Admin)":"resgates-admin.html"
  };

  const LABEL=Object.fromEntries(Object.entries({...CAT_BASE, ...CAT_ADMIN_ONLY}).map(([k,v])=>[v,k]));
  const ADMIN=[...Object.values(CAT_BASE), ...Object.values(CAT_ADMIN_ONLY)];
  const RM = ["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html"];
  const GER= ["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html"];
  const AST= ["agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html","funcionarios.html"];

  let hrefs=[];
  switch(perfil){
    case "admin": hrefs=ADMIN; break;
    case "rm": hrefs=RM; break;
    case "gerente chefe":
    case "gerente-chefe":
    case "gerente_chefe": hrefs=GER; break;
    case "assistente":
    case "assistentes": hrefs=AST; break;
    default: hrefs=[];
  }
  hrefs.forEach(h=>{
    const a=document.createElement("a"); a.href=h;
    a.innerHTML=`🔹 ${LABEL[h]||h}`;
    menu.appendChild(a);
  });
}

// ====== UI handlers
function wireUi(){
  document.getElementById("atualizarLista")?.addEventListener("click", carregarEmpresas);
  document.getElementById("busca")?.addEventListener("input", filtrarTabela);

  const modal = document.getElementById("modalEditar");
  const fechar= document.getElementById("fecharEditar");
  fechar?.addEventListener("click", ()=> modal.style.display="none");
  modal?.addEventListener("click", (e)=>{ if(e.target===modal) modal.style.display="none"; });
  document.getElementById("salvarEditar")?.addEventListener("click", salvarEdicao);
}

// ====== Data cache
const cacheUsuarios = new Map(); // uid -> nome
const cacheAgencias = new Map(); // agenciaId/agenciaid -> nome

async function getUsuarioNome(uid, fallback){
  if(fallback) return fallback;
  if(!uid) return "-";
  if(cacheUsuarios.has(uid)) return cacheUsuarios.get(uid);
  const snap = await db.collection("usuarios_banco").doc(uid).get();
  const nome = snap.exists ? (snap.data().nome || snap.data().apelido || snap.data().email || "-") : "-";
  cacheUsuarios.set(uid, nome); return nome;
}
async function getAgenciaNome(id, fallback){
  if(fallback) return fallback;
  if(!id) return "-";
  if(cacheAgencias.has(id)) return cacheAgencias.get(id);
  let snap = await db.collection("agencias").doc(id).get().catch(()=>null);
  if(!snap || !snap.exists) snap = await db.collection("agencias_banco").doc(id).get().catch(()=>null);
  const nome = (snap && snap.exists) ? (snap.data().nome || snap.data().descricao || "-") : "-";
  cacheAgencias.set(id, nome); return nome;
}

// ====== Carregar e renderizar empresas
let LISTA = [];

async function carregarEmpresas(){
  const status = document.getElementById("statusLista");
  const tbody  = document.getElementById("tbodyEmpresas");
  status.textContent = "Carregando empresas…";
  tbody.innerHTML = "";

  try{
    const col = db.collection("empresas");

    let q = col;
    if (CTX.perfil === "rm" && CTX.uid) {
      q = q.where("rmUid", "==", CTX.uid);
    } else if ((CTX.perfil === "assistente" || CTX.perfil === "gerente chefe") && CTX.agenciaId){
      q = q.where("agenciaId", "==", CTX.agenciaId);
    }

    let snap = await q.limit(1000).get();
    if (snap.empty && (CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") && CTX.agenciaId){
      snap = await col.where("agenciaid", "==", CTX.agenciaId).limit(1000).get();
    }

    if (snap.empty){
      LISTA = [];
      updateStatus([], 0);
      tbody.innerHTML = `<tr><td colspan="6" class="muted" style="padding:18px">Nenhuma empresa encontrada para seu perfil/regra.</td></tr>`;
      return;
    }

    const arr = [];
    snap.forEach(doc=>{
      const d = doc.data() || {};
      arr.push({
        id: doc.id,
        nome: d.nome || d.razaoSocial || d.fantasia || "Empresa",
        rmUid: d.rmUid || d.rm || null,
        rmNome: d.rmNome || null,
        agenciaId: d.agenciaId || d.agenciaid || null,
        agenciaNome: d.agenciaNome || null,
        funcionariosQtd: (typeof d.funcionariosQtd === "number") ? d.funcionariosQtd : (d.funcionarios ?? null),
        funcionariosAtualizadoEm: d.funcionariosAtualizadoEm || d.atualizadoFuncionariosEm || null
      });
    });

    // enriquecer nomes
    for (const it of arr){
      it.rmNome = await getUsuarioNome(it.rmUid, it.rmNome);
      it.agenciaNome = await getAgenciaNome(it.agenciaId, it.agenciaNome);
    }

    arr.sort((a,b)=> String(a.nome).localeCompare(String(b.nome), 'pt', {sensitivity:'base'}));
    LISTA = arr;

    renderTabela(LISTA);
    updateStatus(LISTA, LISTA.length);

  } catch (err) {
    console.error("[funcionarios] erro carregarEmpresas:", err);
    const code = err?.code || "erro-desconhecido";
    const msg  = err?.message || String(err);
    document.getElementById("statusLista").textContent = `Erro ao carregar empresas. (${code}) ${msg}`;
  }
}

function renderTabela(lista){
  const tbody  = document.getElementById("tbodyEmpresas");
  tbody.innerHTML = "";

  if(!lista.length){
    tbody.innerHTML = `<tr><td colspan="6" class="muted" style="padding:18px">Nenhum registro.</td></tr>`;
    return;
  }

  for(const it of lista){
    const dt = toDate(it.funcionariosAtualizadoEm);
    const podeEditar = podeEditarEmpresa(it);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="sticky-left col-empresa"><strong>${escapeHtml(it.nome)}</strong></td>
      <td class="hide-sm">${escapeHtml(it.rmNome || "-")}</td>
      <td class="hide-sm">${escapeHtml(it.agenciaNome || "-")}</td>
      <td class="sticky-right col-func">${it.funcionariosQtd != null ? `<span class="tag">${it.funcionariosQtd.toLocaleString("pt-BR")}</span>` : '<span class="muted">—</span>'}</td>
      <td class="hide-sm">${fmtDataHora(dt)}</td>
      <td class="hide-sm">
        ${podeEditar
          ? `<button class="btn" data-edit="${it.id}">Editar</button>`
          : `<span class="muted">Sem permissão</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> abrirEditar(btn.getAttribute("data-edit")));
  });
}

function filtrarTabela(e){
  const termo = (e?.target?.value || document.getElementById("busca").value || "").trim().toLowerCase();

  if(!termo){
    renderTabela(LISTA);
    updateStatus(LISTA, LISTA.length);
    return;
  }

  const filtrada = LISTA.filter(it=>{
    return String(it.nome).toLowerCase().includes(termo) ||
           String(it.rmNome||"").toLowerCase().includes(termo) ||
           String(it.agenciaNome||"").toLowerCase().includes(termo);
  });

  renderTabela(filtrada);
  updateStatus(filtrada, LISTA.length);
}

// ====== Status/contadores
function updateStatus(listaAtual, totalBaseEmpresas){
  const totalEmpresas = Number.isFinite(totalBaseEmpresas) ? totalBaseEmpresas : LISTA.length;
  const qtdEmpresasFiltro = listaAtual.length;
  const totalFuncionariosFiltro = listaAtual.reduce((acc, it)=>{
    const v = Number(it.funcionariosQtd);
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);

  const status = document.getElementById("statusLista");
  // Ex.: "25 empresa(s) carregada(s) · Total de funcionários no filtro: 25.000 · (Base total: 140 empresas)"
  status.textContent = `${qtdEmpresasFiltro} empresa(s) carregada(s) · Total de funcionários no filtro: ${totalFuncionariosFiltro.toLocaleString("pt-BR")} · (Base total: ${totalEmpresas} empresas)`;
}

// ====== Permissão de edição (UI) — valide nas RULES de verdade
function podeEditarEmpresa(it){
  if(CTX.perfil === "admin") return true;
  if(CTX.perfil === "rm" && it.rmUid === CTX.uid) return true;
  if((CTX.perfil === "assistente" || CTX.perfil === "gerente chefe") && it.agenciaId === CTX.agenciaId) return true;
  return false;
}

// ====== Modal Editar
let alvoAtual = null;

function abrirEditar(empId){
  alvoAtual = LISTA.find(x=>x.id === empId) || null;
  if(!alvoAtual) return;

  document.getElementById("empresaAlvo").textContent = `${alvoAtual.nome} • RM: ${alvoAtual.rmNome || "-"} • Agência: ${alvoAtual.agenciaNome || "-"}`;
  document.getElementById("novoNumero").value = (alvoAtual.funcionariosQtd != null ? alvoAtual.funcionariosQtd : "");
  document.getElementById("editErro").textContent = "";
  document.getElementById("editInfo").textContent = "";

  document.getElementById("modalEditar").style.display = "block";
}

async function salvarEdicao(){
  const erroEl = document.getElementById("editErro");
  const infoEl = document.getElementById("editInfo");
  erroEl.textContent = ""; infoEl.textContent = "";

  if(!alvoAtual){ erroEl.textContent = "Nenhuma empresa selecionada."; return; }

  const raw = document.getElementById("novoNumero").value.trim();
  if(raw === ""){ erroEl.textContent = "Informe o número de funcionários."; return; }
  const numero = parseInt(raw, 10);
  if(!Number.isFinite(numero) || numero < 0){ erroEl.textContent = "Número inválido."; return; }

  if(!podeEditarEmpresa(alvoAtual)){ erroEl.textContent = "Sem permissão para editar."; return; }

  try{
    await db.collection("empresas").doc(alvoAtual.id).update({
      funcionariosQtd: numero,
      funcionariosAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      funcionariosAtualizadoPor: CTX.uid
    });

    infoEl.textContent = "Atualizado com sucesso!";
    alvoAtual.funcionariosQtd = numero;
    alvoAtual.funcionariosAtualizadoEm = new Date();

    // Re-render e reconta mantendo o filtro atual digitado
    const termoAtual = (document.getElementById("busca").value || "").trim();
    if(termoAtual){
      filtrarTabela();
    }else{
      renderTabela(LISTA);
      updateStatus(LISTA, LISTA.length);
    }

    setTimeout(()=> document.getElementById("modalEditar").style.display = "none", 800);
  }catch(err){
    console.error(err);
    erroEl.textContent = err?.message || "Erro ao salvar.";
  }
}

// ====== Helpers
function escapeHtml(s){
  return String(s==null?"":s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}
