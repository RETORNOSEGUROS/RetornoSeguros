// Evita reinit se firebase-config já iniciou
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let empresasCache = [];
let isAdmin = false;

window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async user => {
    if (!user) return (window.location.href = "login.html");

    usuarioAtual = user;
    isAdmin = user.email === "patrick@retornoseguros.com.br";

    await carregarEmpresas();
    await carregarRamos();
    await carregarRM();
    await carregarStatus();

    carregarCotacoesComFiltros();

    // botão de salvar só para admin
    const btn = document.getElementById("btnSalvarAlteracoes");
    if (btn && !isAdmin) btn.style.display = "none";
  });
});

/* ---------- Loaders ---------- */

async function carregarEmpresas() {
  const campos = ["empresa", "novaEmpresa"];
  empresasCache = [];

  const snap = await db.collection("empresas").get();

  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Selecione a empresa</option>`;
  });

  snap.forEach(doc => {
    const dados = doc.data();
    empresasCache.push({ id: doc.id, ...dados });
    campos.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = dados.nome;
      el.appendChild(opt);
    });
  });
}

async function carregarRamos() {
  const campos = ["ramo", "novaRamo"];
  const snap = await db.collection("ramos-seguro").orderBy("ordem").get();

  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Selecione o ramo</option>`;
  });

  snap.forEach(doc => {
    const nome = doc.data().nomeExibicao || doc.id;
    campos.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      el.appendChild(opt);
    });
  });
}

async function carregarRM() {
  const select = document.getElementById("filtroRM");
  if (!select) return;
  select.innerHTML = `<option value="">Todos</option>`;
  const snap = await db.collection("cotacoes-gerentes").get();
  const nomes = new Set();
  snap.forEach(doc => {
    const nome = doc.data().rmNome;
    if (nome && !nomes.has(nome)) {
      nomes.add(nome);
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    }
  });
}

async function carregarStatus() {
  const select = document.getElementById("filtroStatus");
  if (!select) return;
  select.innerHTML = `<option value="">Todos</option>`;
  const snap = await db.doc("status-negociacao/config").get();
  const status = snap.data()?.statusFinais || [];
  status.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
}

/* ---------- Helpers de preenchimento ---------- */

