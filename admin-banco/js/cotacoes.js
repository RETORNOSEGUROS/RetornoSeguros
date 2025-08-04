// Firebase inicial
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let empresasCache = [];
let isAdmin = false;

window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async user => {
    if (!user) return window.location.href = "login.html";

    usuarioAtual = user;
    isAdmin = user.email === "patrick@retornoseguros.com.br";
    console.log("Logado como:", user.email);

    await Promise.all([
      carregarEmpresas(),
      carregarRamosSeguro(),
      carregarRM(),
      carregarStatus()
    ]);

    carregarCotacoesComFiltros();
  });
});

async function carregarEmpresas() {
  const select = document.getElementById("empresa");
  const novaSelect = document.getElementById("novaEmpresa");
  const selects = [select, novaSelect];
  for (const s of selects) s.innerHTML = `<option value="">Carregando...</option>`;

  try {
    const snapshot = await db.collection("empresas").get();
    empresasCache = [];
    for (const s of selects) s.innerHTML = `<option value="">Selecione a empresa</option>`;

    snapshot.forEach(doc => {
      const d = doc.data();
      empresasCache.push({ id: doc.id, ...d });
      selects.forEach(s => {
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = d.nome;
        s.appendChild(opt);
      });
    });
  } catch (err) {
    console.error("Erro ao carregar empresas:", err);
  }
}

async function carregarRamosSeguro() {
  const select = document.getElementById("ramo");
  const novaSelect = document.getElementById("novaRamo");
  const selects = [select, novaSelect];
  for (const s of selects) s.innerHTML = `<option value="">Carregando...</option>`;

  try {
    const snapshot = await db.collection("ramos-seguro").orderBy("ordem").get();
    for (const s of selects) s.innerHTML = `<option value="">Selecione o ramo</option>`;
    snapshot.forEach(doc => {
      const d = doc.data();
      selects.forEach(s => {
        const opt = document.createElement("option");
        opt.value = d.nomeExibicao;
        opt.textContent = d.nomeExibicao;
        s.appendChild(opt);
      });
    });
  } catch (err) {
    console.error("Erro ao carregar ramos:", err);
  }
}

async function carregarRM() {
  const select = document.getElementById("filtroRM");
  const snapshot = await db.collection("cotacoes-gerentes").get();
  const nomesUnicos = new Set();
  snapshot.forEach(doc => {
    const nome = doc.data().rmNome;
    if (nome && !nomesUnicos.has(nome)) {
      nomesUnicos.add(nome);
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    }
  });
}

async function carregarStatus() {
  const select = document.getElementById("filtroStatus");
  const snap = await db.doc("status-negociacao/config").get();
  const status = snap.data()?.statusFinais || [];
  select.innerHTML = `<option value="">Todos</option>`;
  status.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
}

function preencherEmpresa() {
  const empresaId = document.getElementById("empresa").value;
  const empresa = empresasCache.find(e => e.id === empresaId);
  document.getElementById("info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "";
  document.getElementById("info-rm").textContent = empresa ? `RM responsável: ${empresa.rm || "-"}` : "";
}

function preencherEmpresaNova() {
  const empresaId = document.getElementById("novaEmpresa").value;
  const empresa = empresasCache.find(e => e.id === empresaId);
  document.getElementById("nova-info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "";
  document.getElementById("nova-info-rm").textContent = empresa ? `RM responsável: ${empresa.rm || "-"}` : "";
}

function carregarCotacoesComFiltros() {
  const lista = document.getElementById("listaCotacoes");
  lista.innerHTML = "Carregando...";
  let query = db.collection("cotacoes-gerentes");
  if (!isAdmin) query = query.where("criadoPorUid", "==", usuarioAtual.uid);
  query.get().then(snapshot => {
    let cotacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const dataInicio = document.getElementById("filtroDataInicio").value;
    const dataFim = document.getElementById("filtroDataFim").value;
    const rm = document.getElementById("filtroRM").value;
    const status = document.getElementById("filtroStatus").value;

    cotacoes = cotacoes.filter(c => {
      const d = c.dataCriacao?.toDate?.();
      if (dataInicio && d < new Date(dataInicio)) return false;
      if (dataFim && d > new Date(dataFim + 'T23:59:59')) return false;
      if (rm && c.rmNome !== rm) return false;
      if (status && c.status !== status) return false;
      return true;
    });

    if (!cotacoes.length) return lista.innerHTML = "<p>Nenhuma cotação encontrada.</p>";

    let html = `<table><thead><tr><th>Empresa</th><th>Ramo</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>`;
    cotacoes.forEach(c => {
      const data = c.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";
      const valor = c.valorDesejado?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "-";
      html += `<tr>
        <td>${c.empresaNome}</td>
        <td>${c.ramo}</td>
        <td>${valor}</td>
        <td>${c.status}</td>
        <td>${data}</td>
        <td>
          <a href="chat-cotacao.html?id=${c.id}" target="_blank">Abrir</a>
          ${isAdmin ? ` | <a href="#" onclick="editarCotacao('${c.id}')">Editar</a>` : ""}
        </td>
      </tr>`;
    });
    html += `</tbody></table>`;
    lista.innerHTML = html;
  });
}

async function criarNovaCotacao() {
  const empresaId = document.getElementById("novaEmpresa").value;
  const ramo = document.getElementById("novaRamo").value;
  const valor = parseFloat(document.getElementById("novaValor").value || 0);
  const observacoes = document.getElementById("novaObservacoes").value.trim();
  if (!empresaId || !ramo) return alert("Preencha todos os campos obrigatórios.");
  const empresa = empresasCache.find(e => e.id === empresaId);
  if (!empresa) return alert("Empresa inválida.");

  const novaCotacao = {
    empresaId,
    empresaNome: empresa.nome || "",
    empresaCNPJ: empresa.cnpj || "",
    rmId: empresa.rmId || "",
    rmNome: empresa.rm || "",
    ramo,
    valorDesejado: valor,
    valorFechado: null,
    status: "Negócio iniciado",
    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPorUid: usuarioAtual.uid,
    autorUid: usuarioAtual.uid,
    autorNome: usuarioAtual.email,
    interacoes: observacoes ? [{
      autorNome: usuarioAtual.email,
      autorUid: usuarioAtual.uid,
      mensagem: observacoes,
      dataHora: new Date(),
      tipo: "observacao"
    }] : []
  };

  try {
    await db.collection("cotacoes-gerentes").add(novaCotacao);
    alert("✅ Cotação criada com sucesso.");
    document.getElementById("novaEmpresa").value = "";
    document.getElementById("novaRamo").value = "";
    document.getElementById("novaValor").value = "";
    document.getElementById("novaObservacoes").value = "";
    carregarCotacoesComFiltros();
  } catch (err) {
    console.error("Erro ao salvar nova cotação:", err);
    alert("Erro ao criar cotação.");
  }
}

window.preencherEmpresa = preencherEmpresa;
window.preencherEmpresaNova = preencherEmpresaNova;
window.criarNovaCotacao = criarNovaCotacao;
window.carregarCotacoesComFiltros = carregarCotacoesComFiltros;
