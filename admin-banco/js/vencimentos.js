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
  const partes = dataStr.split("-");
  if (partes.length === 3) return `${partes[2]}/${partes[1]}`; // yyyy-mm-dd
  if (partes.length === 2) return dataStr; // já está dd/mm
  return dataStr;
}

async function carregarRelatorio() {
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

      tbody.innerHTML += `
        <tr>
          <td>Visita</td>
          <td>${dataStr}</td>
          <td>${usuarioNome}</td>
          <td>${empresaInfo.nome}</td>
          <td>${empresaInfo.rmNome}</td>
          <td>${ramoKey.toUpperCase()}</td>
          <td>${vencimento}</td>
          <td>R$ ${ramo.premio?.toLocaleString("pt-BR") || "0"}</td>
          <td>${ramo.seguradora || "-"}</td>
          <td>${ramo.observacoes || "-"}</td>
        </tr>
      `;
    }
  }

  // NEGÓCIOS
  const cotacoesSnap = await db.collection("cotacoes-gerentes").get();
  for (const doc of cotacoesSnap.docs) {
    const data = doc.data();
    const dataCriacao = data.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";
    const usuarioNome = await getUsuarioNome(data.autorUid);
    const empresaInfo = await getEmpresaInfo(data.empresaId);
    const premio = Number(data.premioLiquido || 0).toLocaleString("pt-BR");
    const fim = formatarDataDiaMes(data.fimVigencia || "-");

    tbody.innerHTML += `
      <tr>
        <td>Negócio</td>
        <td>${dataCriacao}</td>
        <td>${usuarioNome}</td>
        <td>${empresaInfo.nome}</td>
        <td>${empresaInfo.rmNome}</td>
        <td>${data.ramo || "-"}</td>
        <td>${fim}</td>
        <td>R$ ${premio}</td>
        <td>-</td>
        <td>${data.observacoes || "-"}</td>
      </tr>
    `;
  }
}

carregarRelatorio();
