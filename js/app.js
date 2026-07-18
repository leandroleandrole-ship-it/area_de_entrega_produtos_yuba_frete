document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const $ = id => document.getElementById(id);
  const cfg = window.YUBA_CONFIG || {};
  const ui = {
    endereco: $("endereco"),
    limpar: $("limpar"),
    gps: $("gps"),
    buscar: $("buscar"),
    rota: $("rota"),
    status: $("status"),
    resultado: $("resultado"),
    situacao: $("situacao"),
    titulo: $("titulo-resultado"),
    icone: $("icone-resultado"),
    frete: $("frete"),
    regiao: $("regiao"),
    distancia: $("distancia"),
    tempo: $("tempo"),
    observacao: $("observacao")
  };

  let db = null;
  let areas = [];
  let atual = null;
  let map = null;
  let marker = null;
  let geoLayer = null;
  let centerMarker = null;
  // Origem fixa e imutável para todos os cálculos de rota e distância.
  const distributionCenter = Object.freeze({
    name: "Centro de Distribuição Produtos Yuba",
    address: "Rua Luiza Rosa Paz Landim, 229, Vila Curuçá Velha, São Paulo - SP",
    lat: -23.50578607041293,
    lon: -46.41478500476243
  });

  const money = value =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(value);

  function ensureClockElement() {
    let clock = $("relogio-digital");
    if (clock) return clock;

    const header = document.querySelector(".topo");
    const adminButton = document.querySelector(".botao-admin");
    if (!header) return null;

    clock = document.createElement("div");
    clock.id = "relogio-digital";
    clock.className = "relogio-digital";
    clock.setAttribute("aria-label", "Horário atual");
    clock.textContent = "--:--:--";
    header.insertBefore(clock, adminButton || null);
    return clock;
  }

  function updateClock() {
    const clock = ensureClockElement();
    if (!clock) return;
    clock.textContent = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());
  }

  updateClock();
  window.setInterval(updateClock, 1000);

  function setStatus(message) {
    if (ui.status) ui.status.textContent = message || "";
  }

  function toBoolean(value, defaultValue = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "sim", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "não", "nao", "no", "off", ""].includes(normalized)) return false;
    }
    return defaultValue;
  }

  function parsePrice(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;

    let text = String(value)
      .trim()
      .replace(/R\$/gi, "")
      .replace(/\s/g, "");

    if (text.includes(",") && text.includes(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else if (text.includes(",")) {
      text = text.replace(",", ".");
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeProperties(properties = {}) {
    return {
      ...properties,
      label: properties.label || properties.name || "Área de entrega",
      risk: toBoolean(properties.risk, false),
      active: toBoolean(properties.active, true),
      service: toBoolean(properties.service, !toBoolean(properties.risk, false)),
      price: parsePrice(properties.price)
    };
  }

  function normalizeGeometry(geometry) {
    if (!geometry) return null;

    if (typeof geometry === "string") {
      try {
        geometry = JSON.parse(geometry);
      } catch {
        return null;
      }
    }

    if (geometry.type === "Feature") geometry = geometry.geometry;

    if (!geometry?.type || !Array.isArray(geometry.coordinates)) return null;
    if (!["Polygon", "MultiPolygon"].includes(geometry.type)) return null;

    return geometry;
  }

  function pointOnSegment(x, y, x1, y1, x2, y2, epsilon = 1e-10) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    // Anéis GeoJSON normalmente repetem o primeiro ponto no final. Esse
    // segmento tem comprimento zero e não pode considerar qualquer endereço
    // como estando sobre a borda do polígono.
    if (lengthSquared <= epsilon * epsilon) {
      const pointDistanceSquared = (x - x1) ** 2 + (y - y1) ** 2;
      return pointDistanceSquared <= epsilon * epsilon;
    }

    const cross = (x - x1) * dy - (y - y1) * dx;
    if (Math.abs(cross) > epsilon) return false;

    const dot = (x - x1) * dx + (y - y1) * dy;
    return dot >= 0 && dot <= lengthSquared;
  }

  function inRing(x, y, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;

    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];

      if (pointOnSegment(x, y, xi, yi, xj, yj)) return true;

      const intersects =
        ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);

      if (intersects) inside = !inside;
    }

    return inside;
  }

  function inPolygonCoordinates(x, y, rings) {
    if (!Array.isArray(rings) || !rings.length) return false;
    if (!inRing(x, y, rings[0])) return false;

    for (let i = 1; i < rings.length; i += 1) {
      if (inRing(x, y, rings[i])) return false;
    }

    return true;
  }

  function geometryContains(geometry, x, y) {
    const normalized = normalizeGeometry(geometry);
    if (!normalized) return false;

    if (normalized.type === "Polygon") {
      return inPolygonCoordinates(x, y, normalized.coordinates);
    }

    return normalized.coordinates.some(polygon =>
      inPolygonCoordinates(x, y, polygon)
    );
  }

  function ringArea(ring) {
    if (!Array.isArray(ring) || ring.length < 3) {
      return Number.POSITIVE_INFINITY;
    }

    let sum = 0;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }

    return Math.abs(sum / 2);
  }

  function geometryArea(geometry) {
    const normalized = normalizeGeometry(geometry);
    if (!normalized) return Number.POSITIVE_INFINITY;

    if (normalized.type === "Polygon") {
      return ringArea(normalized.coordinates[0]);
    }

    return normalized.coordinates.reduce(
      (total, polygon) => total + ringArea(polygon[0]),
      0
    );
  }

  function createMap() {
    if (!window.L) {
      throw new Error("A biblioteca do mapa não foi carregada.");
    }

    const fallbackLat = Number.isFinite(distributionCenter.lat)
      ? distributionCenter.lat
      : -23.5505;
    const fallbackLon = Number.isFinite(distributionCenter.lon)
      ? distributionCenter.lon
      : -46.6333;

    distributionCenter.lat = fallbackLat;
    distributionCenter.lon = fallbackLon;

    map = L.map("mapa", { zoomControl: true }).setView(
      [fallbackLat, fallbackLon],
      11
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(map);

    centerMarker = L.marker([distributionCenter.lat, distributionCenter.lon])
      .addTo(map)
      .bindPopup(distributionCenter.name);

    if ($("centro-nome")) {
      $("centro-nome").textContent =
        distributionCenter.name;
    }

    if ($("centro-endereco")) {
      $("centro-endereco").textContent = distributionCenter.address;
    }

    window.setTimeout(() => map.invalidateSize(), 150);
  }

  function createDatabaseClient() {
    const url = String(cfg.SUPABASE_URL || "").trim();
    const key = String(cfg.SUPABASE_ANON_KEY || "").trim();

    const valid =
      url.startsWith("https://") &&
      key.length > 20 &&
      !url.includes("COLE_AQUI") &&
      !key.includes("COLE_AQUI");

    if (!valid || !window.supabase) return null;

    try {
      return window.supabase.createClient(url, key);
    } catch (error) {
      console.error("Falha ao iniciar Supabase:", error);
      return null;
    }
  }

  function rowToFeature(row) {
    const geometry = normalizeGeometry(row.geometry);
    if (!geometry) return null;

    return {
      type: "Feature",
      properties: normalizeProperties(row),
      geometry,
      area: geometryArea(geometry)
    };
  }

  async function readDatabaseAreas() {
    if (!db) return [];

    const { data, error } = await db
      .from("delivery_areas")
      .select("*")
      .order("price", { ascending: true, nullsFirst: false });

    if (error) throw error;

    return (data || [])
      .map(rowToFeature)
      .filter(Boolean);
  }

  async function readGeoJsonAreas() {
    const response = await fetch("./dados/delivery_regions.geojson?v=1200", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Arquivo dados/delivery_regions.geojson não encontrado.");
    }

    const geojson = await response.json();

    return (geojson.features || [])
      .map(feature => {
        const geometry = normalizeGeometry(feature.geometry);
        if (!geometry) return null;

        return {
          ...feature,
          properties: normalizeProperties(feature.properties || {}),
          geometry,
          area: geometryArea(geometry)
        };
      })
      .filter(Boolean);
  }

  function renderAreas() {
    if (!map) return;

    if (geoLayer) {
      geoLayer.remove();
      geoLayer = null;
    }

    geoLayer = L.geoJSON(
      { type: "FeatureCollection", features: areas },
      {
        // Mesmos parâmetros do Editor visual.
        style: feature => ({
          color:
            feature.properties.color ||
            (feature.properties.risk ? "#9ea5aa" : "#159447"),
          weight: 2,
          fillColor:
            feature.properties.color ||
            (feature.properties.risk ? "#9ea5aa" : "#159447"),
          fillOpacity: feature.properties.active ? 0.35 : 0.12,
          dashArray: feature.properties.active ? null : "6 6"
        }),
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(
            feature.properties.label || feature.properties.name || "Área"
          );

          layer.bindPopup(
            `<strong>${feature.properties.label || "Área"}</strong><br>` +
            `${
              feature.properties.risk
                ? "Não atendemos"
                : Number.isFinite(feature.properties.price)
                  ? money(feature.properties.price)
                  : "Frete não configurado"
            }`
          );
        }
      }
    ).addTo(map);

    if (geoLayer.getLayers().length) {
      map.fitBounds(geoLayer.getBounds(), { padding: [20, 20] });
    }

    window.setTimeout(() => map.invalidateSize(), 100);
  }

  async function loadAreas() {
    setStatus("Carregando áreas de entrega...");

    let databaseAreas = [];

    try {
      databaseAreas = await readDatabaseAreas();
    } catch (error) {
      console.error("Falha ao carregar áreas do Supabase:", error);
    }

    if (databaseAreas.length) {
      areas = databaseAreas;
      renderAreas();
      setStatus(`${areas.length} áreas carregadas.`);
      return;
    }

    try {
      areas = await readGeoJsonAreas();
      renderAreas();
      setStatus(`${areas.length} áreas carregadas pelo arquivo local.`);
    } catch (error) {
      console.error("Falha ao carregar GeoJSON:", error);
      areas = [];
      setStatus(error.message || "Não foi possível carregar as áreas.");
    }
  }

  function findArea(lat, lon) {
    const matches = areas.filter(feature => {
      const properties = normalizeProperties(feature.properties || {});
      feature.properties = properties;

      return properties.active && geometryContains(feature.geometry, lon, lat);
    });

    // As regiões antigas têm sobreposições intencionais. No Editor visual
    // elas são carregadas por preço crescente, então a região de maior preço
    // fica visualmente por cima. Depois de corrigir o teste geométrico, esta
    // mesma regra retorna Região Preta/R$33 na Av. Paulista e Extremo Leste/
    // R$18 no Jardim Helena, sem confundir todos os polígonos.
    const normalArea = matches
      .filter(feature =>
        feature.properties.risk === false &&
        feature.properties.service !== false &&
        Number.isFinite(feature.properties.price)
      )
      .sort((a, b) => {
        const priceDifference = b.properties.price - a.properties.price;
        if (priceDifference !== 0) return priceDifference;
        return (a.area ?? geometryArea(a.geometry)) -
          (b.area ?? geometryArea(b.geometry));
      })[0];

    if (normalArea) return normalArea;

    return matches
      .filter(feature => feature.properties.risk === true)
      .sort(
        (a, b) =>
          (a.area ?? geometryArea(a.geometry)) -
          (b.area ?? geometryArea(b.geometry))
      )[0] || null;
  }

  async function geocode(query) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      countrycodes: "br",
      addressdetails: "1",
      "accept-language": "pt-BR"
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) throw new Error("Falha ao consultar o endereço.");

    const data = await response.json();
    if (!data.length) throw new Error("Endereço não encontrado.");

    return {
      lat: Number(data[0].lat),
      lon: Number(data[0].lon),
      address: data[0].display_name
    };
  }

  async function reverseGeocode(lat, lon) {
    const params = new URLSearchParams({
      lat,
      lon,
      format: "jsonv2",
      "accept-language": "pt-BR"
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) {
      throw new Error("Falha ao identificar sua localização.");
    }

    const data = await response.json();
    return data.display_name || `${lat}, ${lon}`;
  }

  async function resolveDistributionCenter() {
    // Não geocodifica nem altera a origem. A coordenada fornecida pelo usuário
    // é usada diretamente em todas as consultas.
    return distributionCenter;
  }

  async function calculateRoadRoute(destinationLat, destinationLon) {
    const center = await resolveDistributionCenter();

    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${center.lon},${center.lat};${destinationLon},${destinationLat}` +
        `?overview=false&steps=false`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Rota rodoviária indisponível.");
      const data = await response.json();
      const route = data.routes?.[0];
      if (!route) throw new Error("Rota não encontrada.");

      return {
        km: route.distance / 1000,
        minutes: Math.max(1, Math.round(route.duration / 60)),
        source: "road"
      };
    } catch (error) {
      console.warn("Usando distância em linha reta como contingência.", error);
      const km = distance(center.lat, center.lon, destinationLat, destinationLon);
      return {
        km,
        minutes: Math.max(20, Math.round((km / 22) * 60 + 15)),
        source: "straight"
      };
    }
  }

  function distance(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371;
    const radians = value => (value * Math.PI) / 180;
    const deltaLat = radians(lat2 - lat1);
    const deltaLon = radians(lon2 - lon1);

    const value =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(radians(lat1)) *
        Math.cos(radians(lat2)) *
        Math.sin(deltaLon / 2) ** 2;

    return (
      earthRadius *
      2 *
      Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
    );
  }

  async function showResult(feature, lat, lon) {
    atual = { lat, lon };

    if (marker) marker.remove();

    marker = L.marker([lat, lon], { zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup("Endereço consultado")
      .openPopup();

    map.setView([lat, lon], 14);

    const routeInfo = await calculateRoadRoute(lat, lon);
    const km = routeInfo.km;

    ui.resultado.classList.remove("oculto", "erro");

    if (!feature || feature.properties.risk) {
      ui.resultado.classList.add("erro");
      ui.situacao.textContent = feature ? "Área de risco" : "Fora da cobertura";
      ui.titulo.textContent = "Entrega indisponível";
      ui.icone.textContent = "!";
      ui.frete.textContent = feature ? "Não atendemos" : "Indisponível";
      ui.regiao.textContent =
        feature?.properties.label || "Fora das áreas cadastradas";
      ui.distancia.textContent = `${km.toFixed(1).replace(".", ",")} km`;
      ui.tempo.textContent = "Não aplicável";
      ui.observacao.textContent =
        feature?.properties.description || "Consulte a Produtos Yuba.";
      return;
    }

    ui.situacao.textContent = "Entrega disponível";
    ui.titulo.textContent = "Endereço dentro da cobertura";
    ui.icone.textContent = "✓";
    ui.frete.textContent = Number.isFinite(feature.properties.price)
      ? money(feature.properties.price)
      : "Frete não configurado";
    ui.regiao.textContent = feature.properties.label;
    ui.distancia.textContent = `${km.toFixed(1).replace(".", ",")} km`;
    ui.tempo.textContent = `aprox. ${routeInfo.minutes} min`;
    ui.observacao.textContent = routeInfo.source === "road"
      ? "Distância e tempo estimados pela rota rodoviária desde a Rua Luiza Rosa Paz Landim, 229."
      : "Rota rodoviária indisponível: distância em linha reta usada temporariamente.";
  }

  function setLoading(active, message = "") {
    ui.buscar.disabled = active;
    ui.gps.disabled = active;
    ui.buscar.textContent = active ? "Aguarde..." : "🚚 Calcular frete";
    setStatus(message);
  }

  function attachEvents() {
    ui.buscar.addEventListener("click", async () => {
      const query = ui.endereco.value.trim();
      if (!query) {
        ui.endereco.focus();
        return;
      }

      setLoading(true, "Localizando endereço...");

      try {
        const location = await geocode(query);
        ui.endereco.value = location.address;
        const area = findArea(location.lat, location.lon);
        await showResult(area, location.lat, location.lon);
        setStatus(
          area
            ? `Consulta concluída: ${area.properties.label}.`
            : "Consulta concluída: endereço fora da cobertura."
        );
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Não foi possível calcular o frete.");
      } finally {
        setLoading(false, ui.status.textContent);
      }
    });

    ui.endereco.addEventListener("keydown", event => {
      if (event.key === "Enter") ui.buscar.click();
    });

    ui.limpar.addEventListener("click", () => {
      ui.endereco.value = "";
      ui.endereco.focus();
    });

    ui.gps.addEventListener("click", () => {
      if (!navigator.geolocation) {
        setStatus("Geolocalização indisponível.");
        return;
      }

      setLoading(true, "Obtendo sua localização...");

      navigator.geolocation.getCurrentPosition(
        async position => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          try {
            ui.endereco.value = await reverseGeocode(lat, lon);
            const area = findArea(lat, lon);
            await showResult(area, lat, lon);
            setStatus("Localização consultada.");
          } catch (error) {
            console.error(error);
            setStatus(
              error.message || "Não foi possível consultar sua localização."
            );
          } finally {
            setLoading(false, ui.status.textContent);
          }
        },
        error => {
          const messages = {
            1: "Permissão de localização negada.",
            2: "Localização indisponível.",
            3: "A localização demorou demais."
          };

          setLoading(
            false,
            messages[error.code] || "Não foi possível obter sua localização."
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000
        }
      );
    });

    ui.rota.addEventListener("click", () => {
      if (!atual) return;

      resolveDistributionCenter().then(center => {
        window.open(
          `https://www.google.com/maps/dir/?api=1&origin=${center.lat},${center.lon}` +
            `&destination=${atual.lat},${atual.lon}`,
          "_blank"
        );
      });
    });

    $("como-funciona")?.addEventListener("click", () => {
      const modal = $("modal-ajuda");
      if (typeof modal?.showModal === "function") modal.showModal();
      else modal?.setAttribute("open", "");
    });

    $("fechar-ajuda")?.addEventListener("click", () => {
      const modal = $("modal-ajuda");
      if (typeof modal?.close === "function") modal.close();
      else modal?.removeAttribute("open");
    });
  }

  // Os eventos são conectados antes de qualquer acesso ao mapa ou ao banco.
  // Assim, uma falha externa não deixa os botões inoperantes.
  attachEvents();

  try {
    createMap();
  } catch (error) {
    console.error("Falha ao iniciar mapa:", error);
    setStatus(error.message || "Não foi possível iniciar o mapa.");
    return;
  }

  db = createDatabaseClient();

  resolveDistributionCenter();
  loadAreas();

  if (db) {
    db.channel("delivery-areas-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_areas"
        },
        () => loadAreas()
      )
      .subscribe();
  }
});
