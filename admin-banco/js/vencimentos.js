if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const tbody = document.getElementById("relatorioBody");

// caches para evitar buscas repetidas
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
      rmNome: data?.rm || "-" // <- campo "rm" é o nome do gerente
    };
    cacheEmpresas[empId] = empresaInfo;
    return empresaInfo;
  } catch (e) {
    return { nome: empId, rmNome: "-" };
  }
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
      tbody.innerHTML += `
        <tr>
          <td>Visita</td>
          <td>${dataStr}</td>
          <td>${usuarioNome}</td>
          <td>${empresaInfo.nome}</td>
          <td>${empresaInfo.rmNome}</td>
          <td>${ramoKey.toUpperCase()}</td>
          <td>${ramo.vencimento || "-"}</td>
          <td>R$ ${ramo.premio?.toLocaleString("pt-BR") || "0"}</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>${ramo.seguradora || "-"}</td>
          <td>${ramo.observacoes || "-"}</td>
        </tr>
      `;
    }
  }

  // NEGÓCIOS FECHADOS
  const cotacoesSnap = await db.collection("cotacoes-gerentes").get();
  for (const doc of cotacoesSnap.docs) {
    const data = doc.data();
    const inicio = data.inicioVigencia || "-";
    const fim = data.fimVigencia || "-";
    const premio = Number(data.premioLiquido || 0).toLocaleString("pt-BR");
    const comissao = Number(data.comissaoValor || 0).toLocaleString("pt-BR");
    const percentual = data.comissaoPercentual || "-";
    const dataCriacao = data.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";

    const usuarioNome = await getUsuarioNome(data.autorUid);
    const empresaInfo = await getEmpresaInfo(data.empresaId);

    tbody.innerHTML += `
      <tr>
        <td>Negócio</td>
        <td>${dataCriacao}</td>
        <td>${usuarioNome}</td>
        <td>${empresaInfo.nome}</td>
        <td>${empresaInfo.rmNome}</td>
        <td>${data.ramo || "-"}</td>
        <td>-</td>
        <td>R$ ${premio}</td>
        <td>R$ ${comissao}</td>
        <td>${percentual}%</td>
        <td>${inicio}</td>
        <td>${fim}</td>
        <td>-</td>
        <td>${data.observacoes || "-"}</td>
      </tr>
    `;
  }
}

carregarRelatorio();
