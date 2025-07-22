
firebase.auth().createUserWithEmailAndPassword(email, senha)
  .then((userCredential) => {
    const user = userCredential.user;
    const uid = user.uid;

    const usuarioData = {
      nome: nome,
      email: email,
      telefone: telefone,
      cidade: cidade,
      estado: estado,
      dataCadastro: new Date(),
      creditos: 30,
      pontos: 0,
      isCliente: false,
      usuarioIndicadorId: usuarioIndicadorId || null
    };

    db.collection("usuarios").doc(uid).set(usuarioData)
      .then(() => {
        // Se houver indicação, somar créditos ao indicador
        if (usuarioIndicadorId) {
          const indicadorRef = db.collection("usuarios").doc(usuarioIndicadorId);
          indicadorRef.get().then((doc) => {
            if (doc.exists) {
              const creditosAtuais = doc.data().creditos || 0;
              indicadorRef.update({
                creditos: creditosAtuais + 10
              });
            }
          });
        }

        alert("Cadastro realizado com sucesso!");
        window.location.href = "/usuarios/painel.html";
      })
      .catch((error) => {
        console.error("Erro ao salvar usuário:", error);
        alert("Erro ao salvar usuário.");
      });
  })
  .catch((error) => {
    console.error("Erro no cadastro:", error);
    alert(error.message);
  });
