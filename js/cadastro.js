// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Verifica se veio com código de indicação
const urlParams = new URLSearchParams(window.location.search);
const usuarioIndicadorId = urlParams.get("indicador");

// Lógica do formulário
document.getElementById("cadastroForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value;
  const celular = document.getElementById("celular").value.trim();
  const cidade = document.getElementById("cidade").value.trim();
  const estado = document.getElementById("estado").value.trim();
  const pais = document.getElementById("pais").value.trim();
  const dataNascimento = document.getElementById("dataNascimento").value;
  const usuario = document.getElementById("usuario").value.trim();
  const usuarioUnico = document.getElementById("usuarioUnico").value.trim();
  const timeId = document.getElementById("timeId").value;
  const avatarUrl = ""; // reservado para futuro
  const dataCadastro = new Date();

  auth.createUserWithEmailAndPassword(email, senha)
    .then((userCredential) => {
      const user = userCredential.user;

      const dadosUsuario = {
        nome,
        email,
        celular,
        cidade,
        estado,
        pais,
        dataNascimento,
        usuario,
        usuarioUnico,
        timeId,
        avatarUrl,
        dataCadastro: firebase.firestore.Timestamp.fromDate(dataCadastro),
        creditos: 30,
        indicacoesFeitas: 0
      };

      // Se veio com indicador, salva e premia
      if (usuarioIndicadorId) {
        dadosUsuario.usuarioIndicadorId = usuarioIndicadorId;

        // Somar créditos e contagem de indicações
        db.collection("usuarios").doc(usuarioIndicadorId).get().then(doc => {
          if (doc.exists) {
            const dadosIndicador = doc.data();
            const novosCreditos = (dadosIndicador.creditos || 0) + 10;
            const novasIndicacoes = (dadosIndicador.indicacoesFeitas || 0) + 1;

            db.collection("usuarios").doc(usuarioIndicadorId).update({
              creditos: novosCreditos,
              indicacoesFeitas: novasIndicacoes
            });
          }
        });
      }

      // Salva os dados do novo usuário
      db.collection("usuarios").doc(user.uid).set(dadosUsuario)
        .then(() => {
          alert("Cadastro realizado com sucesso!");
          window.location.href = "painel.html";
        })
        .catch((error) => {
          console.error("Erro ao salvar dados no Firestore:", error);
          alert("Erro ao salvar dados. Tente novamente.");
        });
    })
    .catch((error) => {
      console.error("Erro ao criar usuário:", error);
      alert("Erro ao cadastrar: " + error.message);
    });
});