function preencherEmpresaNova() {
  const id = document.getElementById("novaEmpresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  document.getElementById("nova-info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "";
  document.getElementById("nova-info-rm").textContent = empresa ? `RM responsável: ${empresa.rm || "-"}` : "";
}

function preencherEmpresa() {
  const id = document.getElementById("empresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  document.getElementById("info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "";
  document.getElementById("info-rm").textContent = empresa ? `RM responsável: ${empresa.rm || "-"}` : "";
}

/* ---------- CRUD ---------- */

async function criarNovaCotacao() {
  const empresaId = document.getElementById("novaEmpresa").value;
  const ramo = document.getElementById("novaRamo").value;
  const valorFmt = document.getElementById("novaValor").value;
  const valor = desformatarMoeda(valorFmt); // <<< importante
  const obs = document.getElementById("novaObservacoes").value.trim();
  const empresa = empresasCache.find(e => e.id === empresaId);

  if (!empresaId || !ramo || !empresa) return alert("Preencha todos os campos.");

  const cotacao = {
    empresaId,
    empresaNome: empresa.nome,
    empresaCNPJ: empresa.cnpj || "",
    rmId: empresa.rmId || "",
    rmNome: empresa.rm || "",
    ramo,
    valorDesejado: valor,
    status: "Negócio iniciado",
    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPorUid: usuarioAtual.uid,
    autorUid: usuarioAtual.uid,
    autorNome: usuarioAtual.email,
    interacoes: obs
      ? [
          {
            autorUid: usuarioAtual.uid,
            autorNome: usuarioAtual.email,
            mensagem: obs,
            dataHora: new Date(),
            tipo: "observacao",
          },
        ]
      : [],
  };

  await db.collection("cotacoes-gerentes").add(cotacao);
  alert("Cotação criada com sucesso.");
  carregarCotacoesComFiltros();

  // limpa
  document.getElementById("novaEmpresa").value = "";
  document.getElementById("novaRamo").value = "";
  document.getElementById("novaValor").value = "R$ 0,00";
  document.getElementById("novaObservacoes").value = "";
  preencherEmpresaNova();
}

function carregarCotacoesComFiltros() {
  const lista = document.getElementById("listaCotacoes");
  if (!lista) return;
  lista.innerHTML = "Carregando...";

  let query = db.collection("cotacoes-gerentes");
  if (!isAdmin) query = query.where("criadoPorUid", "==", usuarioAtual.uid);

  query.get().then(snapshot => {
    let cotacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const ini = document.getElementById("filtroDataInicio").value;
    const fim = document.getElementById("filtroDataFim").value;
    const rm = document.getElementById("filtroRM").value;
    const status = document.getElementById("filtroStatus").value;

    cotacoes = cotacoes.filter(c => {
      const d = c.dataCriacao?.toDate?.();
      if (ini && d && d < new Date(ini)) return false;
      if (fim && d && d > new Date(fim + "T23:59:59")) return false;
      if (rm && c.rmNome !== rm) return false;
      if (status && c.status !== status) return false;
      return true;
    });

    if (!cotacoes.length) {
      lista.innerHTML = `<p class="muted">Nenhuma cotação encontrada.</p>`;
      return;
    }

    let html =
      `<table><thead><tr>
        <th>Empresa</th><th>Ramo</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th>
      </tr></thead><tbody>`;

    cotacoes.forEach(c => {
      const valor =
        typeof c.valorDesejado === "number"
          ? c.valorDesejado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "-";
      const data = c.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";

      html += `<tr>
        <td data-label="Empresa">${c.empresaNome || "-"}</td>
        <td data-label="Ramo">${c.ramo || "-"}</td>
        <td data-label="Valor">${valor}</td>
        <td data-label="Status">${c.status || "-"}</td>
        <td data-label="Data">${data}</td>
        <td data-label="Ações">
          <a href="chat-cotacao.html?id=${c.id}" target="_blank">Abrir</a>
          ${isAdmin ? ` | <a href="#" onclick="editarCotacao('${c.id}')">Editar</a>
          | <a href="#" onclick="excluirCotacao('${c.id}')" style="color:#c00">Excluir</a>` : ""}
        </td>
      </tr>`;
    });

    html += `</tbody></table>`;
    lista.innerHTML = html;
  });
}

function editarCotacao(id) {
  db.collection("cotacoes-gerentes").doc(id).get().then(doc => {
    if (!doc.exists) return alert("Cotação não encontrada");
    const c = doc.data();

    document.getElementById("cotacaoId").value = id;
    document.getElementById("empresa").value = c.empresaId || "";
    document.getElementById("ramo").value = c.ramo || "";

    // exibe formatado
    const inputValor = document.getElementById("valorEstimado");
    const num = typeof c.valorDesejado === "number" ? c.valorDesejado : 0;
    inputValor.value = "R$ " + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    document.getElementById("observacoes").value = c.interacoes?.[0]?.mensagem || "";

    preencherEmpresa();
    document.getElementById("bloco-edicao").style.display = "block";
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
}

async function salvarAlteracoesCotacao() {
  const id = document.getElementById("cotacaoId").value;
  const empresaId = document.getElementById("empresa").value;
  const ramo = document.getElementById("ramo").value;
  const valorFmt = document.getElementById("valorEstimado").value;
  const valor = desformatarMoeda(valorFmt); // <<< importante
  const obs = document.getElementById("observacoes").value.trim();

  const empresa = empresasCache.find(e => e.id === empresaId);
  if (!empresa) return alert("Empresa inválida.");

  const update = {
    empresaId,
    empresaNome: empresa.nome,
    empresaCNPJ: empresa.cnpj || "",
    rmId: empresa.rmId || "",
    rmNome: empresa.rm || "",
    ramo,
    valorDesejado: valor,
  };

  if (obs) {
    update.interacoes = [
      {
        autorUid: usuarioAtual.uid,
        autorNome: usuarioAtual.email,
        dataHora: new Date(),
        mensagem: obs,
        tipo: "observacao",
      },
    ];
  }

  await db.collection("cotacoes-gerentes").doc(id).update(update);
  alert("Alterações salvas.");
  document.getElementById("bloco-edicao").style.display = "none";
  carregarCotacoesComFiltros();
}

function excluirCotacao(id) {
  if (!confirm("Tem certeza que deseja excluir esta cotação? Essa ação não poderá ser desfeita.")) return;
  db.collection("cotacoes-gerentes").doc(id).delete()
    .then(() => {
      alert("Cotação excluída com sucesso.");
      carregarCotacoesComFiltros();
    })
    .catch(err => {
      console.error("Erro ao excluir cotação:", err);
      alert("Erro ao excluir cotação.");
    });
}

/* ---------- Utilidades ---------- */
function limparFiltros(){
  ["filtroDataInicio","filtroDataFim","filtroRM","filtroStatus"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value="";
  });
  carregarCotacoesComFiltros();
}

/* ---------- Exports p/ onclick no HTML ---------- */
window.preencherEmpresa = preencherEmpresa;
window.preencherEmpresaNova = preencherEmpresaNova;
window.criarNovaCotacao = criarNovaCotacao;
window.carregarCotacoesComFiltros = carregarCotacoesComFiltros;
window.editarCotacao = editarCotacao;
window.salvarAlteracoesCotacao = salvarAlteracoesCotacao;
window.excluirCotacao = excluirCotacao;
window.limparFiltros = limparFiltros;
