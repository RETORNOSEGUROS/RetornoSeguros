// ====== CONFIG ======
const COLLECTION = "agencias_banco"; // nome da coleção (igual ao do Firestore)
const ONLY_ADMIN_CAN_EDIT = true;     // coloque false se quiser liberar edição a todos logados
const ADMIN_EMAIL = "patrick@retornoseguros.com.br";

// ====== BOOT ======
if (!firebase.apps.length) {
  // firebase.initializeApp(...) já é feito no firebase-config.js
}

const db = firebase.firestore();
const auth = firebase.auth();

// Elements
const el = (id) => document.getElementById(id);
const tbody = el("tbodyAgencias");
const form = el("formAgencia");
const docId = el("docId");
const btnExcluir = el("btnExcluir");
const btnSalvar = el("btnSalvar");
const btnLimpar = el("btnLimpar");
const q = el("q");
const fEstado = el("fEstado");
const fAtivo = el("fAtivo");
const authInfo = el("authInfo");

let agencias = [];   // cache das agências
let userIsAdmin = false;

// ====== AUTH (mostra usuário e trava edição se não admin) ======
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    authInfo.textContent = "Não autenticado";
    if (ONLY_ADMIN_CAN_EDIT) bloquearEdicao();
    // Se quiser, redirecione para login aqui.
    return;
  }
  authInfo.textContent = `Logado: ${user.email}`;
  userIsAdmin = (!ONLY_ADMIN_CAN_EDIT) || (user.email === ADMIN_EMAIL);
  if (ONLY_ADMIN_CAN_EDIT && !userIsAdmin) bloquearEdicao();

  // iniciar listeners após auth
  listenAgencias();
});

function bloquearEdicao() {
  // Desabilita botões de editar/excluir e submit
  btnSalvar.disabled = true;
  btnExcluir.disabled = true;
  el("formHint").textContent = "Somente o administrador pode criar/editar/excluir.";
}

// ====== LISTEN REALTIME ======
let unsubscribe = null;
function listenAgencias() {
  if (unsubscribe) unsubscribe();

  unsubscribe = db.collection(COLLECTION)
    .orderBy("nome")
    .onSnapshot((snap) => {
      agencias = [];
      snap.forEach(doc => agencias.push({ id: doc.id, ...doc.data() }));
      renderEstadosSelect();
      renderLista();
    }, (err) => {
      console.error("Erro ao ouvir agências:", err);
      tbody.innerHTML = `<tr><td colspan="5" class="empty">Erro ao carregar.</td></tr>`;
    });
}

// ====== RENDER ======
function renderEstadosSelect() {
  const ufs = Array.from(new Set(agencias.map(a => (a.estado || "").toUpperCase()).filter(Boolean))).sort();
  fEstado.innerHTML = `<option value="">UF</option>` + ufs.map(uf => `<option value="${uf}">${uf}</option>`).join("");
}

function renderLista() {
  const termo = (q.value || "").toLowerCase();
  const uf = fEstado.value || "";
  const ativo = fAtivo.value;

  const rows = agencias
    .filter(a => !termo || [a.nome, a.banco, a.Cidade, a.estado].join(" ").toLowerCase().includes(termo))
    .filter(a => !uf || (String(a.estado || "").toUpperCase() === uf))
    .filter(a => !ativo || String(a.ativo) === ativo)
    .map(a => {
      const status = a.ativo ? `<span class="chip">Ativa</span>` : `<span class="chip">Inativa</span>`;
      return `
        <tr data-id="${a.id}">
          <td>${safe(a.nome)}</td>
          <td>${safe(a.banco)}</td>
          <td>${safe(a.Cidade)} / ${safe((a.estado||"").toUpperCase())}</td>
          <td>${status}</td>
          <td class="right">
            <button class="btn-sec" data-act="edit">Editar</button>
            <button class="btn-del" data-act="del">Excluir</button>
          </td>
        </tr>`;
    });

  tbody.innerHTML = rows.length ? rows.join("") : `<tr><td colspan="5" class="empty">Nenhuma agência encontrada.</td></tr>`;
}

