firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let editandoUsuarioId = null;

auth.onAuthStateChanged(user => {
  if (!user || user.email !== "patrick@retornoseguros.com.br") {
    window.location.href = "login.html";
  } else {
    listarUsuarios();
    carregarGerentesChefes();
    carregarRMs();
  }
});

function toggleCamposVinculo() {
  const perfil = document.getElementById("perfil").value;
  const gerenteBox = document.getElementById("gerenteChefeBox");
  const rmBox = document.getElementById("rmBox");

  if (perfil === "rm") {
    gerenteBox.style.display = "block";
    rmBox.style.display = "none";
  } else if (perfil === "assistente") {
    gerenteBox.style.display = "none"; // pode deixar true se quiser manter ambos
    rmBox.style.display = "block";
  } else {
    gerenteBox.style.display = "none";
    rmBox.style.display = "none";
  }
}

function carregarGerentesChefes() {
  const select = document.getElementById("gerenteChefeId");
  select.innerHTML = '<option value="">Selecionar</option>';

  db.collection("usuarios_banco").where("perfil", "==", "gerente_chefe").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const u = doc.data();
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = `${u.nome} (${u.agenciaId || "-"})`;
        select.appendChild(option);
      });
    });
}

function carregarRMs() {
  const select = document.getElementById("rmResponsavelId");
  select.innerHTML = '<option value="">Selecionar</option>';

  db.collection("usuarios_banco").where("perfil", "==", "rm").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const u = doc.data();
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = `${u.nome} (${u.agenciaId || "-"})`;
        select.appendChild(option);
      });
    });
}

function cadastrarUsuario() {
  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();
  const perfil = document.getElementById("perfil").value;
  const agenciaId = document.getElementById("agenciaId").value.trim();
  const gerenteChefeIdSelecionado = document.getElementById("gerenteChefeId").value;
  const rmResponsavelIdSelecionado = document.getElementById("rmResponsavelId").value;

  if (!nome || !email || !perfil || !agenciaId) {
    return alert("Preencha todos os campos.");
  }

  if (editandoUsuarioId) {
    const atualizacao = {
      nome,
      perfil,
      agenciaId,
      gerenteChefeId: perfil === "rm" ? gerenteChefeIdSelecionado : "",
      rmResponsavelId: perfil === "assistente" ? rmResponsavelIdSelecionado : ""
    };

    db.collection("usuarios_banco").doc(editandoUsuarioId).update(atualizacao)
      .then(() => {
        alert("✅ Usuário atualizado com sucesso.");
        limparFormulario();
        listarUsuarios();
        carregarGerentesChefes();
        carregarRMs();
      })
      .catch(err => {
        console.error("Erro ao atualizar:", err.message);
        alert("Erro ao atualizar o usuário: " + err.message);
      });

    return;
  }

  if (!senha) return alert("Informe a senha para novo usuário.");

  auth.createUserWithEmailAndPassword(email, senha)
    .then(cred => {
      const uid = cred.user.uid;
      return db.collection("usuarios_banco").doc(uid).set({
        nome,
        email,
        perfil,
        agenciaId,
        ativo: true,
        gerenteChefeId: perfil === "rm" ? gerenteChefeIdSelecionado : "",
        rmResponsavelId: perfil === "assistente" ? rmResponsavelIdSelecionado : ""
      }).then(() => {
        alert("✅ Usuário criado com sucesso!");
        limparFormulario();
        listarUsuarios();
        carregarGerentesChefes();
        carregarRMs();
      }).catch(err => {
        cred.user.delete().then(() => {
          console.error("Erro ao salvar no Firestore:", err.message);
          alert("❌ Erro ao salvar no banco. Cadastro cancelado.");
        });
      });
    })
    .catch(err => {
      console.error("Erro Auth:", err.message);
      alert("❌ Erro ao cadastrar: " + err.message);
    });
}

function listarUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  lista.innerHTML = "";

  db.collection("usuarios_banco").orderBy("nome").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const u = doc.data();
        const tr = document.createElement("tr");

        const tdNome = document.createElement("td");
        tdNome.textContent = u.nome;

        const tdEmail = document.createElement("td");
        tdEmail.textContent = u.email;

        const tdPerfil = document.createElement("td");
        tdPerfil.textContent = u.perfil;

        const tdAgencia = document.createElement("td");
        tdAgencia.textContent = u.agenciaId || "-";

        const tdAcoes = document.createElement("td");
        const btn = document.createElement("button");
        btn.textContent = "Editar";
        btn.onclick = () => editarUsuario(
          doc.id,
          u.nome,
          u.email,
          u.perfil,
          u.agenciaId || "",
          u.gerenteChefeId || "",
          u.rmResponsavelId || ""
        );
        tdAcoes.appendChild(btn);

        tr.appendChild(tdNome);
        tr.appendChild(tdEmail);
        tr.appendChild(tdPerfil);
        tr.appendChild(tdAgencia);
        tr.appendChild(tdAcoes);

        lista.appendChild(tr);
      });
    });
}

function editarUsuario(id, nome, email, perfil, agenciaId, gerenteChefeId, rmResponsavelId) {
  editandoUsuarioId = id;
  document.getElementById("nome").value = nome;
  document.getElementById("email").value = email;
  document.getElementById("email").disabled = true;
  document.getElementById("senha").value = "";
  document.getElementById("perfil").value = perfil;
  document.getElementById("agenciaId").value = agenciaId;
  toggleCamposVinculo();
  setTimeout(() => {
    document.getElementById("gerenteChefeId").value = gerenteChefeId || "";
    document.getElementById("rmResponsavelId").value = rmResponsavelId || "";
  }, 150);
  document.querySelector("button").textContent = "Atualizar";
}

function limparFormulario() {
  editandoUsuarioId = null;
  document.getElementById("nome").value = "";
  document.getElementById("email").value = "";
  document.getElementById("email").disabled = false;
  document.getElementById("senha").value = "";
  document.getElementById("perfil").value = "";
  document.getElementById("agenciaId").value = "";
  document.getElementById("gerenteChefeId").value = "";
  document.getElementById("rmResponsavelId").value = "";
  document.getElementById("gerenteChefeBox").style.display = "none";
  document.getElementById("rmBox").style.display = "none";
  document.querySelector("button").textContent = "Cadastrar";
}
