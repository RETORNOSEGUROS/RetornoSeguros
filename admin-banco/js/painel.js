// admin-banco/js/painel.js
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid: null, perfil: null, agenciaId: null, nome: null };

// ========= Helpers =========
const normalizarPerfil = (p) => String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().trim();

const parseValor = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  // remove R$, espaços e pontos de milhar; troca vírgula por ponto
  const limp = String(v).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(limp);
  return Number.isFinite(n) ? n : 0;
};

const fmtBRL = (n) => `R$ ${parseValor(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toDate = (x) => (x?.toDate ? x.toDate() : (x ? new Date(x) : null));
const fmtData = (d) => d ? d.toLocaleDateString('pt-BR') : '-';
const fmtHora = (d) => d ? d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '';

// ========= Auth =========
auth.onAuthStateChanged(async (user) => {
  if (!user) return window.location.href = 'login.html';
  CTX.uid = user.uid;

  const profSnap = await db.collection('usuarios_banco').doc(user.uid).get();
  if (!profSnap.exists) {
    document.getElementById('perfilUsuario').textContent = 'Usuário não encontrado';
    return;
  }
  const dados = profSnap.data();
  CTX.perfil    = normalizarPerfil(dados.perfil || '');
  CTX.agenciaId = dados.agenciaId || null;
  CTX.nome      = dados.nome || user.email;

  document.getElementById('perfilUsuario').textContent = `${CTX.nome} (${dados.perfil || 'sem perfil'})`;
  montarMenuLateral(CTX.perfil);
  carregarResumoPainel();
});

// ========= Menu por perfil =========
function montarMenuLateral(perfil) {
  const menu = document.getElementById('menuNav');
  if (!menu) return;
  menu.innerHTML = '';

  const items = {
    'Cadastrar Gerentes':      'cadastro-geral.html',
    'Cadastrar Empresa':       'cadastro-empresa.html',
    'Agências':                'agencias.html',
    'Agenda Visitas':          'agenda-visitas.html',
    'Visitas':                 'visitas.html',
    'Empresas':                'empresas.html',
    'Solicitações de Cotação': 'cotacoes.html',
    'Produção':                'negocios-fechados.html',
    'Consultar Dicas':         'consultar-dicas.html',
    'Dicas Produtos':          'dicas-produtos.html',
    'Ramos Seguro':            'ramos-seguro.html',
    'Relatório Visitas':       'visitas-relatorio.html',
    'Vencimentos':             'vencimentos.html',
    'Relatórios':              'relatorios.html',
  };

  const byRole = {
    'admin': Object.values(items),
    'rm': [ items['Cadastrar Empresa'], items['Agenda Visitas'], items['Visitas'], items['Empresas'], items['Solicitações de Cotação'], items['Produção'], items['Consultar Dicas'], items['Relatório Visitas'], items['Vencimentos'] ],
    'gerente chefe': [ items['Cadastrar Empresa'], items['Agenda Visitas'], items['Visitas'], items['Empresas'], items['Solicitações de Cotação'], items['Produção'], items['Consultar Dicas'], items['Relatório Visitas'], items['Vencimentos'] ],
    'assistente': [ items['Agenda Visitas'], items['Visitas'], items['Solicitações de Cotação'], items['Consultar Dicas'] ],
  };

  const hrefs = byRole[perfil] || [];
  const labels = Object.fromEntries(Object.entries(items).map(([k,v]) => [v,k]));
  hrefs.forEach((href) => {
    const a = document.createElement('a');
    a.href = href; a.textContent = labels[href] || href; menu.appendChild(a);
  });
}

// ========= Painel =========
async function carregarResumoPainel() {
  skeleton('listaVisitasAgendadas', 5);
  skeleton('listaConversas', 5);
  skeleton('listaVisitas', 5);
  skeleton('listaProducao', 5);
  skeleton('listaCotacoes', 5);

  await Promise.all([
    blocoVisitasAgendadas(),
    blocoUltimasConversas(),
    blocoMinhasVisitas(),
    blocoProducao(),
    blocoMinhasCotacoes(),
  ]);
}

function skeleton(id, n=4){
  const ul = document.getElementById(id); if(!ul) return; ul.innerHTML='';
  for(let i=0;i<n;i++){ const li = document.createElement('li'); li.className='row'; li.innerHTML='<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:20%"></div>'; ul.appendChild(li); }
}

// ---------- 1) Visitas Agendadas (próximas 10) ----------
async function blocoVisitasAgendadas(){
  let q = db.collection('agenda_visitas');
  // Escopo por perfil
  if (CTX.perfil === 'rm') q = q.where('rmUid', '==', CTX.uid);
  else if (CTX.perfil === 'assistente' || CTX.perfil === 'gerente chefe') q = q.where('agenciaId', '==', CTX.agenciaId);

  const snap = await q.get();
  const now = new Date();
  const todos = [];
  snap.forEach(doc=>{
    const d = doc.data();
    const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
    if (dt && !isNaN(dt) && dt >= now) {
      todos.push({ ...d, dt, id: doc.id });
    }
  });
  todos.sort((a,b)=> a.dt - b.dt);
  const arr = todos.slice(0,10);

  const ul = document.getElementById('listaVisitasAgendadas');
  const badge = document.getElementById('qtdVA');
  ul.innerHTML = arr.length ? '' : '<li class="row"><span class="meta">Nenhuma visita futura.</span></li>';
  badge.textContent = arr.length;

  for(const v of arr){
    const li = document.createElement('li');
    const empresa = v.empresaNome || v.empresa || '-';
    const rm = v.rmNome || v.rm || '-';
    li.className='row';
    li.innerHTML = `<div class="title">${fmtData(v.dt)} ${fmtHora(v.dt)} — <strong>${empresa}</strong></div><div class="meta">${rm} • ${v.tipo||'-'}</div>`;
    ul.appendChild(li);
  }
}

// ---------- 2) Últimas Conversas (chat-cotacao.htm) ----------
async function blocoUltimasConversas(){
  let q = db.collection('cotacoes-gerentes').orderBy('dataCriacao', 'desc').limit(20);
  if (CTX.perfil === 'rm') q = q.where('rmUid','==',CTX.uid).orderBy('dataCriacao','desc').limit(20);
  else if (CTX.perfil === 'assistente' || CTX.perfil === 'gerente chefe') q = q.where('agenciaId','==',CTX.agenciaId).orderBy('dataCriacao','desc').limit(20);

  const snap = await q.get();
  const ul = document.getElementById('listaConversas'); ul.innerHTML='';
  if (snap.empty) { ul.innerHTML = '<li class="row"><span class="meta">Nenhuma conversa recente.</span></li>'; return; }

  const itens = [];
  for (const doc of snap.docs.slice(0,10)){
    const c = doc.data();
    const sub = await db.collection('cotacoes-gerentes').doc(doc.id).collection('interacoes')
                  .orderBy('dataHora','desc').limit(1).get();
    if (!sub.empty){
      const i = sub.docs[0].data();
      itens.push({ empresa: c.empresaNome || 'Empresa', msg: i.mensagem || '(sem texto)', quem: i.usuarioNome || i.usuarioEmail || '—', quando: toDate(i.dataHora) });
    }
  }
  if (!itens.length){ ul.innerHTML = '<li class="row"><span class="meta">Sem interações recentes.</span></li>'; return; }

  itens.slice(0,5).forEach(it=>{
    const li = document.createElement('li'); li.className='row';
    li.innerHTML = `<div class="title"><strong>${it.empresa}</strong> — ${it.msg.slice(0,80)}</div><div class="meta">${it.quem} • ${fmtData(it.quando)} ${fmtHora(it.quando)}</div>`;
    ul.appendChild(li);
  });
}

// ---------- 3) Minhas Visitas (coleção visitas) ----------
async function blocoMinhasVisitas(){
  let q = db.collection('visitas').orderBy('data','desc').limit(20);
  if (CTX.perfil === 'rm') q = q.where('rmUid','==',CTX.uid).orderBy('data','desc').limit(20);
  else if (CTX.perfil === 'assistente' || CTX.perfil === 'gerente chefe') q = q.where('agenciaId','==',CTX.agenciaId).orderBy('data','desc').limit(20);

  const snap = await q.get();
  const ul = document.getElementById('listaVisitas'); ul.innerHTML='';
  if (snap.empty){ ul.innerHTML = '<li class="row"><span class="meta">Nenhuma visita.</span></li>'; return; }

  const cacheEmp = new Map();
  const getEmpresaNome = async (empresaId, fallbackNome) => {
    if (fallbackNome) return fallbackNome;
    if (!empresaId) return '-';
    if (cacheEmp.has(empresaId)) return cacheEmp.get(empresaId);
    const d = await db.collection('empresas').doc(empresaId).get();
    const nome = d.exists ? (d.data().nome||d.data().razaoSocial||'-') : '-';
    cacheEmp.set(empresaId, nome);
    return nome;
  };

  const docs = snap.docs.slice(0,5);
  for (const doc of docs){
    const v = doc.data();
    const dataV = toDate(v.data);
    const nomeEmp = await getEmpresaNome(v.empresaId, v.empresaNome);
    const li = document.createElement('li'); li.className='row';
    li.innerHTML = `<div class="title"><strong>${nomeEmp}</strong></div><div class="meta">${fmtData(dataV)}${v.tipo? ' • '+v.tipo : ''}</div>`;
    ul.appendChild(li);
  }
}

// ---------- 4) Produção (Negócios Fechados) ----------
async function blocoProducao(){
  let q = db.collection('cotacoes-gerentes');
  if (CTX.perfil === 'rm') q = q.where('rmUid','==',CTX.uid);
  else if (CTX.perfil === 'assistente' || CTX.perfil === 'gerente chefe') q = q.where('agenciaId','==',CTX.agenciaId);
  q = q.orderBy('dataCriacao','desc').limit(50);

  const snap = await q.get();
  const ul = document.getElementById('listaProducao'); ul.innerHTML='';
  if (snap.empty){ ul.innerHTML = '<li class="row"><span class="meta">Nenhum negócio.</span></li>'; return; }

  const emitidos = [];
  snap.forEach(doc=>{ const d = doc.data(); if (String(d.status||'').toLowerCase() === 'negócio emitido') emitidos.push(d); });
  if (!emitidos.length){ ul.innerHTML = '<li class="row"><span class="meta">Nenhum negócio emitido.</span></li>'; return; }

  emitidos.slice(0,5).forEach(d=>{
    const valor = d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0;
    const vIni = toDate(d.vigenciaInicial) || toDate(d.vigenciaInicio) || toDate(d.vigencia_de) || null;
    const li = document.createElement('li'); li.className='row';
    li.innerHTML = `<div class="title"><strong>${d.empresaNome || 'Empresa'}</strong> — ${d.ramo || 'Ramo'}</div><div class="meta">${fmtBRL(valor)} • início ${fmtData(vIni)}</div>`;
    ul.appendChild(li);
  });
}

// ---------- 5) Minhas Cotações ----------
async function blocoMinhasCotacoes(){
  let q = db.collection('cotacoes-gerentes');
  if (CTX.perfil === 'rm') q = q.where('rmUid','==',CTX.uid);
  else if (CTX.perfil === 'assistente' || CTX.perfil === 'gerente chefe') q = q.where('agenciaId','==',CTX.agenciaId);
  q = q.orderBy('dataCriacao','desc').limit(10);

  const snap = await q.get();
  const ul = document.getElementById('listaCotacoes'); ul.innerHTML='';
  if (snap.empty){ ul.innerHTML = '<li class="row"><span class="meta">Sem cotações.</span></li>'; return; }

  snap.docs.slice(0,5).forEach(doc=>{
    const d = doc.data();
    const valor = d.valorFinal ?? d.valorDesejado ?? 0;
    const li = document.createElement('li'); li.className='row';
    li.innerHTML = `<div class="title"><strong>${d.empresaNome || 'Empresa'}</strong> — ${d.ramo || 'Ramo'}</div><div class="meta">${fmtBRL(valor)}</div>`;
    ul.appendChild(li);
  });
}
