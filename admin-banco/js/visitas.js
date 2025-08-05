
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

function carregarEmpresas() {
  const select = document.getElementById("empresa");
  db.collection("empresas").orderBy("nome").get().then(snapshot => {
    select.innerHTML = `<option value="">Selecione uma empresa</option>`;
    snapshot.forEach(doc => {
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = doc.data().nome;
      select.appendChild(option);
    });
  });
}

function carregarSeguradoras() {
  return db.collection("seguradoras").orderBy("nome").get().then(snapshot => {
    const seguradoras = [];
    snapshot.forEach(doc => {
      seguradoras.push(doc.data().nome);
    });
    return seguradoras;
  });
}

async function carregarRamosSeguro() {
  const snapshot = await db.collection("ramos-seguro").orderBy("ordem").get();
  const ramos = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    ramos.push({ id: doc.id, nome: data.nomeExibicao });
  });
  return ramos;
}

async function gerarCamposRamos(seguradoras) {
  const ramos = await carregarRamosSeguro();
  const container = document.getElementById("ramos-container");

  ramos.forEach(ramo => {
    const box = document.createElement("div");
    box.className = "ramo-box";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ramo";
    checkbox.value = ramo.id;
    checkbox.onchange = () => {
      const campos = document.getElementById(`campos-${ramo.id}`);
      campos.style.display = checkbox.checked ? "block" : "none";
    };

    const labelCheck = document.createElement("label");
    labelCheck.appendChild(checkbox);
    labelCheck.append(` ${ramo.nome}`);
    box.appendChild(labelCheck);

    const sub = document.createElement("div");
    sub.className = "subcampos";
    sub.id = `campos-${ramo.id}`;

    sub.innerHTML = `
      <label>Vencimento:</label>
      <input type="date" id="${ramo.id}-vencimento">

      <label>Prêmio anual (R$):</label>
      <input type="number" id="${ramo.id}-premio" placeholder="Valor">

      <label>Seguradora:</label>
      <select id="${ramo.id}-seguradora">
        <option value="">Selecione</option>
        ${seguradoras.map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>

      <label>Observações:</label>
      <textarea id="${ramo.id}-observacoes" placeholder="Comentários ou detalhes adicionais..."></textarea>
    `;

    box.appendChild(sub);
    container.appendChild(box);
  });
}

function registrarVisita() {
  const empresaId = document.getElementById("empresa").value;
  if (!empresaId) {
    alert("Selecione a empresa.");
    return;
  }

  auth.onAuthStateChanged(user => {
    if (!user) {
      alert("Usuário não autenticado.");
      return;
    }

    const visita = {
      empresaId,
      usuarioId: user.uid,
      data: firebase.firestore.FieldValue.serverTimestamp(),
      ramos: {}
    };

    document.querySelectorAll(".ramo").forEach(input => {
      if (input.checked) {
        const id = input.value;
        const vencimentoInput = document.getElementById(`${id}-vencimento`).value;
        let vencimentoTimestamp = null;
        if (vencimentoInput) {
          const dataVenc = new Date(vencimentoInput + "T12:00:00");
          vencimentoTimestamp = firebase.firestore.Timestamp.fromDate(dataVenc);
        }

        visita.ramos[id] = {
          vencimento: vencimentoTimestamp,
          premio: parseFloat(document.getElementById(`${id}-premio`).value) || 0,
          seguradora: document.getElementById(`${id}-seguradora`).value,
          observacoes: document.getElementById(`${id}-observacoes`).value
        };
      }
    });

    db.collection("visitas").add(visita).then(() => {
      alert("Visita registrada com sucesso.");
      location.reload();
    }).catch(err => {
      console.error("Erro ao registrar visita:", err);
      alert("Erro ao salvar visita.");
    });
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  carregarEmpresas();
  const seguradoras = await carregarSeguradoras();
  await gerarCamposRamos(seguradoras);
});
