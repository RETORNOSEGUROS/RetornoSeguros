// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Verifica se veio com parâmetro de indicação
const urlParams = new URLSearchParams(window.location.search);
const usuarioIndicadorId = urlParams.get("indicador");

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
        creditos: 30,
        status: "ativo",
        dataCadastro: new Date()
      };

      // Se veio com indicação, adiciona o vínculo
      if (usuarioIndicadorId) {
        dadosUsuario.indicadorId = usuarioIndicadorId;
      }

      return db.collection("usuarios").doc(user.uid).set(dadosUsuario)
        .then(() => {
          // Se veio com indicação, atualiza os pontos e contagem do indicador
          if (usuarioIndicadorId) {
            const indicadorRef = db.collection("usuarios").doc(usuarioIndicadorId);
            indicadorRef.get().then(doc => {
              if (doc.exists) {
                const indicadorData = doc.data();
                const novosCreditos = (indicadorData.creditos || 0) + 10;
                const novaQtd = (indicadorData.qtdIndicacoes || 0) + 1;

                indicadorRef.update({
                  creditos: novosCreditos,
                  qtdIndicacoes: novaQtd
                });
              }
            });
          }

          alert("Cadastro realizado com sucesso!");
          window.location.href = "painel.html";
        });
    })
    .catch((error) => {
      console.error(error);
      alert("Erro no cadastro: " + error.message);
    });
});
