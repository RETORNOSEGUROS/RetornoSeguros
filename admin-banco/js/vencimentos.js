if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const tbody = document.getElementById("relatorioBody");
const filtroRM = document.getElementById("filtroRM");
const dataInicio = document.getElementById("dataInicio");
const dataFim = document.getElementById("dataFim");

const cacheUsuarios = {};
const cacheEmpresas = {};

function formatarDataDiaMes(dataStr) {
  if (!dataStr || dataStr === "-") return "-";
  if (dataStr.includes("/")) return dataStr.slice(0, 5);
  if (dataStr.includes("-")) {
    const partes = dataStr.split("-");
    return `${partes[2]}/${partes[1]}`;
  }
  return dataStr;
}

function extrairDiaMes(dataStr) {
  if (!dataStr || dataStr === "-") return null;
  if (dataStr instanceof Date) {
    const dia = String(dataStr.getDate()).padStart(2, '0');
    const mes = String(dataStr.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}`;
  }
  if (dataStr.includes("/")) {
    const [dia, mes] = dataStr.split("/");
    return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}`;
  }
  if (dataStr.includes("-")) {
    const partes = dataStr.split("-");
    return `${partes[2].padStart(2, '0')}/${partes[1].padStart(2, '0')}`;
  }
  return null;
}

async function getUsuarioNome(uid) {
  if (cacheUsuarios[uid]) return cacheUsuarios[uid];
  const snap = await db.collection("usuarios").doc(uid).get();
  const nome = snap.data()?.nome || uid;
  cacheUsuarios[uid] = nome;
  return nome;
}

async function getEmpresaInfo(empId) {
  if (cacheEmpresas[empId]) return cacheEmpresas[empId];
  const snap = await db.collection("empresas").doc(empId).get();
  const data = snap.data();
  const info = {
    nome: data?.nome || empId,
    rmNome: data?.rm || "-",
    rmId: data?.rmId || "",
    id: empId
  };
  cacheEmpresas[empId] = info;
  return info;
}

function dentroDoIntervalo(diaMes, inicio, fim) {
  if (!inicio || !fim) return true;
  return diaMes >= inicio && diaMes <= fim;
}

function abrirCotacao(empresaId, rm, ramo, valor) {
  const url = `cotacoes.html?empresaId=${empresaId}&rm=${encodeURIComponent(rm)}&ramo=${encodeURIComponent(ramo)}&valor=${valor}`;
  window.open(url, '_blank');
}

async function carregarRelatorio() {
  tbody.innerHTML = "";
  const inicioFiltro = extrairDiaMes(dataInicio.value);
  const fimFiltro = extrairDiaMes(dataFim.value);
  const rmSelecionado = filtroRM.value;

  const todosRegistros = [];

  // VISITAS
  const visitasSnap = await db.collection("visitas").get();
  for (const doc of visitasSnap.docs) {
    const data = doc.data();
    const dataStr = new Date(data.data?.seconds * 1000).toLocaleDateString("pt-BR");
    const usuarioNome = await getUsuarioNome(data.usuarioId);
    const empresa = await getEmpresaInfo(data.empresaId);
    if (rmSelecionado && empresa.rmNome !== rmSelecionado) continue;
    const ramos = data.ramos || {};

    for (const ramoKey of Object.keys(ramos)) {
      const ramo = ramos[ramoKey];
      const venc = extrairDiaMes(ramo.vencimento);
      if (!dentroDoIntervalo(venc, inicioFiltro, fimFiltro)) continue;

      todosRegistros.push({
        origem: "Visita",
        data: dataStr,
        usuario: usuarioNome,
        empresaNome: empresa.nome,
        rm: empresa.rmNome,
        ramo: ramoKey.toUpperCase(),
        vencimento: venc || "-",
        premio: ramo.premio || 0,
        seguradora: ramo.seguradora || "-",
        observacoes: ramo.observacoes || "-",
        empresaId: empresa.id
      });
    }
  }

  // NEGÓCIOS
  const negociosSnap = await db.collection("cotacoes-gerentes").get();
  for (const doc of negociosSnap.docs) {
    try {
      const data = doc.data();
      const dataStr = data.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";
      const usuarioNome = await getUsuarioNome(data.autorUid);
      const empresa = await getEmpresaInfo(data.empresaId);
      if (rmSelecionado && empresa.rmNome !== rmSelecionado) continue;

      let venc = "-";
      try {
  if (data.fimVigencia?.toDate) {
    venc = extrairDiaMes(data.fimVigencia.toDate());
  } else if (typeof data.fimVigencia === "string") {
    venc = extrairDiaMes(data.fimVigencia);
  }
} catch (err) {
  console.warn("Vencimento inválido:", data.fimVigencia);
}


      if (!dentroDoIntervalo(venc, inicioFiltro, fimFiltro)) continue;

      todosRegistros.push({
        origem: "Negócio",
        data: dataStr,
        usuario: usuarioNome,
        empresaNome: empresa.nome,
        rm: empresa.rmNome,
        ramo: data.ramo || "-",
        vencimento: venc || "-",
        premio: data.premioLiquido || 0,
        seguradora: "-",
        observacoes: data.observacoes || "-",
        empresaId: empresa.id
      });
    } catch (e) {
      console.error("Erro ao processar negocio:", e);
    }
  }

  // Ordenar por vencimento (dia/mês)
  todosRegistros.sort((a, b) => {
    if (a.vencimento === "-" || b.vencimento === "-") return 0;
    const [diaA, mesA] = a.vencimento.split("/").map(Number);
    const [diaB, mesB] = b.vencimento.split("/").map(Number);
    return mesA === mesB ? diaA - diaB : mesA - mesB;
  });

  // Renderizar
  for (const reg of todosRegistros) {
    tbody.innerHTML += `
      <tr>
        <td>${reg.origem}</td>
        <td>${reg.data}</td>
        <td>${reg.usuario}</td>
        <td>${reg.empresaNome}</td>
        <td>${reg.rm}</td>
        <td>${reg.ramo}</td>
        <td>${reg.vencimento}</td>
        <td>R$ ${Number(reg.premio).toLocaleString("pt-BR")}</td>
        <td>${reg.seguradora}</td>
        <td>${reg.observacoes}</td>
        <td><button onclick="abrirCotacao('${reg.empresaId}', '${reg.rm}', '${reg.ramo}', '${reg.premio}')">Iniciar Cotação</button></td>
      </tr>
    `;
  }
}

// Carregar RMs no select
async function carregarRMs() {
  const snap = await db.collection("empresas").get();
  const rmsSet = new Set();
  snap.forEach(doc => {
    const rm = doc.data().rm;
    if (rm) rmsSet.add(rm);
  });
  filtroRM.innerHTML = '<option value="">Todos os RMs</option>';
  [...rmsSet].sort().forEach(rm => {
    filtroRM.innerHTML += `<option value="${rm}">${rm}</option>`;
  });
}

carregarRMs().then(() => carregarRelatorio());

