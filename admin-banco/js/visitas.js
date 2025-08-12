// --- Firebase v8 ---
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

/* =======================
   Helpers de máscara/validação
   ======================= */

// dd/mm/aaaa enquanto digita (aceita só números)
function maskDDMMYYYY(value) {
  let v = (value || "").replace(/\D/g, "").slice(0, 8); // até 8 dígitos
  if (v.length >= 5) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
  else if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
  return v;
}

function validaDDMMYYYY(v) {
  if (!v) return true; // opcional
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return false;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900) return false;

  // valida calendário (evita 31/02/2025 etc.)
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === (mo - 1) && dt.getDate() === d;
}

// moeda BR em tempo real
function maskMoedaBR(v) {
  v = (v || "").toString().replace(/\D/g, "");
  if (!v) return "R$ 0,00";
  v = (parseInt(v, 10) / 100).toFixed(2); // duas casas
  // 1234.56 -> "1.234,56"
  let [int, dec] = v.split(".");
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "R$ " + int + "," + dec;
}

// parse "R$ 50.100,15" -> 50100.15 (Number)
function parseMoedaBRToNumber(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[R$\s\.]/g, "").replace(",", ".")) || 0;
}

/* =======================
   Carregamentos
   ======================= */

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
      // tenta vários campos para o RM
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

// Busca TODAS as seguradoras existentes, sem depender de orderBy/indice
function carregarSeguradoras() {
  return db.collection("seguradoras").get()
    .then(snapshot => {
      const arr = [];
      snapshot.forEach(doc => {
        const n = (doc.data() && doc.data().nome) ? String(doc.data().nome).trim() : null;
        if (n) arr.push(n);
      });
      // ordena no cliente
      return arr.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
    })
    .catch(err => {
      console.error("Erro ao carregar seguradoras:", err);
      return [];
    });
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

    // fallback
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

/* =======================
   UI dinâmica dos ramos
   ======================= */

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

    sub.innerHTML = `
      <label>Vencimento (dd/mm/aaaa):</label>
      <input type="text" id="${ramo.id}-vencimento" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">

      <label>Prêmio anual (R$):</label>
      <input type="text" id="${ramo.id}-premio" placeholder="R$ 0,00">

      <label>Seguradora:</label>
      <select id="${ramo.id}-seguradora">
        <option value="">Selecione</option>
        ${seguradoras.map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>

      <label>Observações:</label>
      <textarea id="${ramo.id}-observacoes" placeholder="Comentários ou detalhes adicionais..."></textarea>
    `;

    // máscara vencimento dd/mm/aaaa
    const vencInput = sub.querySelector(`#${ramo.id}-vencimento`);
    vencInput.addEventListener("input", (e) => {
      e.target.value = maskDDMMYYYY(e.target.value);
    });

    // máscara moeda BR
    const premioInput = sub.querySelector(`#${ramo.id}-premio`);
    premioInput.addEventListener("input", (e) => {
      e.target.value = maskMoedaBR(e.target.value);
    });
    // inicia com R$ 0,00 ao focar se estiver vazio (opcional)
    premioInput.addEventListener("focus", (e) => {
      if (!e.target.value) e.target.value = "R$ 0,00";
    });

    // toggle subcampos
    checkbox.addEventListener("change", () => {
      sub.style.display = checkbox.checked ? "block" : "none";
    });

    box.appendChild(sub);
    container.appendChild(box);
  });
}

/* =======================
   Salvar
   ======================= */

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
        const premioStr = document.getElementById(`${id}-premio`).value || "";
        const premioNum = parseMoedaBRToNumber(premioStr);
        const seguradoraSel = document.getElementById(`${id}-seguradora`).value || "";
        const obs = document.getElementById(`${id}-observacoes`).value || "";

        if (!validaDDMMYYYY(vencimentoStr)) {
          erroVenc = `Vencimento inválido em ${id}. Use dd/mm/aaaa.`;
        }

        visita.ramos[id] = {
          vencimento: vencimentoStr, // agora dd/mm/aaaa
          premio: premioNum,         // número (ex.: 50100.15)
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

/* =======================
   Bootstrap
   ======================= */

window.addEventListener("DOMContentLoaded", async () => {
  carregarEmpresas();
  const seguradoras = await carregarSeguradoras();
  await gerarCamposRamos(seguradoras);
});

window.registrarVisita = registrarVisita;
