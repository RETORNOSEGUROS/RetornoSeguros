firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

document.getElementById("valorPago").addEventListener("input", function () {
  let valor = this.value.replace(/\D/g, "");
  valor = (parseInt(valor) / 100).toFixed(2) + "";
  valor = valor.replace(".", ",");
  valor = valor.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
  this.value = "R$ " + valor;
});

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const uid = user.uid;

  // LISTAR apólices do usuário (sem orderBy)
  db.collection("apolices")
    .where("usuarioId", "==", uid)
    .onSnapshot(snapshot => {
      const tbody = document.querySelector("#tabelaApolices tbody");
      tbody.innerHTML = "";
      snapshot.forEach(doc => {
        const ap = doc.data();
        const tipo = ap.tipo || "—";
        const seg = ap.seguradora || "—";
        const valor = ap.valorPago || "—";
        const renov = ap.dataRenovacao?.toDate().toLocaleDateString() || "—";
        const enviado = ap.pdfEnviado ? "✔ Enviado" : "❌ Não enviado";

        tbody.innerHTML += `
          <tr>
            <td>${tipo}</td>
            <td>${seg}</td>
            <td>${valor}</td>
            <td>${renov}</td>
            <td>${enviado}</td>
          </tr>`;
      });
    });

  // CADASTRAR apólice
  const form = document.getElementById("formApoliceSimples");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const tipo = document.getElementById("tipo").value;
    const seguradora = document.getElementById("seguradora").value;
    const valorPago = document.getElementById("valorPago").value;
    const dataRenovacao = document.getElementById("dataRenovacao").value;

    const apoliceData = {
      tipo,
      seguradora,
      valorPago,
      dataRenovacao: firebase.firestore.Timestamp.fromDate(new Date(dataRenovacao)),
      dataCadastro: firebase.firestore.Timestamp.now(),
      usuarioId: uid,
      pdfEnviado: false
    };

    try {
      await db.collection("apolices").add(apoliceData);

      const userRef = db.collection("usuarios").doc(uid);
      const userDoc = await userRef.get();
      const creditosAtual = (userDoc.data().creditos || 0) + 30;
      await userRef.update({ creditos: creditosAtual });

      const indicadorId = userDoc.data().usuarioIndicadorId;
      if (indicadorId) {
        const indRef = db.collection("usuarios").doc(indicadorId);
        const indDoc = await indRef.get();
        const novosCreditos = (indDoc.data().creditos || 0) + 20;
        await indRef.update({ creditos: novosCreditos });
      }

      alert("Apólice cadastrada com sucesso!");
      form.reset();
    } catch (erro) {
      console.error("Erro ao salvar apólice:", erro);
      alert("Erro ao salvar. Tente novamente.");
    }
  });
});
