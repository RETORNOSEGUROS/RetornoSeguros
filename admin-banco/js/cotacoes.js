
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let empresasCache = [];
let isAdmin = false;

window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    usuarioAtual = user;
    isAdmin = user.email === "patrick@retornoseguros.com.br";

    console.log("✅ Logado como:", user.email, "| Admin:", isAdmin);

    await Promise.all([
      carregarEmpresas(),
      carregarEmpresasNova(),
      carregarRamosSeguro(),
      carregarRamosSeguroNovo(),
      carregarRM(),
      carregarStatus()
    ]);

    carregarCotacoesComFiltros();
    if (!isAdmin) document.getElementById("btnSalvarAlteracoes").style.display = "none";
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

    select.innerHTML = `<option value="">Selecione a empresa</option>`;
    snapshot.forEach(doc => {
      const dados = doc.data();
      empresasCache.push({ id: doc.id, ...dados });

      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = dados.nome;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar empresas:", err);
    select.innerHTML = `<option value="">Erro ao carregar</option>`;
  }
}

async function carregarEmpresasNova() {
  const select = document.getElementById("novaEmpresa");
  select.innerHTML = `<option value="">Carregando...</option>`;

  try {
    const snapshot = await db.collection("empresas").get();
    empresasCache = [];

    if (snapshot.empty) {
      select.innerHTML = `<option value="">Nenhuma empresa encontrada</option>`;
      return;
    }

    select.innerHTML = `<option value="">Selecione a empresa</option>`;
    snapshot.forEach(doc => {
      const dados = doc.data();
      empresasCache.push({ id: doc.id, ...dados });

      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = dados.nome;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar empresas (nova):", err);
    select.innerHTML = `<option value="">Erro ao carregar</option>`;
  }
}

async function carregarRamosSeguro() {
  const select = document.getElementById("ramo");
  try {
    const snapshot = await db.collection("ramos-seguro").orderBy("ordem").get();
    select.innerHTML = `<option value="">Selecione o ramo</option>`;
    snapshot.forEach(doc => {
      const d = doc.data();
      const opt = document.createElement("option");
      opt.value = d.nomeExibicao || doc.id;
      opt.textContent = d.nomeExibicao || doc.id;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar ramos:", err);
    select.innerHTML = `<option value="">Erro ao carregar ramos</option>`;
  }
}

async function carregarRamosSeguroNovo() {
  const select = document.getElementById("novaRamo");
  try {
    const snapshot = await db.collection("ramos-seguro").orderBy("ordem").get();
    select.innerHTML = `<option value="">Selecione o ramo</option>`;
    snapshot.forEach(doc => {
      const d = doc.data();
      const opt = document.createElement("option");
      opt.value = d.nomeExibicao || doc.id;
      opt.textContent = d.nomeExibicao || doc.id;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar ramos (novo):", err);
    select.innerHTML = `<option value="">Erro ao carregar ramos</option>`;
  }
}
