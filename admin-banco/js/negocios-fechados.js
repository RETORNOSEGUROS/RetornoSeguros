// Coleções
const db = firebase.firestore();
const negociosRef = db.collection('cotacoes-gerentes'); // origem oficial
const usuariosRef = db.collection('usuarios_banco');    // perfis (contém agenciaId / agenciaNome)
const agenciasRef = db.collection('agencias');          // opcional: mapear agencyId -> nome

// Estado em memória
let docsBrutos = [];     // todos emitidos
let mapaRM = new Map();  // rmUid -> {nome, agenciaId, agenciaNome}
let mapaAgencia = new Map(); // agenciaId -> nome (fallback)

// Utils ------------------------------------------------------------
const ptBR = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

function formatMoney(n){
  if (n === undefined || n === null || isNaN(n)) return 'R$ 0,00';
  return ptBR.format(Number(n));
}

// aceita string 'YYYY-MM-DD' OU Timestamp Firestore OU Date
function toISODate(val){
  if (!val) return '';
  try{
    if (typeof val === 'string'){
      // já vem como 'YYYY-MM-DD' na maioria dos seus docs
      return /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : '';
    }
    // Firestore Timestamp (v8)
    if (val.toDate) {
      const d = val.toDate();
      const m = (d.getMonth()+1).toString().padStart(2,'0');
      const day = d.getDate().toString().padStart(2,'0');
      return `${d.getFullYear()}-${m}-${day}`;
    }
    if (val instanceof Date){
      const m = (val.getMonth()+1).toString().padStart(2,'0');
      const day = val.getDate().toString().padStart(2,'0');
      return `${val.getFullYear()}-${m}-${day}`;
    }
  }catch(_e){}
  return '';
}

function normalizarTexto(s){ return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

// Carregamento ------------------------------------------------------
firebase.auth().onAuthStateChanged(async user => {
  if (!user){ alert('Você precisa estar logado.'); return; }
  await carregarNegocios();
  await montarFiltroRM();
  aplicarFiltros(); // exibe já filtrado (sem restrições)
  // Eventos dos filtros
  document.getElementById('btnAplicar').addEventListener('click', aplicarFiltros);
  document.getElementById('btnLimpar').addEventListener('click', () => {
    document.getElementById('fDataIni').value = '';
    document.getElementById('fDataFim').value = '';
    document.getElementById('fRm').value = '';
    document.getElementById('fEmpresa').value = '';
    aplicarFiltros();
  });
});

async function carregarNegocios(){
  // Busca apenas "Negócio Emitido"
  const snap = await negociosRef.where('status','==','Negócio Emitido').get();

  docsBrutos = [];
  const rmUids = new Set();

  snap.forEach(doc=>{
    const d = doc.data();
    const item = {
      id: doc.id,
      empresaNome: d.empresaNome || '-',
      ramo: d.ramo || '-',
      rmNome: d.rmNome || '-',
      rmUid: d.rmUid || d.rmUID || d.rmId || null, // cobrir variações
      premioLiquido: Number(d.premioLiquido) || 0,
      inicioVigencia: toISODate(d.inicioVigencia),
      fimVigencia: toISODate(d.fimVigencia),
      observacoes: d.observacoes || ''
    };
    if (item.rmUid) rmUids.add(item.rmUid);
    docsBrutos.push(item);
  });

  // Carregar perfis dos RMs usados (agência)
  await carregarPerfisRM([...rmUids]);

  // Opcional: se houver docs com agenciaId sem nome, tentar popular mapa de agências
  const idsAg = [...new Set([...mapaRM.values()].map(x=>x.agenciaId).filter(Boolean))];
  await carregarAgencias(idsAg);
}

async function carregarPerfisRM(uids){
  if (uids.length === 0) return;
  const lotes = [];
  // Firestore não tem "in" para documentId direto aqui sem compor query; fazemos gets individuais
  for (const uid of uids){
    lotes.push(usuariosRef.doc(uid).get().then(ds=>{
      if (ds.exists){
        const u = ds.data();
        mapaRM.set(uid, {
          nome: u.nome || u.displayName || '',
          agenciaId: u.agenciaId || u.agencia || '',
          agenciaNome: u.agenciaNome || ''
        });
      } else {
        mapaRM.set(uid, {nome:'',agenciaId:'',agenciaNome:''});
      }
    }).catch(()=> mapaRM.set(uid,{nome:'',agenciaId:'',agenciaNome:''})));
  }
  await Promise.all(lotes);
}

async function carregarAgencias(ids){
  if (!ids || !ids.length) return;
  const gets = [];
  ids.forEach(id=>{
    if (id && !mapaAgencia.has(id)){
      gets.push(agenciasRef.doc(id).get().then(ds=>{
        mapaAgencia.set(id, ds.exists ? (ds.data().nome || ds.data().descricao || id) : id);
      }).catch(()=> mapaAgencia.set(id, id)));
    }
  });
  await Promise.all(gets);
}

function nomeAgenciaPorRmUid(rmUid){
  const info = mapaRM.get(rmUid);
  if (!info) return '-';
  if (info.agenciaNome) return info.agenciaNome;
  if (info.agenciaId && mapaAgencia.has(info.agenciaId)) return mapaAgencia.get(info.agenciaId);
  return info.agenciaId || '-';
}

// Filtros -----------------------------------------------------------
async function montarFiltroRM(){
  const sel = document.getElementById('fRm');
  sel.innerHTML = `<option value="">Todos</option>`;

  // Montar a partir dos dados carregados (garante apenas RMs presentes nos negócios)
  const vistos = new Set();
  docsBrutos.forEach(d=>{
    const chave = d.rmUid || d.rmNome;
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);
    const rLabel = d.rmNome || (mapaRM.get(d.rmUid)?.nome) || d.rmUid || 'RM';
    sel.insertAdjacentHTML('beforeend', `<option value="${chave}">${rLabel}</option>`);
  });
}

