/* Inicialização Firebase */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* Estado local */
let agenciasMap   = {};
let perfilAtual   = null;
let minhaAgencia  = null;
let meuNome       = null;
let isAdmin       = false;

/* Utils DOM */
const $  = (id) => document.getElementById(id);
const setStatus = (msg) => { const el=$('statusLista'); if(el) el.textContent = msg || ''; };

/* Fluxo de autenticação */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    alert("Faça login para continuar.");
    return (window.location.href = "login.html");
  }

  // Admin por e-mail
  isAdmin = (user.email === "patrick@retornoseguros.com.br");

  // Perfil do usuário logado
  try {
    const snap = await db.collection("usuarios_banco").doc(user.uid).get();
    const p = snap.exists ? (snap.data() || {}) : {};
    perfilAtual   = p.perfil || "";
    minhaAgencia  = p.agenciaId || "";
    meuNome       = p.nome || "";       // usado p/ filtrar RM pelas próprias empresas
  } catch(e) {
    console.error("Erro ao carregar perfil:", e);
  }

  await carregarAgencias();
  await carregarRMs();

  // Filtro: se não for admin, travamos na própria agência
  const filtroSel = $('filtroAgencia');
  if (!isAdmin && minhaAgencia) {
    filtroSel.value = minhaAgencia;
    filtroSel.disabled = true;
  }

  await carregarEmpresas();
});

/* Carrega agências (form + filtro) */
async function carregarAgencias() {
  agenciasMap = {};
  const selForm   = $('agenciaId');
  const selFiltro = $('filtroAgencia');

  selForm.innerHTML   = '<option value="">Selecione uma agência</option>';
  selFiltro.innerHTML = '<option value="">Minha agência</option>';

  const snap = await db.collection("agencias_banco")
                       .orderBy(firebase.firestore.FieldPath.documentId())
                       .get();

  snap.forEach((doc) => {
    const ag = doc.data() || {};
    const id = doc.id;
    agenciasMap[id] = ag.nome || id;

    const optForm   = document.createElement("option");
    optForm.value   = id;
    optForm.textContent = `${id} - ${agenciasMap[id]}`;
    selForm.appendChild(optForm);

    const optFiltro = document.createElement("option");
    optFiltro.value = id;
    optFiltro.textContent = `${id} - ${agenciasMap[id]}`;
    selFiltro.appendChild(optFiltro);
  });

  // Default do formulário = minha agência
  if (minhaAgencia && selForm.querySelector(`option[value="${minhaAgencia}"]`)) {
    selForm.value = minhaAgencia;
  }
}

/* Quando mudar a agência no formulário, recarrega RMs dessa agência */
function onAgenciaChangeForm() { carregarRMs(); }

/* Carrega RMs da agência selecionada (ou da agência do usuário) */
async function carregarRMs() {
  const selectRM = $('rm');
  if (!selectRM) return;
  selectRM.innerHTML = '<option value="">Selecione um RM</option>';

  const agenciaEscolhida = $('agenciaId').value || minhaAgencia;

  try {
    let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
    if (agenciaEscolhida) q = q.where("agenciaId", "==", agenciaEscolhida);

    const snapshot = await q.get();
    snapshot.forEach((doc) => {
      const u = doc.data() || {};
      const opt = document.createElement("option");
      // Mantém value = nome (compatível com seu modelo atual)
      opt.value = u.nome;
      opt.textContent = `${u.nome} (${u.agenciaId || "-"})`;
      selectRM.appendChild(opt);
    });
  } catch (e) {
    console.error("Erro ao carregar RMs:", e);
  }
}

/* CRUD Empresa */
async function salvarEmpresa() {
  const nome      = $('nome').value.trim();
  const cnpj      = $('cnpj').value.trim();
  const cidade    = $('cidade').value.trim();
  const estado    = $('estado').value.trim();
  const agenciaId = $('agenciaId').value.trim();
  const rm        = $('rm').value;
  const empresaId = $('empresaIdEditando').value;

  if (!nome || !cidade || !estado || !agenciaId || !rm) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const dados = { nome, cnpj, cidade, estado, agenciaId, rm };

  try {
    if (empresaId) {
      await db.collection("empresas").doc(empresaId).update(dados);
      alert("Empresa atualizada com sucesso.");
    } else {
      const user = auth.currentUser;
      if (!user) return alert("Usuário não autenticado.");
      dados.criadoEm     = firebase.firestore.Timestamp.now();
      dados.criadoPorUid = user.uid;
      await db.collection("empresas").add(dados);
      alert("Empresa cadastrada com sucesso.");
    }
    limparFormulario();
    await carregarEmpresas();
  } catch (e) {
    console.error("Erro ao salvar empresa:", e);
    alert("Erro ao salvar empresa.");
  }
}

