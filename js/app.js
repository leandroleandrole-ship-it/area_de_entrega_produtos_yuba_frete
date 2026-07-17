document.addEventListener("DOMContentLoaded", () => {
  const ui = {
    endereco: document.getElementById("endereco"),
    gps: document.getElementById("gps"),
    buscar: document.getElementById("buscar"),
    rota: document.getElementById("rota"),
    status: document.getElementById("status"),
    resultado: document.getElementById("resultado"),
    situacao: document.getElementById("situacao"),
    titulo: document.getElementById("titulo-resultado"),
    icone: document.getElementById("icone-resultado"),
    frete: document.getElementById("frete"),
    regiao: document.getElementById("regiao"),
    distancia: document.getElementById("distancia"),
    tempo: document.getElementById("tempo")
  };

  let regioes = [];
  let coordenadasAtuais = null;

  iniciar();

  async function iniciar() {
    try {
      const resposta = await fetch("./dados/delivery_regions.geojson?v=4");
      if (!resposta.ok) throw new Error("Arquivo de áreas não encontrado.");
      const geojson = await resposta.json();

      regioes = geojson.features
        .filter(feature => feature.geometry?.type === "Polygon")
        .map(feature => ({
          ...feature,
          area: areaDoPoligono(feature.geometry.coordinates[0])
        }));

      ui.status.textContent = `${regioes.length} áreas de entrega carregadas.`;
    } catch (erro) {
      ui.status.textContent = "Erro ao carregar as áreas de entrega.";
      console.error(erro);
    }
  }

  async function geocodificar(endereco) {
    const parametros = new URLSearchParams({
      q: endereco,
      format: "jsonv2",
      limit: "1",
      countrycodes: "br",
      addressdetails: "1",
      "accept-language": "pt-BR"
    });

    const resposta = await fetch(
      `https://nominatim.openstreetmap.org/search?${parametros}`,
      { headers: { Accept: "application/json" } }
    );

    if (!resposta.ok) throw new Error("Falha na consulta do endereço.");

    const dados = await resposta.json();
    if (!dados.length) throw new Error("Endereço não encontrado. Inclua número, cidade e estado.");

    return {
      lat: Number(dados[0].lat),
      lon: Number(dados[0].lon),
      endereco: dados[0].display_name
    };
  }

  async function geocodificarReverso(lat, lon) {
    const parametros = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: "jsonv2",
      "accept-language": "pt-BR"
    });

    const resposta = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${parametros}`,
      { headers: { Accept: "application/json" } }
    );

    if (!resposta.ok) return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    const dados = await resposta.json();
    return dados.display_name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }

  function pontoNoAnel(lon, lat, anel) {
    let dentro = false;

    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i];
      const [xj, yj] = anel[j];

      const cruza = ((yi > lat) !== (yj > lat)) &&
        (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);

      if (cruza) dentro = !dentro;
    }

    return dentro;
  }

  function pontoNoPoligono(lon, lat, rings) {
    if (!rings.length || !pontoNoAnel(lon, lat, rings[0])) return false;

    // Se estiver dentro de um "buraco" interno, não pertence ao polígono.
    for (let i = 1; i < rings.length; i++) {
      if (pontoNoAnel(lon, lat, rings[i])) return false;
    }

    return true;
  }

  function areaDoPoligono(anel) {
    let soma = 0;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      soma += (anel[j][0] * anel[i][1]) - (anel[i][0] * anel[j][1]);
    }
    return Math.abs(soma / 2);
  }

  function encontrarArea(lat, lon) {
    const encontradas = regioes.filter(feature =>
      pontoNoPoligono(lon, lat, feature.geometry.coordinates)
    );

    // Áreas de risco sempre têm prioridade.
    const risco = encontradas.find(feature => feature.properties.risk);
    if (risco) return risco;

    // Os polígonos são sobrepostos; a menor área é normalmente a zona mais específica.
    return encontradas
      .filter(feature => feature.properties.service)
      .sort((a, b) => a.area - b.area)[0] || null;
  }

  function moeda(valor) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(valor);
  }

  function referencia(feature) {
    return feature.properties.description || "Área definida no mapa de entregas";
  }

  function mostrarResultado(feature, lat, lon) {
    coordenadasAtuais = { lat, lon };
    ui.resultado.classList.remove("oculto", "erro");

    if (!feature) {
      ui.resultado.classList.add("erro");
      ui.situacao.textContent = "Fora da cobertura";
      ui.titulo.textContent = "Endereço não atendido";
      ui.icone.textContent = "!";
      ui.frete.textContent = "Indisponível";
      ui.regiao.textContent = "Fora das áreas cadastradas";
      ui.distancia.textContent = "Consulte a Produtos Yuba";
      ui.tempo.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      return;
    }

    if (feature.properties.risk) {
      ui.resultado.classList.add("erro");
      ui.situacao.textContent = "Área de risco";
      ui.titulo.textContent = "Entrega indisponível";
      ui.icone.textContent = "!";
      ui.frete.textContent = "Não atendemos";
      ui.regiao.textContent = feature.properties.name;
      ui.distancia.textContent = referencia(feature);
      ui.tempo.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      return;
    }

    ui.situacao.textContent = "Entrega disponível";
    ui.titulo.textContent = "Endereço dentro da cobertura";
    ui.icone.textContent = "✓";
    ui.frete.textContent = moeda(feature.properties.price);
    ui.regiao.textContent = feature.properties.name;
    ui.distancia.textContent = referencia(feature);
    ui.tempo.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }

  function definirCarregando(ativo, mensagem = "") {
    ui.buscar.disabled = ativo;
    ui.gps.disabled = ativo;
    ui.buscar.textContent = ativo ? "Aguarde..." : "🚚 Calcular frete";
    ui.status.textContent = mensagem;
  }

  ui.buscar.addEventListener("click", async () => {
    const endereco = ui.endereco.value.trim();
    if (!endereco) {
      ui.status.textContent = "Digite um endereço completo.";
      ui.endereco.focus();
      return;
    }

    definirCarregando(true, "Localizando endereço...");

    try {
      const local = await geocodificar(endereco);
      ui.endereco.value = local.endereco;

      const area = encontrarArea(local.lat, local.lon);
      mostrarResultado(area, local.lat, local.lon);
      ui.status.textContent = "Consulta concluída.";
    } catch (erro) {
      ui.status.textContent = erro.message;
    } finally {
      definirCarregando(false, ui.status.textContent);
    }
  });

  ui.endereco.addEventListener("keydown", event => {
    if (event.key === "Enter") ui.buscar.click();
  });

  ui.gps.addEventListener("click", () => {
    if (!navigator.geolocation) {
      ui.status.textContent = "Este navegador não oferece geolocalização.";
      return;
    }

    definirCarregando(true, "Obtendo sua localização...");

    navigator.geolocation.getCurrentPosition(
      async posicao => {
        const lat = posicao.coords.latitude;
        const lon = posicao.coords.longitude;

        try {
          ui.endereco.value = await geocodificarReverso(lat, lon);
          mostrarResultado(encontrarArea(lat, lon), lat, lon);
          ui.status.textContent = "Localização consultada.";
        } finally {
          definirCarregando(false, ui.status.textContent);
        }
      },
      erro => {
        const mensagens = {
          1: "Permissão de localização negada.",
          2: "Localização indisponível.",
          3: "A localização demorou demais."
        };
        definirCarregando(false, mensagens[erro.code] || "Não foi possível obter a localização.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });

  ui.rota.addEventListener("click", () => {
    if (!coordenadasAtuais) {
      ui.status.textContent = "Faça uma consulta primeiro.";
      return;
    }

    const destino = `${coordenadasAtuais.lat},${coordenadasAtuais.lon}`;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`,
      "_blank",
      "noopener,noreferrer"
    );
  });
});
