// Firestore
const db = firebase.firestore();
const negociosRef = db.collection('cotacoes-gerentes'); // origem
const usuariosRef = db.collection('usuarios_banco');    // RMs (agência)
const agenciasRef = db.collection('agencias');          // opcional

// Estado
let docsBrutos = [];            // emitidos
let mapaRM = new Map();         // rmUid -> {nome, agenciaId, agenciaNome}
let mapaAgencia = new Map();    // agenciaId -> nome
let ramosUnicos = new Set();    // para filtro
let agenciasUnicas = new Set(); // nomes prontos para filtro

// Utils ------------------------------------------------------------
const fmtBRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

function money(n){
  if (n === undefined || n === null || isNaN(n)) return 'R$ 0,00';
  return fmtBRL.format(Number(n));
}

// normaliza para YYYY-MM-DD
function toISODate(val){
  if (!val) return '';
  try{
    if (typeof val === 'string'){
      return /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : '';
    }
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

// exibe DD/MM/AAAA
function formatDateBR(iso){
  if (!iso) return '-';
  const [y,m,d] = iso.split('-');
  if (!y || !m || !d) return '-';
  return `${d}/${m}/${y}`;
}

function norm(s){ return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

// Boot -------------------------------------------------------------
firebase.auth().onAuthStateChanged(async user => {
  if (!user){ alert('Você precisa estar logado.'); return; }
  await carregarNegocios();
  await montarFiltros();
  aplicarFiltros();

  document.getElementById('btnAplicar').addEventListener('click', aplicarFiltros);
  document.getElementById('btnLimpar').addEventListener('click', () => {
    ['fDataIni','fDataFim','fRm','fAgencia','fRamo','fEmpresa'].forEach(id => {
      const el = document.getElementById(id);
      if (el.tagName === 'SELECT') el.value = '';
      else el.value = '';
    });
    aplicarFiltros();
  });
});

// Dados ------------------------------------------------------------
async function carregarNegocios(){
  const snap = await negociosRef.where('status','==','Negócio Emitido').get();
  docsBrutos = [];
  mapaRM.clear(); ramosUnicos.clear(); agenciasUnicas.clear();

  const rmUids = new Set();

  snap.forEach(doc=>{
    const d = doc.data();
    const item = {
      id: doc.id,
      empresaNome: d.empresaNome || '-',
      ramo: d.ramo || '-',
      rmNome: d.rmNome || '-',
      rmUid: d.rmUid || d.rmUID || d.rmId || null,
      premioLiquido: Number(d.premioLiquido) || 0,
      inicioVigencia: toISODate(d.inicioVigencia),
      fimVigencia: toISODate(d.fimVigencia)
    };
    docsBrutos.push(item);
    ramosUnicos.add(item.ramo);
    if (item.rmUid) rmUids.add(item.rmUid);
  });

  await carregarPerfisRM([...rmUids]);

  const idsAg = [...new Set([...mapaRM.values()].map(x=>x.agenciaId).filter(Boolean))];
  await carregarAgencias(idsAg);

  // montar set de nomes de agência a partir dos docs
  docsBrutos.forEach(d=>{
    const nomeAg = nomeAgenciaPorRmUid(d.rmUid);
    if (nomeAg && nomeAg !== '-') agenciasUnicas.add(nomeAg);
  });
}

async function carregarPerfisRM(uids){
  if (!uids.length) return;
  const reqs = uids.map(uid =>
    usuariosRef.doc(uid).get().then(ds=>{
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
    }).catch(()=> mapaRM.set(uid,{nome:'',agenciaId:'',agenciaNome:''}))
  );
  await Promise.all(reqs);
}

async function carregarAgencias(ids){
  if (!ids || !ids.length) return;
  const reqs = ids.map(id=>{
    if (!id || mapaAgencia.has(id)) return Promise.resolve();
    return agenciasRef.doc(id).get().then(ds=>{
      mapaAgencia.set(id, ds.exists ? (ds.data().nome || ds.data().descricao || id) : id);
    }).catch(()=> mapaAgencia.set(id, id));
  });
  await Promise.all(reqs);
}

function nomeAgenciaPorRmUid(rmUid){
  const info = mapaRM.get(rmUid);
  if (!info) return '-';
  if (info.agenciaNome) return info.agenciaNome;
  if (info.agenciaId && mapaAgencia.has(info.agenciaId)) return mapaAgencia.get(info.agenciaId);
  return info.agenciaId || '-';
}

// Filtros ----------------------------------------------------------
async function montarFiltros(){
  // RM
  const fRm = document.getElementById('fRm');
  fRm.innerHTML = `<option value="">Todos</option>`;
  const vistos = new Set();
  docsBrutos.forEach(d=>{
    const chave = d.rmUid || d.rmNome;
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);
    const rLabel = d.rmNome || (mapaRM.get(d.rmUid)?.nome) || d.rmUid || 'RM';
    fRm.insertAdjacentHTML('beforeend', `<option value="${chave}">${rLabel}</option>`);
  });

  // Agência
  const fAg = document.getElementById('fAgencia');
  fAg.innerHTML = `<option value="">Todas</option>`;
  [...agenciasUnicas].sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(nome=>{
    fAg.insertAdjacentHTML('beforeend', `<option value="${nome}">${nome}</option>`);
  });

  // Ramo
  const fRamo = document.getElementById('fRamo');
  fRamo.innerHTML = `<option value="">Todos</option>`;
  [...ramosUnicos].sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(r=>{
    fRamo.insertAdjacentHTML('beforeend', `<option value="${r}">${r}</option>`);
  });
}

function aplicarFiltros(){
  const ini = document.getElementById('fDataIni').value;
  const fim = document.getElementById('fDataFim').value;
  const rmSel = document.getElementById('fRm').value;
  const agSel = document.getElementById('fAgencia').value;
  const ramoSel = document.getElementById('fRamo').value;
  const empTxt = norm(document.getElementById('fEmpresa').value);

  const lista = docsBrutos.filter(d=>{
    // datas (comparam pelo início de vigência)
    if (ini && (!d.inicioVigencia || d.inicioVigencia < ini)) return false;
    if (fim && (!d.inicioVigencia || d.inicioVigencia > fim)) return false;

    // RM
    if (rmSel){
      if (d.rmUid){
        if (d.rmUid !== rmSel) return false;
      } else {
        if (norm(d.rmNome) !== norm(rmSel)) return false;
      }
    }

    // Agência (compara pelo nome resolvido)
    if (agSel){
      const agNome = nomeAgenciaPorRmUid(d.rmUid);
      if (agNome !== agSel) return false;
    }

    // Ramo
    if (ramoSel && d.ramo !== ramoSel) return false;

    // Empresa (contém)
    if (empTxt && !norm(d.empresaNome).includes(empTxt)) return false;

    return true;
  });

  renderTabela(lista);
  atualizarResumo(lista);
}

function atualizarResumo(lista){
  const infoQtd = document.getElementById('infoQtd');
  const totalPremio = document.getElementById('totalPremio');
  const soma = lista.reduce((acc,cur)=> acc + (Number(cur.premioLiquido)||0), 0);
  infoQtd.textContent = `${lista.length} negócio(s)`;
  totalPremio.textContent = `Total prêmio: ${money(soma)}`;
}

// Render -----------------------------------------------------------
function renderTabela(lista){
  const tbody = document.getElementById('listaNegociosFechados');
  tbody.innerHTML = '';

  if (!lista.length){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sem resultados para os filtros atuais.</td></tr>`;
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
      <td>${money(d.premioLiquido)}</td>
      <td>${formatDateBR(d.inicioVigencia)}</td>
      <td>${formatDateBR(d.fimVigencia)}</td>
    `;
    tbody.appendChild(tr);
  }
}
