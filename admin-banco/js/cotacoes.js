firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let empresasCache = [];

window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    usuarioAtual = user;
    console.log("✅ Autenticado como:", user.email);

    try {
      await Promise.all([
        carregarEmpresas(),
        carregarRamosSeguro()
      ]);
      carregarCotacoesDoUsuario();
    } catch (err) {
      console.error("Erro ao carregar dados iniciais:", err);
    }
  });
});

async function carregarEmpresas() {
  const select = document.getElementById("empresa");
  select.innerHTML = `<option value="">Carregando...</option>`;

  try {
    const snapshot = await db.collection("empresas").get();
    empresasCache = [];

    if (snapshot.empty) {
      select.innerHTML = `<option value="">Nenhuma empresa encontrada</option>`;
      return;
    }

    select.innerHTML = `<option value="">Selecione uma empresa</option>`;
    snapshot.forEach(doc => {
      const dados = doc.data();
      const nome = dados.nome || "(sem nome)";
      empresasCache.push({ id: doc.id, ...dados });

      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = nome;
      select.appendChild(opt);
    });

    console.log("✅ Empresas carregadas:", empresasCache.length);
  } catch (err) {
    console.error("Erro ao carregar empresas:", err);
    select.innerHTML = `<option value="">Erro ao carregar empresas</option>`;
  }
}

async function carregarRamosSeguro() {
  const select = document.getElementById("ramo");
  try {
    const snapshot = await db.collection("ramos-seguro").orderBy("ordem").get();
    if (snapshot.empty) {
      select.innerHTML = `<option value="">Nenhum ramo cadastrado</option>`;
      return;
    }

    select.innerHTML = `<option value="">Selecione o ramo</option>`;
    snapshot.forEach(doc => {
      const d = doc.data();
      const opt = document.createElement("option");
      opt.value = d.nomeExibicao || doc.id;
      opt.textContent = d.nomeExibicao || doc.id;
      select.appendChild(opt);
    });

    console.log("✅ Ramos de seguro carregados");
  } catch (err) {
    console.error("Erro ao carregar ramos de seguro:", err);
    select.innerHTML = `<option value="">Erro ao carregar ramos</option>`;
  }
}

function preencherEmpresa() {
  const empresaId = document.getElementById("empresa").value;
  const infoCNPJ = document.getElementById("info-cnpj");
  const infoRM = document.getElementById("info-rm");

  const empresa = empresasCache.find(e => e.id === empresaId);
  if (empresa) {
    infoCNPJ.textContent = `CNPJ: ${empresa.cnpj || "Não informado"}`;
    infoRM.textContent = `RM responsável: ${empresa.rm || "Não vinculado"}`;
  } else {
    infoCNPJ.textContent = "";
    infoRM.textContent = "";
  }
}

function carregarCotacoesDoUsuario() {
  const lista = document.getElementById("listaCotacoes");
  lista.innerHTML = "Carregando...";

  db.collection("cotacoes-gerentes")
    .where("criadoPorUid", "==", usuarioAtual.uid)
    .limit(10)
    .get()
    .then(snapshot => {
      lista.innerHTML = "";
      if (snapshot.empty) {
        lista.innerHTML = "<p>Nenhum negócio encontrado.</p>";
        return;
      }

      snapshot.forEach(doc => {
        const cot = doc.data();
        const div = document.createElement("div");
        div.style.marginBottom = "20px";
        const dataCriacao = cot.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";
        div.innerHTML = `
          <strong>${cot.empresaNome}</strong> (${cot.ramo})<br>
          Valor Desejado: R$ ${cot.valorDesejado?.toLocaleString("pt-BR") || "0,00"}<br>
          Criado em: ${dataCriacao}<br>
          Status: <b>${cot.status}</b><br>
          <a href="chat-cotacao.html?id=${doc.id}">Abrir conversa</a>
        `;
        lista.appendChild(div);
      });
    })
    .catch(err => {
      console.error("Erro ao buscar cotações:", err);
      lista.innerHTML = "<p>Erro ao buscar dados.</p>";
    });
}

async function enviarCotacao() {
  console.log("🟢 Iniciando envio de cotação");

  const empresaId = document.getElementById("empresa").value;
  const ramo = document.getElementById("ramo").value;
  const valor = parseFloat(document.getElementById("valorEstimado").value || 0);
  const observacoes = document.getElementById("observacoes").value.trim();

  if (!usuarioAtual) {
    alert("Usuário não autenticado corretamente.");
    console.log("❌ usuárioAtual null");
    return;
  }

  if (!empresaId || !ramo) {
    alert("Preencha todos os campos obrigatórios.");
    console.log("❌ Campos obrigatórios vazios");
    return;
  }

  const empresa = empresasCache.find(e => e.id === empresaId);
  if (!empresa) {
    alert("Empresa não encontrada. Aguarde o carregamento ou selecione novamente.");
    console.log("❌ Empresa não localizada no cache");
    return;
  }

  let interacoes = [];
  if (observacoes) {
    interacoes.push({
      autorNome: usuarioAtual.email,
      autorUid: usuarioAtual.uid,
      mensagem: observacoes,
      dataHora: new Date(),
      tipo: "observacao"
    });
  }

  const novaCotacao = {
    empresaId,
    empresaNome: empresa?.nome || "",
    empresaCNPJ: empresa?.cnpj || "",
    rmId: empresa?.rmId || "",
    rmNome: empresa?.rm || "",
    ramo,
    valorDesejado: valor,
    valorFechado: null,
    status: "Negócio iniciado",
    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPorUid: usuarioAtual.uid,
    autorUid: usuarioAtual.uid,
    autorNome: usuarioAtual.email,
    interacoes
  };

  console.log("🧠 novaCotacao:", novaCotacao);

  try {
    const cotacaoId = db.collection("cotacoes-gerentes").doc().id;
    await db.collection("cotacoes-gerentes").doc(cotacaoId).set(novaCotacao);
    alert("✅ Cotação criada com sucesso.");
    carregarCotacoesDoUsuario();
  } catch (err) {
    console.error("🔥 Erro ao salvar cotação:", err);
    alert("Erro ao criar cotação: " + err.message);
  }
}

window.enviarCotacao = enviarCotacao;
window.preencherEmpresa = preencherEmpresa;
