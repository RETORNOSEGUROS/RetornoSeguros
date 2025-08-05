if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const tbody = document.getElementById("relatorioBody");

const cacheUsuarios = {};
const cacheEmpresas = {};

async function getUsuarioNome(uid) {
  if (cacheUsuarios[uid]) return cacheUsuarios[uid];
  if (!uid) return "-";
  try {
    const snap = await db.collection("usuarios").doc(uid).get();
    const data = snap.data();
    const nome = data?.nome || uid;
    cacheUsuarios[uid] = nome;
    return nome;
  } catch (e) {
    return uid;
  }
}

async function getEmpresaInfo(empId) {
  if (cacheEmpresas[empId]) return cacheEmpresas[empId];
  if (!empId) return { nome: empId, rmNome: "-" };
  try {
    const snap = await db.collection("empresas").doc(empId).get();
    const data = snap.data();
    const empresaInfo = {
      nome: data?.nome || empId,
      rmNome: data?.rm || "-"
    };
    cacheEmpresas[empId] = empresaInfo;
    return empresaInfo;
  } catch (e) {
    return { nome: empId, rmNome: "-" };
  }
}

function formatarDataDiaMes(dataStr) {
  if (!dataStr || dataStr === "-") return "-";
  if (dataStr.includes("/")) {
    const partes = dataStr.split("/");
    return `${partes[0]}/${partes[1]}`;
  }
  if (dataStr.includes("-")) {
    const partes = dataStr.split("-");
    return `${partes[2]}/${partes[1]}`; // yyyy-mm-dd
  }
  return dataStr;
}

function abrirCotacao(empresaId, rm, ramo, valor) {
  const url = `cotacoes.html?empresaId=${empresaId}&rm=${encodeURIComponent(rm)}&ramo=${encodeURIComponent(ramo)}&valor=${valor}`;
  window.open(url, '_blank');
}

async function carregarRelatorio() {
  const todosRegistros = [];

  // VISITAS
  const visitasSnap = await db.collection("visitas").get();
  for (const doc of visitasSnap.docs) {
    const data = doc.data();
    const dataStr = new Date(data.data?.seconds * 1000).toLocaleDateString("pt-BR");
    const usuarioNome = await getUsuarioNome(data.usuarioId);
    const empresaInfo = await getEmpresaInfo(data.empresaId);
    const ramos = data.ramos || {};

    for (const ramoKey of Object.keys(ramos)) {
      const ramo = ramos[ramoKey];
      const vencimento = formatarDataDiaMes(ramo.vencimento || "-");

      todosRegistros.push({
        origem: "Visita",
        data: dataStr,
        usuario: usuarioNome,
        empresaNome: empresaInfo.nome,
        rm: empresaInfo.rmNome,
        ramo: ramoKey.toUpperCase(),
        vencimento,
        premio: ramo.premio || 0,
        seguradora: ramo.seguradora || "-",
        observacoes: ramo.observacoes || "-",
        empresaId: doc.data().empresaId
      });
    }
  }

  // NEGÓCIOS
  const cotacoesSnap = await db.collection("cotacoes-gerentes").get();
  for (const doc of cotacoesSnap.docs) {
    const data = doc.data();
    const dataCriacao = data.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";
    const usuarioNome = await getUsuarioNome(data.autorUid);
    const empresaInfo = await getEmpresaInfo(data.empresaId);
    const premio = Number(data.premioLiquido || 0);

    let vencimento = "-";
    if (data.fimVigencia && data.fimVigencia.length === 10) {
      const partes = data.fimVigencia.split("-");
      vencimento = `${partes[2]}/${partes[1]}`;
    }

    todosRegistros.push({
      origem: "Negócio",
      data: dataCriacao,
      usuario: usuarioNome,
      empresaNome: empresaInfo.nome,
      rm: empresaInfo.rmNome,
      ramo: data.ramo || "-",
      vencimento,
      premio,
      seguradora: "-",
      observacoes: data.observacoes || "-",
      empresaId: data.empresaId
    });
  }

  // Ordenação por vencimento
  todosRegistros.sort((a, b) => {
    if (a.vencimento === "-" || b.vencimento === "-") return 0;
    const [diaA, mesA] = a.vencimento.split("/").map(Number);
    const [diaB, mesB] = b.vencimento.split("/").map(Number);
    return mesA === mesB ? diaA - diaB : mesA - mesB;
  });

  // Renderiza
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

carregarRelatorio();