function aplicarFiltros(){
  const ini = document.getElementById('fDataIni').value; // 'YYYY-MM-DD' ou ''
  const fim = document.getElementById('fDataFim').value;
  const rmSel = document.getElementById('fRm').value;    // rmUid (preferível) ou nome
  const empTxt = normalizarTexto(document.getElementById('fEmpresa').value);

  const filtrados = docsBrutos.filter(d=>{
    // filtro por data de início de vigência
    if (ini && (!d.inicioVigencia || d.inicioVigencia < ini)) return false;
    if (fim && (!d.inicioVigencia || d.inicioVigencia > fim)) return false;

    // filtro por RM (rmUid prioritário; se não existir, cai no nome)
    if (rmSel){
      if (d.rmUid){
        if (d.rmUid !== rmSel) return false;
      } else {
        if (normalizarTexto(d.rmNome) !== normalizarTexto(rmSel)) return false;
      }
    }

    // filtro por empresa (contém)
    if (empTxt){
      if (!normalizarTexto(d.empresaNome).includes(empTxt)) return false;
    }

    return true;
  });

  renderTabela(filtrados);
  atualizarResumo(filtrados);
}

function atualizarResumo(lista){
  const infoQtd = document.getElementById('infoQtd');
  const totalPremio = document.getElementById('totalPremio');
  const soma = lista.reduce((acc,cur)=> acc + (Number(cur.premioLiquido)||0), 0);
  infoQtd.textContent = `${lista.length} negócio(s)`;
  totalPremio.textContent = `Total prêmio: ${formatMoney(soma)}`;
}

// Render ------------------------------------------------------------
function renderTabela(lista){
  const tbody = document.getElementById('listaNegociosFechados');
  tbody.innerHTML = '';

  if (!lista.length){
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Sem resultados para os filtros atuais.</td></tr>`;
    return;
  }

  for (const d of lista){
    const agencia = nomeAgenciaPorRmUid(d.rmUid);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.empresaNome}</td>
      <td>${d.ramo}</td>
      <td>${d.rmNome || '-'}</td>
      <td>${agencia || '-'}</td>
      <td>${formatMoney(d.premioLiquido)}</td>
      <td>${d.inicioVigencia || '-'}</td>
      <td>${d.fimVigencia || '-'}</td>
      <td>${d.observacoes ? `<span title="${escapeHtml(d.observacoes)}">${truncate(d.observacoes, 120)}</span>` : '-'}</td>
    `;
    tbody.appendChild(tr);
  }
}

function truncate(s, n){
  s = (s||'').toString();
  return s.length > n ? s.slice(0,n-1) + '…' : s;
}
function escapeHtml(s){
  return (s||'').toString()
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}
