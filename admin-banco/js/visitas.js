// --- Firebase v8 ---
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- Helpers ----------
function maskDDMM(value) {
  // mantém só números
  let v = (value || "").replace(/\D/g, "").slice(0, 4);
  if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
  return v;
}

function validaDDMM(v) {
  // aceita vazio (campo opcional), ou dd/mm válido
  if (!v) return true;
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!m) return false;
  const d = parseInt(m[1], 10);
  const mth = parseInt(m[2], 10);
  return d >= 1 && d <= 31 && mth >= 1 && mth <= 12;
}

// ---------- Carregamentos ----------
function carregarEmpresas() {
  const select = document.getElementById("empresa");
  const infoEmpresa = document.getElementById("infoEmpresa");
  const rmNomeSpan = document.getElementById("rmNome");

  db.collection("empresas").orderBy("nome").get().then(snapshot => {
    select.innerHTML = `<option value="">Selecione uma empresa</option>`;
    snapshot.forEach(doc => {
      const data = doc.data();
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = data.nome || "(Sem nome)";
      // tenta vários campos comuns p/ RM
      option.setAttribute("data-rm", data.rmNome || data.rm || data.rm_nome || "Não informado");
      select.appendChild(option);
    });

    select.addEventListener("change", () => {
      const selectedOption = select.options[select.selectedIndex];
      const rmNome = selectedOption.getAttribute("data-rm") || "Não informado";
      rmNomeSpan.textContent = rmNome;
      infoEmpresa.style.display = selectedOption.value ? "block" : "none";
    });
  }).catch(err => {
    console.error("Erro ao carregar empresas:", err);
    select.innerHTML = `<option value="">Erro ao carregar empresas</option>`;
  });
}

function carregarSeguradoras() {
  return db.collection("seguradoras").orderBy("nome").get()
    .then(snapshot => {
      const arr = [];
      snapshot.forEach(doc => arr.push(doc.data().nome));
      // fallback básico se a coleção estiver vazia
      return arr.length ? arr : ["Porto", "Bradesco", "SulAmérica", "Allianz", "HDI", "Tokio Marine", "Sompo"];
    })
    .catch(() => ["Porto", "Bradesco", "SulAmérica", "Allianz", "HDI", "Tokio Marine", "Sompo"]);
}

async function carregarRamosSeguro() {
  try {
    const snapshot = await db.collection("ramos-seguro").orderBy("ordem").get();
    const ramos = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      ramos.push({ id: doc.id, nome: data.nomeExibicao || data.nome || doc.id });
    });
    if (ramos.length) return ramos;

    // fallback caso a coleção não exista ou esteja vazia
    return [
      { id: "auto", nome: "Automóvel" },
      { id: "vida", nome: "Vida" },
      { id: "saude", nome: "Saúde" },
      { id: "dental", nome: "Dental" },
      { id: "empresarial", nome: "Empresarial" },
      { id: "residencial", nome: "Residencial" },
      { id: "equipamentos", nome: "Equipamentos" },
      { id: "frota", nome: "Frota" },
      { id: "rc", nome: "Responsabilidade Civil" },
      { id: "transportes", nome: "Transportes" }
    ];
  } catch (e) {
    console.error("Erro ao carregar ramos-seguro:", e);
    return [
      { id: "auto", nome: "Automóvel" },
      { id: "vida", nome: "Vida" },
      { id: "saude", nome: "Saúde" },
      { id: "dental", nome: "Dental" },
      { id: "empresarial", nome: "Empresarial" }
    ];
  }
}

