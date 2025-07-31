firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const listaDiv = document.getElementById("lista-visitas");

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
          empresas[v.empresaId] = emp.exists ? emp.data().nome : `[empresa removida: ${v.empresaId}]`;
        }
      } catch (e) {
        empresas[v.empresaId] = `[erro empresa: ${v.empresaId}]`;
      }

      try {
        if (!usuarios[v.usuarioId]) {
          const user = await db.collection("usuarios_banco").doc(v.usuarioId).get();
          usuarios[v.usuarioId] = user.exists ? user.data().nome || user.data().email : `[usuário removido: ${v.usuarioId}]`;
        }
      } catch (e) {
        usuarios[v.usuarioId] = `[erro usuario: ${v.usuarioId}]`;
      }

      return v;
    }));

    let html = `<table><thead><tr>
      <th>Data</th>
      <th>Usuário</th>
      <th>Empresa</th>
      <th>Ramos / Seguros Mapeados</th>
    </tr></thead><tbody>`;

    for (const v of visitas) {
      html += `<tr>
        <td>${v.dataObj.toLocaleDateString("pt-BR")}</td>
        <td>${usuarios[v.usuarioId]}</td>
        <td>${empresas[v.empresaId]}</td>
        <td>`;

      for (const [ramo, info] of Object.entries(v.ramos || {})) {
        html += `<div class="subdados">
          <strong>${ramo.toUpperCase()}</strong><br>
          Vencimento: ${info.vencimento || '-'} | Prêmio: R$ ${info.premio?.toLocaleString("pt-BR") || '0,00'}<br>
          Seguradora: ${info.seguradora || '-'}<br>
          ${info.observacoes ? `<div class='obs-box'>${info.observacoes}</div>` : ''}
        </div>`;
      }

      html += `</td></tr>`;
    }

    html += `</tbody></table>`;
    listaDiv.innerHTML = html;

  } catch (err) {
    console.error("Erro ao carregar visitas:", err);
    listaDiv.innerHTML = "Erro ao carregar visitas.";
  }
}

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  carregarRelatorio();
});
