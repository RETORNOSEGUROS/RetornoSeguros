/**************************************
 * Negócios Fechados (cotacoes)
 * - Gerente Chefe: vê só RMs da sua agência
 * - RM: vê só o que é dele
 * - Admin: vê tudo
 **************************************/

/* ========= Firebase boot ========= */
(function safeFirebaseInit() {
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
  } catch (e) {
    // ignora "already exists"
    if (!String(e).includes('already exists')) throw e;
  }
})();

const auth = firebase.auth();
const db   = firebase.firestore();

/* ========= Mapa de elementos (ajuste aqui se seus IDs forem outros) ========= */
const EL = {
  // filtros
  de:           document.getElementById('dtInicio')        || document.querySelector('#deData, #dtInicio, input[name="de"]'),
  ate:          document.getElementById('dtFim')            || document.querySelector('#ateData, #dtFim, input[name="ate"]'),
  selRm:        document.getElementById('selRm')            || document.querySelector('#rm, #rmSelect, #filtroRm'),
  selAg:        document.getElementById('selAg')            || document.querySelector('#agencia, #agenciaSelect, #filtroAgencia'),
  selRamo:      document.getElementById('selRamo')          || document.querySelector('#ramo, #ramoSelect'),
  txtEmpresa:   document.getElementById('txtEmpresa')       || document.querySelector('#empresa, #empresaNome, #filtroEmpresa'),

  // botões
  btnAplicar:   document.getElementById('btnAplicar')       || document.querySelector('#aplicar, button[data-apply]'),
  btnLimpar:    document.getElementById('btnLimpar')        || document.querySelector('#limpar, button[data-clear]'),

  // saída
  tbody:        document.getElementById('tbodyNegocios')    || document.querySelector('#tbody, tbody'),
  totalBadge:   document.getElementById('badgeTotalPremio') || document.querySelector('#totalPremio, [data-total-premio]'),

  // estados
  statusMsg:    document.getElementById('statusLista')      || document.querySelector('#status, [data-status]')
};

const setStatus = (msg) => { if (EL.statusMsg) EL.statusMsg.textContent = msg || ''; };

/* ========= Estado do usuário ========= */
let ME = {
  uid: null,
  email: null,
  perfil: null,        // 'rm' | 'gerente_chefe' | 'admin' | ...
  agenciaId: null,
  nome: null,
  isAdmin: false
};

