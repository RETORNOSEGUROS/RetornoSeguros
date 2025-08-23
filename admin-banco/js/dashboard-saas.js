// dashboard-saas.js

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ===== Helpers
const norm = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const toDate = x => x?.toDate ? x.toDate() : (x ? new Date(x) : null);
const fmtBRL = n => (Number(n||0)).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmtData = d => d ? d.toLocaleDateString("pt-BR") : "-";
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

// ===== Estado
let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };

// ===== Menu dinâmico
const ROTAS = {
  base: {
    "Cadastrar Gerentes":"cadastro-geral.html","Cadastrar Empresa":"cadastro-empresa.html","Agências":"agencias.html",
    "Agenda Visitas":"agenda-visitas.html","Visitas":"visitas.html","Empresas":"empresas.html",
    "Solicitações de Cotação":"cotacoes.html","Produção":"negocios-fechados.html","Consultar Dicas":"consultar-dicas.html",
    "Dicas Produtos":"dicas-produtos.html","Ramos Seguro":"ramos-seguro.html","Relatório Visitas":"visitas-relatorio.html",
    "Vencimentos":"vencimentos.html","Relatórios":"relatorios.html","Funcionários":"funcionarios.html",
    "Dashboard (SaaS)":"dashboard-saas.html"
  },
  adminOnly: {"Carteira":"carteira.html","Comissões":"comissoes.html","Resgates (Admin)":"resgates-admin.html"}
};
function montarMenu(perfil){
  const nav = document.getElementById('menuNav'); nav.innerHTML = "";
  const p = norm(perfil);
  let rotas = {...ROTAS.base};
  if (p === 'admin') Object.assign(rotas, ROTAS.adminOnly);
  const frag = document.createDocumentFragment();
  for (const [label, href] of Object.entries(rotas)){
    const a = document.createElement('a');
    a.href = href;
    a.className = "flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-100";
    a.innerHTML = `<span class="text-sm">🔹</span><span class="text-[15px]">${label}</span>`;
    frag.appendChild(a);
  }
  nav.appendChild(frag);
}

// ===== Auth/contexto
auth.onAuthStateChanged(async (user)=>{
  if(!user) return location.href="login.html";
  CTX.uid = user.uid;

  const prof = await db.collection("usuarios_banco").doc(user.uid).get();
  if(!prof.exists){
    document.getElementById("perfilUsuario").textContent = "perfil não encontrado";
    return;
  }
  const d = prof.data();
  CTX.perfil    = d.perfil || "—";
  CTX.agenciaId = d.agenciaId || d.agenciaid || null;
  CTX.nome      = d.nome || user.email;

  document.getElementById("perfilUsuario").textContent = `${CTX.nome} (${CTX.perfil})`;
  montarMenu(CTX.perfil);

  // carregar métricas
  await Promise.all([
    metricaProducaoMes(),
    metricaVencimentos(),
    metricaVisitasHoje(),
    metricaCotacoesAbertas(),
    tabelaVencimentos()
  ]);
});

// ===== Métricas (cards)
async function metricaProducaoMes(){
  // origem: cotacoes-gerentes com status "negocio emitido" (normalizado)
  let q = db.collection("cotacoes-gerentes");
  if(norm(CTX.perfil)==='rm') q=q.where("rmUid","==",CTX.uid);
  else if(['assistente','gerente chefe','gerente-chefe','gerente_chefe'].includes(norm(CTX.perfil)) && CTX.agenciaId){
    q=q.where("agenciaId","==",CTX.agenciaId);
  }
  const snap = await q.limit(1000).get();
  const hoje = new Date();
  const mesAtual = hoje.getMonth(), anoAtual = hoje.getFullYear();

  let totalMes = 0, totalMesAnterior = 0;
  const hist = {}; // { 'YYYY-MM': valor }

  snap.forEach(doc=>{
    const d = doc.data();
    const st = norm(d.status||"");
    if (st !== 'negocio emitido') return;
    const valor = Number(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0);
    const dt = toDate(d.dataCriacao) || toDate(d.criadoEm) || hoje;
    const key = monthKey(dt);
    hist[key] = (hist[key]||0) + valor;

    if (dt.getFullYear()===anoAtual && dt.getMonth()===mesAtual) totalMes += valor;
    const ant = new Date(anoAtual, mesAtual-1, 1);
    if (dt.getFullYear()===ant.getFullYear() && dt.getMonth()===ant.getMonth()) totalMesAnterior += valor;
  });

  document.getElementById("cardProducaoMes").textContent = fmtBRL(totalMes);
  const delta = totalMesAnterior ? ((totalMes-totalMesAnterior)/totalMesAnterior)*100 : (totalMes>0?100:0);
  document.getElementById("cardProducaoDelta").textContent =
    isFinite(delta) ? `${delta>=0?'+':''}${delta.toFixed(1)}% vs mês anterior` : '—';

  // gráfico últimos 6 meses
  const labels = []; const data = [];
  for (let i=5;i>=0;i--){
    const dt = new Date(anoAtual, mesAtual - i, 1);
    const k  = monthKey(dt);
    labels.push(dt.toLocaleString('pt-BR',{month:'short'}));
    data.push(hist[k]||0);
  }
  desenharGrafico(labels, data);
}