function safe(v){ return (v === undefined || v === null) ? "" : String(v).replace(/[<>&]/g, s=>({ "<":"&lt;","&": "&amp;",">":"&gt;"}[s])); }

// ====== INTERAÇÕES TABELA ======
tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const tr = e.target.closest("tr");
  const id = tr?.dataset?.id;
  const agencia = agencias.find(a => a.id === id);
  if (!agencia) return;

  if (btn.dataset.act === "edit") {
    preencherForm(agencia);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (btn.dataset.act === "del") {
    if (!checarPermissao()) return;
    const ok = confirm(`Excluir a agência "${agencia.nome}"?`);
    if (!ok) return;
    try {
      await db.collection(COLLECTION).doc(id).delete();
      limparForm();
    } catch (err) {
      alert("Erro ao excluir: " + err.message);
    }
  }
});

// ====== FORM ======
function preencherForm(a) {
  el("formTitle").textContent = "Editar Agência";
  docId.value = a.id;
  el("nome").value = a.nome || "";
  el("banco").value = a.banco || "";
  el("Cidade").value = a.Cidade || "";
  el("estado").value = a.estado || "";
  el("ativo").value = String(!!a.ativo);
  btnExcluir.style.display = userIsAdmin ? "inline-block" : "none";
}

function limparForm() {
  el("formTitle").textContent = "Nova Agência";
  form.reset();
  docId.value = "";
  el("ativo").value = "true";
  btnExcluir.style.display = "none";
}

btnLimpar.addEventListener("click", limparForm);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!checarPermissao()) return;

  const data = {
    nome: el("nome").value.trim(),
    banco: el("banco").value.trim(),
    Cidade: el("Cidade").value.trim(),
    estado: el("estado").value.trim().toUpperCase(),
    ativo: el("ativo").value === "true",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (!data.nome || !data.banco || !data.Cidade || !data.estado) {
    alert("Preencha todos os campos.");
    return;
  }

  try {
    const id = docId.value;
    if (id) {
      await db.collection(COLLECTION).doc(id).update(data);
    } else {
      await db.collection(COLLECTION).add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    limparForm();
  } catch (err) {
    alert("Erro ao salvar: " + err.message);
  }
});

btnExcluir.addEventListener("click", async () => {
  if (!checarPermissao()) return;
  const id = docId.value;
  if (!id) return;
  const ok = confirm("Confirmar exclusão desta agência?");
  if (!ok) return;
  try {
    await db.collection(COLLECTION).doc(id).delete();
    limparForm();
  } catch (err) {
    alert("Erro ao excluir: " + err.message);
  }
});

// ====== BUSCA / FILTROS / EXPORT ======
[q, fEstado, fAtivo].forEach(inp => inp.addEventListener("input", renderLista));

document.getElementById("btnExportar").addEventListener("click", () => {
  if (!agencias.length) return alert("Não há dados para exportar.");
  const filtroAtual = obterListaFiltrada();
  const header = ["id","nome","banco","Cidade","estado","ativo"];
  const lines = [header.join(",")].concat(
    filtroAtual.map(a => [a.id, a.nome, a.banco, a.Cidade, a.estado, a.ativo].map(csvSafe).join(","))
  );
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "agencias.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

function obterListaFiltrada() {
  const termo = (q.value || "").toLowerCase();
  const uf = fEstado.value || "";
  const ativo = fAtivo.value;
  return agencias
    .filter(a => !termo || [a.nome, a.banco, a.Cidade, a.estado].join(" ").toLowerCase().includes(termo))
    .filter(a => !uf || (String(a.estado || "").toUpperCase() === uf))
    .filter(a => !ativo || String(a.ativo) === ativo);
}

function csvSafe(v) {
  const s = (v === undefined || v === null) ? "" : String(v);
  return `"${s.replace(/"/g,'""')}"`;
}

// ====== PERMISSÃO ======
function checarPermissao() {
  if (ONLY_ADMIN_CAN_EDIT && !userIsAdmin) {
    alert("Somente o administrador pode criar/editar/excluir.");
    return false;
  }
  return true;
}
