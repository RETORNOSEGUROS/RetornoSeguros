
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

async function carregarRelatorio() {
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

  const negociosSnap = await db.collection("negocios-fechados").get();
  for (const doc of negociosSnap.docs) {
    const data = doc.data();
    
    let dataCriacao = "-";
    if (data.dataCriacao?.toDate) {
      dataCriacao = data.dataCriacao.toDate().toLocaleDateString("pt-BR");
    } else if (typeof data.dataCriacao === "string") {
      dataCriacao = data.dataCriacao;
    }
    
    const usuarioNome = await getUsuarioNome(data.usuarioUid || data.autorUid || "-");
    const empresaInfo = await getEmpresaInfo(data.empresaId);
    const premio = Number(data.premio || 0).toLocaleString("pt-BR");
    const vencimento = formatarDataDiaMes(data.vencimento || "-");

    tbody.innerHTML += `
      <tr>
        <td>Negócio</td>
        <td>${dataCriacao}</td>
        <td>${usuarioNome}</td>
        <td>${empresaInfo.nome}</td>
        <td>${empresaInfo.rmNome}</td>
        <td>${data.ramo || "-"}</td>
        <td>${vencimento}</td>
        <td>R$ ${premio}</td>
        <td>${data.seguradora || "-"}</td>
        <td>${data.observacoes || "-"}</td>
      </tr>
    `;
  }
}

carregarRelatorio();
