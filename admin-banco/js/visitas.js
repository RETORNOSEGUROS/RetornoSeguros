firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

function mostrarCampos(checkbox) {
  const id = `campos-${checkbox.value}`;
  document.getElementById(id).style.display = checkbox.checked ? "block" : "none";
}

function registrarVisita() {
  const empresa = document.getElementById("empresa").value.trim();
  if (!empresa) return alert("Preencha o nome da empresa.");

  auth.onAuthStateChanged(user => {
    if (!user) return alert("Usuário não autenticado.");

    const uid = user.uid;
    const data = {
      empresa: empresa,
      usuarioId: uid,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      ramos: []
    };

    document.querySelectorAll(".ramo:checked").forEach(cb => {
      const ramo = cb.value;
      const venc = document.getElementById(`${ramo}-vencimento`).value;
      const premio = parseFloat(document.getElementById(`${ramo}-premio`).value || "0");
      const obs = document.getElementById(`${ramo}-observacoes`).value;

      data.ramos.push({
        tipo: ramo,
        vencimento: venc ? firebase.firestore.Timestamp.fromDate(new Date(venc)) : null,
        premio: isNaN(premio) ? null : premio,
        observacoes: obs || ""
      });
    });

    db.collection("visitas").add(data)
      .then(() => {
        alert("Visita registrada com sucesso.");
        location.reload();
      })
      .catch(err => {
        console.error("Erro ao registrar visita:", err);
        alert("Erro ao salvar a visita.");
      });
  });
}