/* Lista empresas com as REGRAS de visibilidade por perfil */
async function carregarEmpresas() {
  // Admin pode escolher qualquer agência; demais ficam fixos na própria
  const filtroValor   = $('filtroAgencia').value;
  const agenciaFiltro = isAdmin ? (filtroValor || "") : (minhaAgencia || "");

  setStatus("Carregando...");

  try {
    let q = db.collection("empresas");

    // 1) Escopo por agência (admin opcional; demais obrigatório)
    if (agenciaFiltro) q = q.where("agenciaId", "==", agenciaFiltro);

    // 2) RM vê SOMENTE as próprias empresas (campo rm = nome do usuário)
    if (!isAdmin && perfilAtual === "rm" && meuNome) {
      q = q.where("rm", "==", meuNome);
    }
    // Assistente e Gerente Chefe: sem filtro adicional de RM (veem toda a agência)

    // orderBy com fallback (índice)
    let snapshot;
    try {
      snapshot = await q.orderBy("nome").get();
    } catch (err) {
      console.warn("Possível índice ausente, tentando sem orderBy. Detalhe:", err);
      snapshot = await q.get();
    }

    const tbodyWrap = $('listaEmpresas');
    const rows = [];

    if (snapshot.empty) {
      setStatus("Nenhuma empresa encontrada para o filtro aplicado.");
      tbodyWrap.innerHTML = renderTabela([]);
      return;
    }

    const docs = snapshot.docs.slice().sort((a,b) => {
      const na = (a.data().nome || "").toLowerCase();
      const nb = (b.data().nome || "").toLowerCase();
      return na.localeCompare(nb);
    });

    docs.forEach((doc) => {
      const e = doc.data() || {};
      const agLabel = e.agenciaId ? `${e.agenciaId} - ${agenciasMap[e.agenciaId] || ""}` : "-";
      rows.push({
        id: doc.id,
        nome: e.nome || "-",
        cidade: e.cidade || "-",
        estado: e.estado || "-",
        agencia: agLabel,
        rm: e.rm || "-"
      });
    });

    tbodyWrap.innerHTML = renderTabela(rows);
    setStatus(`${rows.length} empresa(s) listada(s).`);
  } catch (e) {
    console.error("Erro ao carregar empresas:", e);
    setStatus("Erro ao carregar empresas. Verifique o console.");
  }
}

/* Renderização da tabela (mantém visual responsivo) */
function renderTabela(items){
  let html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Cidade</th>
            <th>Estado</th>
            <th>Agência</th>
            <th>RM</th>
            <th style="width:120px">Ações</th>
          </tr>
        </thead>
        <tbody>
  `;
  items.forEach(e => {
    html += `
      <tr>
        <td>${e.nome}</td>
        <td>${e.cidade}</td>
        <td>${e.estado}</td>
        <td>${e.agencia}</td>
        <td>${e.rm}</td>
        <td><button class="btn btn-sm" onclick="editarEmpresa('${e.id}')">Editar</button></td>
      </tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

/* Ações da tabela */
async function editarEmpresa(id) {
  try {
    const snap = await db.collection("empresas").doc(id).get();
    if (!snap.exists) return;

    const e = snap.data() || {};

    $('empresaIdEditando').value = id;
    $('nome').value      = e.nome || "";
    $('cnpj').value      = e.cnpj || "";
    $('cidade').value    = e.cidade || "";
    $('estado').value    = e.estado || "";
    $('agenciaId').value = e.agenciaId || "";

    await carregarRMs();
    $('rm').value        = e.rm || "";

    $('tituloFormulario').textContent = "Editar Empresa";
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    console.error("Erro ao editar:", e);
  }
}

/* Helpers UI */
function limparFormulario() {
  $('empresaIdEditando').value = "";
  $('nome').value   = "";
  $('cnpj').value   = "";
  $('cidade').value = "";
  $('estado').value = "";
  $('agenciaId').value = minhaAgencia || "";
  $('rm').value     = "";
  $('tituloFormulario').textContent = "Cadastrar Nova Empresa";
}
function limparFiltro() {
  const sel = $('filtroAgencia');
  if (!isAdmin && minhaAgencia) {
    sel.value = minhaAgencia;
  } else {
    sel.value = "";
  }
  carregarEmpresas();
}
function onFiltroAgenciaChange() { carregarEmpresas(); }

/* Expor funções usadas no HTML */
window.onAgenciaChangeForm   = onAgenciaChangeForm;
window.salvarEmpresa         = salvarEmpresa;
window.editarEmpresa         = editarEmpresa;
window.limparFiltro          = limparFiltro;
window.onFiltroAgenciaChange = onFiltroAgenciaChange;