async function gerarCamposRamos(seguradoras) {
  const ramos = await carregarRamosSeguro();
  const container = document.getElementById("ramos-container");
  container.innerHTML = "";

  if (!ramos.length) {
    container.innerHTML = `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff7ed;color:#7c2d12;">
      Não há ramos configurados. Configure em <strong>ramos-seguro</strong> no Firestore.
    </div>`;
    return;
  }

  ramos.forEach(ramo => {
    const box = document.createElement("div");
    box.className = "ramo-box";

    const head = document.createElement("div");
    head.className = "head";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ramo";
    checkbox.value = ramo.id;

    const labelCheck = document.createElement("label");
    labelCheck.style.margin = "0";
    labelCheck.append(` ${ramo.nome}`);

    head.appendChild(checkbox);
    head.appendChild(labelCheck);
    box.appendChild(head);

    const sub = document.createElement("div");
    sub.className = "subcampos";
    sub.id = `campos-${ramo.id}`;

    // vencimento dd/mm (texto)
    sub.innerHTML = `
      <label>Vencimento (dd/mm):</label>
      <input type="text" id="${ramo.id}-vencimento" inputmode="numeric" placeholder="dd/mm" maxlength="5">

      <label>Prêmio anual (R$):</label>
      <input type="number" id="${ramo.id}-premio" placeholder="0,00" step="0.01">

      <label>Seguradora:</label>
      <select id="${ramo.id}-seguradora">
        <option value="">Selecione</option>
        ${seguradoras.map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>

      <label>Observações:</label>
      <textarea id="${ramo.id}-observacoes" placeholder="Comentários ou detalhes adicionais..."></textarea>
    `;

    // máscara simples dd/mm
    sub.querySelector(`#${ramo.id}-vencimento`).addEventListener("input", (e) => {
      e.target.value = maskDDMM(e.target.value);
    });

    // toggle subcampos
    checkbox.addEventListener("change", () => {
      sub.style.display = checkbox.checked ? "block" : "none";
    });

    box.appendChild(sub);
    container.appendChild(box);
  });
}

// ---------- Salvar ----------
function registrarVisita() {
  const empresaSelect = document.getElementById("empresa");
  const empresaId = empresaSelect.value;
  const tipoVisitaSelect = document.getElementById("tipoVisita");
  const tipoVisita = tipoVisitaSelect ? tipoVisitaSelect.value : "";
  const rmNome = empresaSelect.options[empresaSelect.selectedIndex]?.getAttribute("data-rm") || "";
  const empresaNome = empresaSelect.options[empresaSelect.selectedIndex]?.textContent || "";

  if (!empresaId) {
    alert("Selecione a empresa.");
    return;
  }
  if (!tipoVisita) {
    alert("Selecione o tipo da visita.");
    return;
  }

  auth.onAuthStateChanged(user => {
    if (!user) {
      alert("Usuário não autenticado.");
      return;
    }

    const visita = {
      empresaId,
      empresaNome,
      tipoVisita,
      rmNome,
      usuarioId: user.uid,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      ramos: {}
    };

    let algumRamo = false;
    let erroVenc = null;

    document.querySelectorAll(".ramo").forEach(input => {
      if (input.checked) {
        algumRamo = true;
        const id = input.value;

        const vencimentoStr = (document.getElementById(`${id}-vencimento`).value || "").trim();
        const premioNum = parseFloat(document.getElementById(`${id}-premio`).value.replace(",", ".")) || 0;
        const seguradoraSel = document.getElementById(`${id}-seguradora`).value || "";
        const obs = document.getElementById(`${id}-observacoes`).value || "";

        if (!validaDDMM(vencimentoStr)) {
          erroVenc = `Vencimento inválido em ${id}. Use dd/mm.`;
        }

        visita.ramos[id] = {
          vencimento: vencimentoStr, // mantém dd/mm (igual ao backup)
          premio: premioNum,
          seguradora: seguradoraSel,
          observacoes: obs
        };
      }
    });

    if (erroVenc) {
      alert(erroVenc);
      return;
    }

    if (!algumRamo) {
      // permite salvar a visita sem ramos? Mantive exigindo ao menos 1
      alert("Marque pelo menos um ramo e preencha os campos.");
      return;
    }

    db.collection("visitas").add(visita).then(() => {
      alert("Visita registrada com sucesso.");
      location.reload();
    }).catch(err => {
      console.error("Erro ao registrar visita:", err);
      alert("Erro ao salvar visita.");
    });
  });
}

// ---------- Bootstrap ----------
window.addEventListener("DOMContentLoaded", async () => {
  carregarEmpresas();
  const seguradoras = await carregarSeguradoras();
  await gerarCamposRamos(seguradoras);
});

// torna a função global (usada no onclick do HTML)
window.registrarVisita = registrarVisita;
