firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const ramos = [
  { id: "vida", nome: "Seguro de Vida Funcionários" },
  { id: "saude", nome: "Plano de Saúde" },
  { id: "dental", nome: "Plano Dental" },
  { id: "previdencia", nome: "Previdência" },
  { id: "saude_socios", nome: "Saúde dos Sócios" },
  { id: "vida_socios", nome: "Vida dos Sócios" },
  { id: "frota", nome: "Frota" },
  { id: "empresarial", nome: "Empresarial (Patrimonial)" },
  { id: "do", nome: "D&O" },
  { id: "equipamentos", nome: "Equipamentos" },
  { id: "outros", nome: "Outros" }
];

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

function gerarCamposRamos(seguradoras) {
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
      <label>Vencimento (dia/mês):</label>
      <input type="text" id="${ramo.id}-vencimento" placeholder="dd/mm">

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
        visita.ramos[id] = {
          vencimento: document.getElementById(`${id}-vencimento`).value,
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
  gerarCamposRamos(seguradoras);
});
