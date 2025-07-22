firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const uid = user.uid;

  db.collection("gerentes").doc(uid).get().then(doc => {
    if (!doc.exists || doc.data().ativo === false) {
      alert("Acesso negado.");
      auth.signOut();
      return;
    }

    const dados = doc.data();
    const gerenteId = uid;
    const cargo = dados.cargo || "gerente";

    // Carrega os dados do gerente (individual)
    if (cargo === "gerente") {
      carregarIndicadoresPorGerente(gerenteId);
    }

    // Chefe vê dados gerais
    if (cargo === "chefe") {
      carregarIndicadoresGerais();
    }
  });
});

function carregarIndicadoresPorGerente(id) {
  db.collection("empresas").where("cadastradoPor", "==", id).get().then(snapshot => {
    document.querySelector("#cardEmpresas span").textContent = snapshot.size;
  });

  db.collection("visitas").where("gerenteId", "==", id).get().then(snapshot => {
    document.querySelector("#cardVisitas span").textContent = snapshot.size;
  });

  db.collection("cotacoes").where("gerenteId", "==", id).get().then(snapshot => {
    const total = snapshot.size;
    const convertidas = snapshot.docs.filter(doc => doc.data().convertida === true).length;
    document.querySelector("#cardCotacoes span").textContent = total;
    document.querySelector("#cardConvertidas span").textContent = convertidas;
  });

  db.collection("seguros").where("gerenteId", "==", id).get().then(snapshot => {
    document.querySelector("#cardSeguros span").textContent = snapshot.size;
  });
}

function carregarIndicadoresGerais() {
  db.collection("empresas").get().then(snapshot => {
    document.querySelector("#cardEmpresas span").textContent = snapshot.size;
  });

  db.collection("visitas").get().then(snapshot => {
    document.querySelector("#cardVisitas span").textContent = snapshot.size;
  });

  db.collection("cotacoes").get().then(snapshot => {
    const total = snapshot.size;
    const convertidas = snapshot.docs.filter(doc => doc.data().convertida === true).length;
    document.querySelector("#cardCotacoes span").textContent = total;
    document.querySelector("#cardConvertidas span").textContent = convertidas;
  });

  db.collection("seguros").get().then(snapshot => {
    document.querySelector("#cardSeguros span").textContent = snapshot.size;
  });
}

function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = "login.html";
  });
}
