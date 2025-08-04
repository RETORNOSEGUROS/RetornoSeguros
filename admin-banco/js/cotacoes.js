firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let usuarioAtual = null;
let empresasCache = [];

window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async user => {
    if (!user) return window.location.href = "login.html";
    usuarioAtual = user;
    await carregarEmpresas();
  });
});

async function carregarEmpresas() {
  const selects = [document.getElementById("empresa"), document.getElementById("novaEmpresa")];
  selects.forEach(s => s.innerHTML = `<option>Carregando empresas...</option>`);

  try {
    const snapshot = await db.collection("empresas").get();
    console.log("✔️ Snapshot obtido:", snapshot.size);

    empresasCache = [];
    selects.forEach(s => s.innerHTML = `<option value="">Selecione a empresa</option>`);

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.nome) {
        console.warn("Empresa sem nome:", doc.id, data);
        return;
      }
      empresasCache.push({ id: doc.id, ...data });
      selects.forEach(s => {
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = data.nome;
        s.appendChild(opt);
      });
    });

    if (empresasCache.length === 0) {
      console.warn("⚠️ Nenhuma empresa encontrada.");
    }

  } catch (err) {
    console.error("❌ Erro ao carregar empresas:", err);
  }
}
