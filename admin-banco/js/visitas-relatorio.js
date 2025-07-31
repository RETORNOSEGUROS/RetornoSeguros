
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const lista = document.getElementById("lista-visitas");

let visitasFiltradas = [];

async function carregarVisitas() {
  try {
    const snapshot = await db.collection("visitas").orderBy("data", "desc").get();
    const empresas = {};
    const usuarios = {};

    visitasFiltradas = [];

    for (const doc of snapshot.docs) {
      const visita = doc.data();
      visita.id = doc.id;

      // Buscar nome da empresa
      let nomeEmpresa = empresas[visita.empresaId];
      if (!nomeEmpresa) {
        const empresaDoc = await db.collection("empresas").doc(visita.empresaId).get();
        nomeEmpresa = empresaDoc.exists ? empresaDoc.data().nome : `[empresa removida: ${visita.empresaId}]`;
        empresas[visita.empresaId] = nomeEmpresa;
        visita.rmEmpresa = empresaDoc.exists ? empresaDoc.data().rm || "-" : "-";
      }

      visita.empresaNome = nomeEmpresa;

      // Buscar nome do usuário
      let nomeUsuario = usuarios[visita.usuarioId];
      if (!nomeUsuario) {
        const usuarioDoc = await db.collection("usuarios_banco").doc(visita.usuarioId).get();
        nomeUsuario = usuarioDoc.exists ? usuarioDoc.data().nome : `[usuário removido: ${visita.usuarioId}]`;
        usuarios[visita.usuarioId] = nomeUsuario;
      }

      visita.usuarioNome = nomeUsuario;

      visitasFiltradas.push(visita);
    }

    aplicarFiltros(); // Mostra tudo inicialmente

  } catch (err) {
    console.error("Erro ao carregar visitas:", err);
    lista.innerHTML = "<p>Erro ao carregar visitas.</p>";
  }
}

function aplicarFiltros() {
  const empresaFiltro = document.getElementById("filtroEmpresa").value.toLowerCase();
  const usuarioFiltro = document.getElementById("filtroUsuario").value.toLowerCase();
  const dataInicio = document.getElementById("filtroDataInicio").value;
  const dataFim = document.getElementById("filtroDataFim").value;

  const filtradas = visitasFiltradas.filter(visita => {
    const nomeEmpresa = (visita.empresaNome || "").toLowerCase();
    const nomeUsuario = (visita.usuarioNome || "").toLowerCase();

    let passaFiltro = true;

    if (empresaFiltro && !nomeEmpresa.includes(empresaFiltro)) return false;
    if (usuarioFiltro && !nomeUsuario.includes(usuarioFiltro)) return false;

    if (dataInicio) {
      const inicio = new Date(dataInicio + "T00:00:00");
      if (visita.data?.toDate() < inicio) return false;
    }

    if (dataFim) {
      const fim = new Date(dataFim + "T23:59:59");
      if (visita.data?.toDate() > fim) return false;
    }

    return passaFiltro;
  });

  renderizarTabela(filtradas);
}

function renderizarTabela(visitas) {
  if (visitas.length === 0) {
    lista.innerHTML = "<p>Nenhuma visita encontrada.</p>";
    return;
  }

  let html = `
    <p><strong>Total de visitas:</strong> ${visitas.length}</p>
  `;

  let totalRamos = 0;

  html += `<table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Empresa</th>
        <th>RM da Empresa</th>
        <th>Usuário</th>
        <th>Ramo</th>
        <th>Vencimento</th>
        <th>Prêmio (R$)</th>
        <th>Seguradora</th>
        <th>Observações</th>
      </tr>
    </thead>
    <tbody>
  `;

  visitas.forEach(visita => {
    const dataVisita = visita.data?.toDate().toLocaleDateString("pt-BR") || "-";
    const empresa = visita.empresaNome || "-";
    const usuario = visita.usuarioNome || "-";
    const rm = visita.rmEmpresa || "-";

    for (const [ramoKey, info] of Object.entries(visita.ramos || {})) {
      totalRamos++;
      html += `
        <tr>
          <td>${dataVisita}</td>
          <td>${empresa}</td>
          <td>${rm}</td>
          <td>${usuario}</td>
          <td>${ramoKey}</td>
          <td>${info.vencimento || "-"}</td>
          <td>${(info.premio || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
          <td>${info.seguradora || "-"}</td>
          <td>${info.observacoes || "-"}</td>
        </tr>
      `;
    }
  });

  html += `
    </tbody>
  </table>
  <p><strong>Total de seguros mapeados:</strong> ${totalRamos}</p>
  `;

  html += `<button onclick="exportarCSV()">📥 Exportar Excel</button>`;

  lista.innerHTML = html;
}

function exportarCSV() {
  const rows = [["Data", "Empresa", "RM", "Usuário", "Ramo", "Vencimento", "Prêmio", "Seguradora", "Observações"]];
  visitasFiltradas.forEach(visita => {
    const dataVisita = visita.data?.toDate().toLocaleDateString("pt-BR") || "-";
    const empresa = visita.empresaNome || "-";
    const usuario = visita.usuarioNome || "-";
    const rm = visita.rmEmpresa || "-";

    for (const [ramoKey, info] of Object.entries(visita.ramos || {})) {
      rows.push([
        dataVisita,
        empresa,
        rm,
        usuario,
        ramoKey,
        info.vencimento || "-",
        info.premio || 0,
        info.seguradora || "-",
        info.observacoes || "-"
      ]);
    }
  });

  let csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(";")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "relatorio-visitas.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

window.addEventListener("DOMContentLoaded", () => {
  carregarVisitas();

  document.getElementById("btnAplicarFiltros").addEventListener("click", aplicarFiltros);
});
