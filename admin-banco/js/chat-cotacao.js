// Evita reinit se firebase-config já iniciou
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let empresasCache = [];
let isAdmin = false;
let configStatus = null;

// ====== STATUS FIXOS (mesmo conjunto do chat-cotacao) ======
const STATUS_FIXOS = [
  "Negócio Emitido",
  "Pendente Agência",
  "Pendente Corretor",
  "Pendente Seguradora",
  "Pendente Cliente",
  "Recusado Cliente",
  "Recusado Seguradora",
  "Emitido Declinado",
  "Em Emissão",
  "Negócio Fechado"
];

window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async user => {
    if (!user) return (window.location.href = "login.html");
    usuarioAtual = user;
    isAdmin = user.email === "patrick@retornoseguros.com.br";

    try {
      await Promise.all([
        carregarEmpresas(),
        carregarRamos(),
        carregarRM(),
        carregarStatus(), // <<< popula o filtroStatus com fixos + firestore
      ]);
    } catch (e) {
      console.error("Erro inicial:", e);
    }

    carregarCotacoesComFiltros();

    // botão de salvar no editor só para admin
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
  let snap;
  try {
    snap = await db.collection("ramos-seguro").orderBy("ordem").get();
  } catch {
    snap = await db.collection("ramos-seguro").get();
  }

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

  try {
    let q = db.collection("cotacoes-gerentes");
    if (!isAdmin) q = q.where("criadoPorUid", "==", usuarioAtual.uid);

    const snap = await q.get();
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
  } catch (err) {
    console.error("Erro ao carregar RM:", err);
  }
}

async function carregarStatus() {
  const select = document.getElementById("filtroStatus");
  if (!select) return;

  try {
    const snap = await db.collection("status-negociacao").doc("config").get();
    configStatus = snap.exists ? (snap.data() || {}) : {};
  } catch (err) {
    console.warn("Falha ao ler status-negociacao/config. Usando apenas os fixos.", err);
    configStatus = {};
  }

  const fromCfg = Array.isArray(configStatus.statusFinais) ? configStatus.statusFinais : [];
  const set = new Set([...STATUS_FIXOS, ...fromCfg]);
  const lista = Array.from(set);

  select.innerHTML = `<option value="">Todos</option>`;
  lista.forEach(s => {
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
  setText("nova-info-cnpj", empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "");
  setText("nova-info-rm", empresa ? `RM responsável: ${empresa.rm || "-"}` : "");
}

function preencherEmpresa() {
  const id = document.getElementById("empresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  setText("info-cnpj", empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "");
  setText("info-rm", empresa ? `RM responsável: ${empresa.rm || "-"}` : "");
}

/* ---------- CRUD ---------- */

async function criarNovaCotacao() {
  const empresaId = document.getElementById("novaEmpresa").value;
  const ramo = document.getElementById("novaRamo").value;
  const valorFmt = document.getElementById("novaValor").value;
  const valor = desformatarMoeda(valorFmt);
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
    status: "Pendente Corretor", // status inicial (ajuste se preferir)
    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPorUid: usuarioAtual.uid,
    autorUid: usuarioAtual.uid,
    autorNome: usuarioAtual.email,
    interacoes: obs
      ? [{
          autorUid: usuarioAtual.uid,
          autorNome: usuarioAtual.email,
          mensagem: obs,
          dataHora: new Date(),
          tipo: "observacao",
        }]
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

  query.get()
    .then(snapshot => {
      let cotacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const ini = document.getElementById("filtroDataInicio").value;
      const fim = document.getElementById("filtroDataFim").value;
      const rm = document.getElementById("filtroRM").value;
      const status = document.getElementById("filtroStatus").value;

      cotacoes = cotacoes.filter(c => {
        const d = c.dataCriacao?.toDate?.() ||
                  (typeof c.dataCriacao === "string" ? new Date(c.dataCriacao) : null);
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

      let html = `<table><thead><tr>
        <th>Empresa</th><th>Ramo</th><th>Valor</th><th>Status</th><th>Vigência</th><th>Criada em</th><th>Ações</th>
      </tr></thead><tbody>`;

      cotacoes.forEach(c => {
        const valor = typeof c.valorDesejado === "number"
          ? c.valorDesejado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "-";

        const dataCriacao = (c.dataCriacao?.toDate?.()?.toLocaleDateString("pt-BR"))
          || (typeof c.dataCriacao === "string" ? new Date(c.dataCriacao).toLocaleDateString("pt-BR") : "-");

        // Vigência: se status Negócio Emitido e houverem os campos
        const vigIni = c.inicioVigencia?.toDate?.();
        const vigFim = c.fimVigencia?.toDate?.();
        const vigencia = (vigIni && vigFim)
          ? `${vigIni.toLocaleDateString("pt-BR")} a ${vigFim.toLocaleDateString("pt-BR")}`
          : "-";

        html += `<tr>
          <td data-label="Empresa">${c.empresaNome || "-"}</td>
          <td data-label="Ramo">${c.ramo || "-"}</td>
          <td data-label="Valor">${valor}</td>
          <td data-label="Status">${c.status || "-"}</td>
          <td data-label="Vigência">${c.status === "Negócio Emitido" ? vigencia : "-"}</td>
          <td data-label="Criada em">${dataCriacao}</td>
          <td data-label="Ações">
            <a href="chat-cotacao.html?id=${c.id}" target="_blank">Abrir</a>
            ${isAdmin ? ` | <a href="#" onclick="editarCotacao('${c.id}')">Editar</a>
            | <a href="#" onclick="excluirCotacao('${c.id}')" style="color:#c00">Excluir</a>` : ""}
          </td>
        </tr>`;
      });

      html += `</tbody></table>`;
      lista.innerHTML = html;
    })
    .catch(err => {
      console.error("Erro ao carregar cotações:", err);
      lista.innerHTML = `<p class="muted">Sem permissão para carregar as cotações ou erro de rede. Verifique as regras e o login.</p>`;
    });
}

function editarCotacao(id) {
  db.collection("cotacoes-gerentes").doc(id).get().then(doc => {
    if (!doc.exists) return alert("Cotação não encontrada");
    const c = doc.data();

    document.getElementById("cotacaoId").value = id;
    document.getElementById("empresa").value = c.empresaId || "";
    document.getElementById("ramo").value = c.ramo || "";

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
  const valor = desformatarMoeda(valorFmt);
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
    update.interacoes = [{
      autorUid: usuarioAtual.uid,
      autorNome: usuarioAtual.email,
      dataHora: new Date(),
      mensagem: obs,
      tipo: "observacao",
    }];
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
function setText(id, txt){ const el=document.getElementById(id); if(el) el.textContent = txt ?? ""; }

function limparFiltros(){
  ["filtroDataInicio","filtroDataFim","filtroRM","filtroStatus"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value="";
  });
  carregarCotacoesComFiltros();
}

// máscara de moeda
function formatarMoeda(input){
  let v = (input.value || '').replace(/\D/g,'');
  if(!v) { input.value = 'R$ 0,00'; return; }
  v = (parseInt(v,10)/100).toFixed(2).replace('.',',');
  v = v.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  input.value = 'R$ ' + v;
}
function desformatarMoeda(str){
  if(!str) return 0;
  return parseFloat(str.replace(/[^\d]/g,'')/100);
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