/* ========= Util ========= */
const toTS = (val) => {
  if (!val) return null;
  const [dd, mm, yyyy] = val.split('/'); // dd/mm/aaaa
  const d = new Date(+yyyy, +mm - 1, +dd, 0, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  return firebase.firestore.Timestamp.fromDate(d);
};

const currency = (v) => (typeof v === 'number' ? v : +v || 0);
const fmtBRL   = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizaStatus(s) {
  if (!s) return '';
  const t = String(s).trim().toLowerCase();
  // mapeia variações comuns para dois grupos
  if (t.includes('emitido'))  return 'emitido';
  if (t.includes('fechado'))  return 'fechado';
  return t;
}

/* ========= DOM helpers ========= */
function readFilters() {
  const deTS   = toTS(EL.de?.value || '');
  const ateTS  = toTS(EL.ate?.value || '');
  const rmUid  = EL.selRm?.value || '';
  const agId   = EL.selAg?.value || '';
  const ramo   = (EL.selRamo?.value || '').trim();
  const emp    = (EL.txtEmpresa?.value || '').trim().toLowerCase();
  return { deTS, ateTS, rmUid, agId, ramo, emp };
}

function clearFilters() {
  if (EL.de)        EL.de.value = '';
  if (EL.ate)       EL.ate.value = '';
  if (EL.selRm)     EL.selRm.value = 'Todos';
  if (EL.selAg)     EL.selAg.value = 'Todas';
  if (EL.selRamo)   EL.selRamo.value = 'Todos';
  if (EL.txtEmpresa)EL.txtEmpresa.value = '';
}

function renderRows(rows) {
  if (!EL.tbody) return;
  EL.tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.empresa || '-'}</td>
      <td>${r.ramo    || '-'}</td>
      <td>${r.rmNome  || '-'}</td>
      <td>${r.agencia || '-'}</td>
      <td>${fmtBRL(r.premio)}</td>
      <td>${r.inicio  || '-'}</td>
      <td>${r.fim     || '-'}</td>
    `;
    EL.tbody.appendChild(tr);
  });
}

/* ========= Carregamento de combos (opcional) =========
   (Se sua página já carrega combos via HTML, isso
   simplesmente não atrapalha — tenta só completar.) */
async function fillAgencias() {
  if (!EL.selAg) return;
  if (EL.selAg.options.length > 0) return; // já vem do HTML
  const optTodas = new Option('Todas', 'Todas');
  EL.selAg.appendChild(optTodas);
  const snap = await db.collection('agencias_banco').orderBy('nome').get();
  snap.forEach(d => {
    const a = d.data() || {};
    const label = `${a.nome || '(sem nome)'}${a.banco ? ' — ' + a.banco : ''}${a.Cidade ? ' / ' + a.Cidade : ''}${a.estado ? ' - ' + a.estado : ''}`;
    EL.selAg.appendChild(new Option(label, d.id));
  });
}

async function fillRMs(agenciaIdForFilter) {
  if (!EL.selRm) return;
  EL.selRm.innerHTML = '';
  EL.selRm.appendChild(new Option('Todos', 'Todos'));

  let q = db.collection('usuarios_banco').where('perfil', '==', 'rm');
  if (agenciaIdForFilter) q = q.where('agenciaId', '==', agenciaIdForFilter);
  const snap = await q.get();
  snap.forEach(d => {
    const u = d.data() || {};
    EL.selRm.appendChild(new Option(u.nome || '(sem nome)', d.id));
  });
}

/* ========= Núcleo: busca as cotações com regras por perfil ========= */
async function fetchCotacoesComRegras(filtros) {
  // status alvo (duas variações mais comuns)
  const TARGETS = ['negócio emitido', 'negocio emitido', 'negócio fechado', 'negocio fechado'];

  // Construtor de uma query base por status (sem RM)
  const base = (statusStr) => {
    let q = db.collection('cotacoes').where('status', '==', statusStr);

    if (filtros.deTS)  q = q.where('data', '>=', filtros.deTS);   // se existir o campo
    if (filtros.ateTS) q = q.where('data', '<=', filtros.ateTS);  // idem

    // filtros opcionais que provavelmente existem
    if (filtros.agId && filtros.agId !== 'Todas') {
      q = q.where('agenciaId', '==', filtros.agId);
    }
    if (filtros.ramo && filtros.ramo !== 'Todos') {
      q = q.where('ramo', '==', filtros.ramo);
    }
    return q;
  };

  // lista final
  const hits = [];

  // Helper para puxar e empilhar de uma query (aplicando filtro por empresa, se houver)
  async function pushFromQuery(q) {
    const snap = await q.get();
    snap.forEach(doc => {
      const d = doc.data() || {};
      // filtro de empresa (client-side se houver texto)
      if (filtros.emp) {
        const nome = (d.empresa || '').toLowerCase();
        if (!nome.includes(filtros.emp)) return;
      }
      hits.push({ id: doc.id, ...d });
    });
  }

  // RM/Agência com regras de visibilidade
  if (ME.isAdmin) {
    // Admin: duas queries (emitido/fechado)
    for (const status of TARGETS) {
      await pushFromQuery(base(status));
    }
  } else if ((ME.perfil || '').replace(' ', '_') === 'gerente_chefe') {
    // Gerente Chefe: RM ∈ [RMs da sua agência]
    const rmsSnap = await db.collection('usuarios_banco')
      .where('perfil', '==', 'rm')
      .where('agenciaId', '==', ME.agenciaId || '__none__')
      .get();

    const rmIds = rmsSnap.docs.map(d => d.id);

    if (rmIds.length === 0) return []; // não há RMS => nada a listar

    // se usuário escolheu 1 RM no filtro, restringe mais
    const filtroRm = (filtros.rmUid && filtros.rmUid !== 'Todos') ? filtros.rmUid : null;
    const baseRms = filtroRm ? [filtroRm] : rmIds;

    // Firestore 'in' aceita máx 10 => chunk
    const grupos = chunk(baseRms, 10);
    for (const status of TARGETS) {
      for (const grupo of grupos) {
        let q = base(status).where('rmUid', 'in', grupo);
        await pushFromQuery(q);
      }
    }
  } else if ((ME.perfil || '').toLowerCase() === 'rm') {
    // RM: só o dele (ou filtro de RM força outro — mas normalmente mantemos só o dele)
    const meu = ME.uid;
    for (const status of TARGETS) {
      await pushFromQuery(base(status).where('rmUid', '==', meu));
    }
  } else {
    // Outros perfis (assistente, etc) — regra mínima: mesma agência do usuário
    const ag = ME.agenciaId || '__none__';
    for (const status of TARGETS) {
      await pushFromQuery(base(status).where('agenciaId', '==', ag));
    }
  }

  return hits;
}

/* ========= Pipeline: aplica filtros, consulta e preenche tabela ========= */
async function aplicar() {
  try {
    setStatus('Carregando...');
    if (EL.tbody) EL.tbody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';

    const filtros = readFilters();

    // Para gerente_chefe: refaz combo de RM conforme agência escolhida
    const souChefe = (ME.isAdmin ? false : ((ME.perfil || '').replace(' ', '_') === 'gerente_chefe'));
    if (souChefe && EL.selAg && EL.selRm) {
      // quando agência muda, refaz lista de RMs
      const agForRms = (filtros.agId && filtros.agId !== 'Todas') ? filtros.agId : (ME.agenciaId || '');
      await fillRMs(agForRms);
      // mantém seleção se o valor ainda existir
      if (filtros.rmUid && EL.selRm.querySelector(`option[value="${filtros.rmUid}"]`)) {
        EL.selRm.value = filtros.rmUid;
      }
    }

    // Busca com regras de visibilidade
    let docs = await fetchCotacoesComRegras(filtros);

    // Filtros que talvez não estejam indexados no Firestore (faz local)
    if (filtros.rmUid && filtros.rmUid !== 'Todos') {
      docs = docs.filter(d => d.rmUid === filtros.rmUid);
    }
    if (filtros.agId && filtros.agId !== 'Todas') {
      docs = docs.filter(d => d.agenciaId === filtros.agId);
    }
    if (filtros.ramo && filtros.ramo !== 'Todos') {
      docs = docs.filter(d => (d.ramo || '') === filtros.ramo);
    }

    // Ordena por data (desc) se existir, senão por empresa
    docs.sort((a, b) => {
      const da = a.data?.toMillis?.() || 0;
      const db = b.data?.toMillis?.() || 0;
      if (db !== da) return db - da;
      const ea = (a.empresa || '').localeCompare(b.empresa || '');
      return ea;
    });

    // Monta linhas
    const rows = docs.map(d => {
      const inicio = d.inicioVigencia || d.inicio || d.data?.toDate?.()?.toLocaleDateString?.('pt-BR') || '-';
      const fim    = d.fimVigencia    || d.fim    || '-';
      return {
        empresa: d.empresa || '-',
        ramo:    d.ramo    || '-',
        rmNome:  d.rmNome  || d.rm || '-',
        agencia: d.agenciaLabel || d.agencia || '-', // caso guarde label amigável
        premio:  currency(d.premio || d.valor || 0),
        inicio, fim
      };
    });

    // Total prêmio
    const totalPremio = rows.reduce((acc, r) => acc + currency(r.premio), 0);
    if (EL.totalBadge) EL.totalBadge.textContent = fmtBRL(totalPremio);

    // Render
    renderRows(rows);
    setStatus(`${rows.length} negócio(s)`);
  } catch (e) {
    console.error('Erro ao carregar negócios fechados:', e);
    setStatus('Erro ao carregar. Veja o console.');
  }
}

/* ========= Boot ========= */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    alert('Faça login para continuar.');
    return (window.location.href = 'login.html');
  }

  ME.uid   = user.uid;
  ME.email = user.email || '';
  ME.isAdmin = (ME.email === 'patrick@retornoseguros.com.br');

  try {
    const udoc = await db.collection('usuarios_banco').doc(user.uid).get();
    const u = udoc.exists ? (udoc.data() || {}) : {};
    ME.perfil    = (u.perfil || '').toLowerCase();
    ME.agenciaId = u.agenciaId || '';
    ME.nome      = u.nome || '';
  } catch (e) {
    console.warn('Falha lendo perfil do usuário:', e);
  }

  // combos (se necessários)
  await fillAgencias();
  const agForRms = (ME.isAdmin ? '' : ME.agenciaId);
  await fillRMs(agForRms);

  // listeners
  EL.btnAplicar && EL.btnAplicar.addEventListener('click', aplicar);
  EL.btnLimpar  && EL.btnLimpar.addEventListener('click', () => { clearFilters(); aplicar(); });
  EL.selAg      && EL.selAg.addEventListener('change', async () => {
    // gerente chefe troca agência => recarrega RMs
    const souChefe = (!ME.isAdmin && (ME.perfil || '').replace(' ', '_') === 'gerente_chefe');
    if (souChefe) await fillRMs(EL.selAg.value);
  });

  // primeira carga
  aplicar();
});