async function metricaVencimentos(){
  // origem (ajuste conforme seus dados): negocios-fechados ou producao com vigencias
  const hoje = new Date();
  const limite = new Date(); limite.setDate(limite.getDate()+30);

  let q = db.collection("negocios-fechados");
  if(norm(CTX.perfil)==='rm') q=q.where("rmUid","==",CTX.uid);
  else if(['assistente','gerente chefe','gerente-chefe','gerente_chefe'].includes(norm(CTX.perfil)) && CTX.agenciaId){
    q=q.where("agenciaId","==",CTX.agenciaId);
  }
  const snap = await q.limit(1000).get();
  let count = 0;
  snap.forEach(doc=>{
    const d = doc.data();
    const fim = toDate(d.vigenciaAte) || toDate(d.vigencia_fim) || toDate(d.vigencia_ate);
    if (!fim) return;
    if (fim >= hoje && fim <= limite) count++;
  });
  document.getElementById("cardVencimentos").textContent = count;
}

async function metricaVisitasHoje(){
  const start = new Date(); start.setHours(0,0,0,0);
  const end   = new Date(); end.setHours(23,59,59,999);

  let q = db.collection("agenda_visitas");
  if(norm(CTX.perfil)==='rm') q=q.where("rmUid","==",CTX.uid);
  else if(['assistente','gerente chefe','gerente-chefe','gerente_chefe'].includes(norm(CTX.perfil)) && CTX.agenciaId){
    q=q.where("agenciaId","==",CTX.agenciaId);
  }
  const snap = await q.limit(500).get();
  let cnt = 0;
  snap.forEach(doc=>{
    const d = doc.data();
    const dt = toDate(d.dataHoraTs) || toDate(d.dataHora) || toDate(d.dataHoraStr);
    if (!dt) return;
    if (dt >= start && dt <= end) cnt++;
  });
  document.getElementById("cardVisitasHoje").textContent = cnt;
}

async function metricaCotacoesAbertas(){
  let q = db.collection("cotacoes-gerentes");
  if(norm(CTX.perfil)==='rm') q=q.where("rmUid","==",CTX.uid);
  else if(['assistente','gerente chefe','gerente-chefe','gerente_chefe'].includes(norm(CTX.perfil)) && CTX.agenciaId){
    q=q.where("agenciaId","==",CTX.agenciaId);
  }
  const snap = await q.limit(1000).get();
  let ab = 0;
  snap.forEach(doc=>{
    const st = norm(doc.data().status||"");
    if (st !== 'negocio emitido') ab++;
  });
  document.getElementById("cardCotacoesAbertas").textContent = ab;
}

// ===== Tabela de vencimentos (próx. 30 dias)
async function tabelaVencimentos(){
  const tbody = document.getElementById("tbodyVenc");
  const hoje = new Date();
  const limite = new Date(); limite.setDate(limite.getDate()+30);

  let q = db.collection("negocios-fechados");
  if(norm(CTX.perfil)==='rm') q=q.where("rmUid","==",CTX.uid);
  else if(['assistente','gerente chefe','gerente-chefe','gerente_chefe'].includes(norm(CTX.perfil)) && CTX.agenciaId){
    q=q.where("agenciaId","==",CTX.agenciaId);
  }
  const snap = await q.limit(1000).get();
  const lista = [];
  snap.forEach(doc=>{
    const d = doc.data();
    const fim = toDate(d.vigenciaAte) || toDate(d.vigencia_fim) || toDate(d.vigencia_ate);
    if (!fim) return;
    if (fim >= hoje && fim <= limite){
      lista.push({
        empresa: d.empresaNome || d.empresa || "Empresa",
        ramo: d.ramo || "-",
        premio: Number(d.valorFinal ?? d.premio ?? d.valorNegocio ?? 0),
        vigencia: fim,
        resp: d.rmNome || "-"
      });
    }
  });

  // busca simples
  const busca = document.getElementById('buscaVenc');
  const render = (arr)=>{
    tbody.innerHTML = "";
    if (!arr.length){
      tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-slate-500">Nenhum vencimento nos próximos 30 dias.</td></tr>`;
      return;
    }
    arr.sort((a,b)=> a.vigencia - b.vigencia);
    arr.forEach(x=>{
      const tr = document.createElement('tr');
      tr.className = "border-t border-slate-100";
      tr.innerHTML = `
        <td class="p-2">${x.empresa}</td>
        <td class="p-2">${x.ramo}</td>
        <td class="p-2">${fmtBRL(x.premio)}</td>
        <td class="p-2">${fmtData(x.vigencia)}</td>
        <td class="p-2">${x.resp}</td>
      `;
      tbody.appendChild(tr);
    });
  };
  render(lista);

  busca?.addEventListener('input', (e)=>{
    const t = norm(e.target.value);
    if(!t) return render(lista);
    render(lista.filter(x => norm(x.empresa).includes(t)));
  });
}

// ===== Gráfico
let chartRef = null;
function desenharGrafico(labels, data){
  const ctx = document.getElementById('graficoMeses');
  if (chartRef) chartRef.destroy();
  chartRef = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label:'Prêmio (R$)', data }]
    },
    options: { responsive:true, maintainAspectRatio:false }
  });
}
