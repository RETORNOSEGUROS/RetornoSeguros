firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const listaDiv = document.getElementById("lista-visitas");
const container = document.createElement("div");
container.innerHTML = `
  <div style="margin-bottom: 15px;">
    <label>Data Início:</label>
    <input type="date" id="filtroDataInicio">
    <label>Data Fim:</label>
    <input type="date" id="filtroDataFim">
    <label>Filtrar por Empresa:</label>
    <input type="text" id="filtroEmpresa" placeholder="Digite parte do nome">
    <label>Filtrar por Usuário:</label>
    <input type="text" id="filtroUsuario" placeholder="Digite parte do nome">
    <button onclick="aplicarFiltro()">Aplicar Filtros</button>
    <button onclick="exportarCSV()">Exportar Excel</button>
  </div>
`;
document.body.insertBefore(container, listaDiv);

let dadosVisitas = [];

async function carregarRelatorio() {
  try {
    const visitasSnap = await db.collection("visitas").orderBy("data", "desc").get();
    if (visitasSnap.empty) return listaDiv.innerHTML = "Nenhuma visita registrada.";

    const empresas = {};
    const usuarios = {};

    const visitas = await Promise.all(visitasSnap.docs.map(async doc => {
      const v = doc.data();
      v.id = doc.id;
      v.dataObj = v.data?.toDate?.() || new Date();

      try {
        if (!empresas[v.empresaId]) {
          const emp = await db.collection("empresas").doc(v.empresaId).get();
          empresas[v.empresaId] = emp.exists ? emp.data() : { nome: `[empresa removida: ${v.empresaId}]` };
        }
      } catch (e) {
        empresas[v.empresaId] = { nome: `[erro empresa: ${v.empresaId}]` };
      }

      try {
        if (!usuarios[v.usuarioId]) {
          const user = await db.collection("usuarios_banco").doc(v.usuarioId).get();
          usuarios[v.usuarioId] = user.exists ? user.data().nome || user.data().email : `[usuário removido: ${v.usuarioId}]`;
        }
      } catch (e) {
        usuarios[v.usuarioId] = `[erro usuario: ${v.usuarioId}]`;
      }

      v.usuarioNome = usuarios[v.usuarioId];
      v.empresaNome = empresas[v.empresaId]?.nome || '-';
      v.empresaRM = empresas[v.empresaId]?.rm || '-';
      return v;
    }));

    dadosVisitas = visitas;
    renderizarTabela(visitas);
  } catch (err) {
    console.error("Erro ao carregar visitas:", err);
    listaDiv.innerHTML = "Erro ao carregar visitas.";
  }
}

function aplicarFiltro() {
  const emp = document.getElementById("filtroEmpresa").value.toLowerCase();
  const usr = document.getElementById("filtroUsuario").value.toLowerCase();
  const dataIni = document.getElementById("filtroDataInicio").value;
  const dataFim = document.getElementById("filtroDataFim").value;

  const filtradas = dadosVisitas.filter(v => {
    const empNome = v.empresaNome?.toLowerCase() || "";
    const usrNome = v.usuarioNome?.toLowerCase() || "";
    const dataVisita = v.dataObj;
    const dentroPeriodo = (!dataIni || dataVisita >= new Date(dataIni)) && (!dataFim || dataVisita <= new Date(dataFim + 'T23:59:59'));
    return empNome.includes(emp) && usrNome.includes(usr) && dentroPeriodo;
  });
  renderizarTabela(filtradas);
}

function renderizarTabela(visitas) {
  let html = `<table><thead><tr>
    <th>Data</th>
    <th>Usuário</th>
    <th>Empresa</th>
    <th>RM da Empresa</th>
    <th>Ramo</th>
    <th>Vencimento</th>
    <th>Prêmio</th>
    <th>Seguradora</th>
    <th>Observações</th>
  </tr></thead><tbody>`;

  visitas.forEach(v => {
    const dataVisita = v.dataObj.toLocaleDateString("pt-BR");

    for (const [ramo, info] of Object.entries(v.ramos || {})) {
      let vencimentoFormatado = "-";

      if (info.vencimento?.toDate) {
        vencimentoFormatado = info.vencimento.toDate().toLocaleDateString("pt-BR");
      } else if (typeof info.vencimento === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(info.vencimento)) {
        vencimentoFormatado = info.vencimento;
      } else if (typeof info.vencimento === 'string' && /^\d{2}\/\d{2}$/.test(info.vencimento)) {
        vencimentoFormatado = info.vencimento + "/2025";
      }

      html += `<tr>
        <td>${dataVisita}</td>
        <td>${v.usuarioNome}</td>
        <td>${v.empresaNome}</td>
        <td>${v.empresaRM}</td>
        <td>${ramo.toUpperCase()}</td>
        <td>${vencimentoFormatado}</td>
        <td>R$ ${info.premio?.toLocaleString("pt-BR") || '0,00'}</td>
        <td>${info.seguradora || '-'}</td>
        <td>${info.observacoes || '-'}</td>
      </tr>`;
    }
  });

  html += `</tbody></table>`;
  html += `<p><strong>Total de visitas listadas:</strong> ${visitas.length}</p>`;
  let totalRamos = visitas.reduce((acc, v) => acc + Object.keys(v.ramos || {}).length, 0);
  html += `<p><strong>Total de seguros mapeados:</strong> ${totalRamos}</p>`;
  listaDiv.innerHTML = html;
}

function exportarCSV() {
  let csv = ["Data;Usuário;Empresa;RM;Ramo;Vencimento;Prêmio;Seguradora;Observações"];
  dadosVisitas.forEach(v => {
    const dataVisita = v.dataObj.toLocaleDateString("pt-BR");

    for (const [ramo, info] of Object.entries(v.ramos || {})) {
      let vencimentoCSV = "-";

      if (info.vencimento?.toDate) {
        vencimentoCSV = info.vencimento.toDate().toLocaleDateString("pt-BR");
      } else if (typeof info.vencimento === 'string') {
        vencimentoCSV = info.vencimento;
      }

      const linha = [
        dataVisita,
        v.usuarioNome,
        v.empresaNome,
        v.empresaRM,
        ramo.toUpperCase(),
        vencimentoCSV,
        info.premio || 0,
        info.seguradora || '-',
        info.observacoes || '-'
      ].join(";");
      csv.push(linha);
    }
  });

  const blob = new Blob([csv.join("\n")], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "relatorio-visitas.csv";
  a.click();
}

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  carregarRelatorio();
});
