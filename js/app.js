document.addEventListener("DOMContentLoaded", () => {
  const btnGPS = document.getElementById("gps");
  const btnBuscar = document.getElementById("buscar");
  const btnRota = document.getElementById("rota");

  const campoEndereco = document.getElementById("endereco");
  const frete = document.getElementById("frete");
  const regiao = document.getElementById("regiao");
  const distancia = document.getElementById("distancia");
  const tempo = document.getElementById("tempo");

  let latitude = null;
  let longitude = null;

  function mostrarCarregamento() {
    frete.textContent = "Calculando...";
    regiao.textContent = "Localizando endereço...";
    distancia.textContent = "--";
    tempo.textContent = "--";
    btnBuscar.disabled = true;
    btnBuscar.textContent = "Aguarde...";
  }

  function finalizarCarregamento() {
    btnBuscar.disabled = false;
    btnBuscar.textContent = "🚚 Calcular Frete";
  }

  function mostrarErro(mensagem) {
    frete.textContent = "Não disponível";
    regiao.textContent = mensagem;
    distancia.textContent = "--";
    tempo.textContent = "--";
  }

  async function buscarCoordenadas(endereco) {
    const parametros = new URLSearchParams({
      q: endereco,
      format: "json",
      limit: "1",
      countrycodes: "br",
      addressdetails: "1"
    });

    const resposta = await fetch(
      `https://nominatim.openstreetmap.org/search?${parametros.toString()}`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!resposta.ok) {
      throw new Error("Erro ao consultar o endereço.");
    }

    const dados = await resposta.json();

    if (!dados.length) {
      throw new Error("Endereço não encontrado.");
    }

    return {
      latitude: Number(dados[0].lat),
      longitude: Number(dados[0].lon),
      nomeCompleto: dados[0].display_name
    };
  }

  async function buscarEnderecoPelasCoordenadas(lat, lon) {
    const parametros = new URLSearchParams({
      lat: lat,
      lon: lon,
      format: "json",
      addressdetails: "1"
    });

    const resposta = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${parametros.toString()}`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!resposta.ok) {
      throw new Error("Não foi possível identificar o endereço.");
    }

    const dados = await resposta.json();

    return dados.display_name || `${lat}, ${lon}`;
  }

  btnGPS.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Seu navegador não suporta localização.");
      return;
    }

    btnGPS.disabled = true;
    btnGPS.textContent = "Localizando...";

    navigator.geolocation.getCurrentPosition(
      async (posicao) => {
        latitude = posicao.coords.latitude;
        longitude = posicao.coords.longitude;

        try {
          const enderecoEncontrado =
            await buscarEnderecoPelasCoordenadas(latitude, longitude);

          campoEndereco.value = enderecoEncontrado;
        } catch {
          campoEndereco.value =
            `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        } finally {
          btnGPS.disabled = false;
          btnGPS.textContent = "📍 Minha localização";
        }
      },

      (erro) => {
        btnGPS.disabled = false;
        btnGPS.textContent = "📍 Minha localização";

        if (erro.code === erro.PERMISSION_DENIED) {
          alert("Permissão de localização negada.");
        } else {
          alert("Não foi possível obter sua localização.");
        }
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });

  btnBuscar.addEventListener("click", async () => {
    const enderecoDigitado = campoEndereco.value.trim();

    if (!enderecoDigitado) {
      alert("Digite um endereço.");
      campoEndereco.focus();
      return;
    }

    mostrarCarregamento();

    try {
      const resultado = await buscarCoordenadas(enderecoDigitado);

      latitude = resultado.latitude;
      longitude = resultado.longitude;

      campoEndereco.value = resultado.nomeCompleto;

      frete.textContent = "Aguardando mapa";
      regiao.textContent = "Endereço localizado";
      distancia.textContent =
        `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      tempo.textContent = "Pronto para calcular";
    } catch (erro) {
      mostrarErro(erro.message);
    } finally {
      finalizarCarregamento();
    }
  });

  btnRota.addEventListener("click", () => {
    if (latitude === null || longitude === null) {
      alert("Primeiro localize um endereço.");
      return;
    }

    const destino = `${latitude},${longitude}`;
    const url =
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  });
});
