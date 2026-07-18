document.addEventListener("DOMContentLoaded", async () => {
  const cfg = window.YUBA_CONFIG;
  const $ = id => document.getElementById(id);
  const configured = cfg.SUPABASE_URL.startsWith("https://") && !cfg.SUPABASE_ANON_KEY.startsWith("COLE_");

  if (!configured) {
    $("login-status").textContent = "Configure js/config.js antes de usar o painel.";
    return;
  }

  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let rows = [];
  let map;
  let areasLayer;
  let editLayer;
  let drawControl;
  let selectedId = null;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));

  function status(message, error = false) {
    $("admin-status").textContent = message;
    $("admin-status").classList.toggle("status-erro", error);
  }

  function toggle(on) {
    $("login-card").classList.toggle("oculto", on);
    $("admin-conteudo").classList.toggle("oculto", !on);
    if (on) setTimeout(() => map?.invalidateSize(), 100);
  }

  async function session() {
    const { data } = await db.auth.getSession();
    toggle(Boolean(data.session));
    if (data.session) {
      initMap();
      await load();
    }
  }

  $("entrar").onclick = async () => {
    $("login-status").textContent = "Entrando...";
    const { error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("senha").value
    });

    $("login-status").textContent = error ? error.message : "Login realizado.";
    if (!error) {
      toggle(true);
      initMap();
      await load();
    }
  };

  $("sair").onclick = async () => {
    await db.auth.signOut();
    toggle(false);
  };

  function initMap() {
    if (map) return;

    map = L.map("mapa-admin").setView(
      [cfg.DISTRIBUTION_CENTER.lat, cfg.DISTRIBUTION_CENTER.lon],
      11
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(map);

    L.marker([cfg.DISTRIBUTION_CENTER.lat, cfg.DISTRIBUTION_CENTER.lon])
      .addTo(map)
      .bindPopup(cfg.DISTRIBUTION_CENTER.name);

    areasLayer = L.featureGroup().addTo(map);
    editLayer = L.featureGroup().addTo(map);

    drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: "#075838", weight: 3, fillOpacity: 0.25 }
        },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false
      },
      edit: {
        featureGroup: editLayer,
        edit: true,
        remove: false
      }
    });

    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, event => {
      editLayer.clearLayers();
      editLayer.addLayer(event.layer);
      openNewForm();
      status("Polígono desenhado. Preencha os dados e salve.");
    });

    map.on(L.Draw.Event.EDITED, () => {
      status("Formato alterado. Clique em “Salvar área” para publicar.");
    });
  }

  async function load() {
    status("Carregando áreas...");

    const { data, error } = await db
      .from("delivery_areas")
      .select("*")
      .order("price", { ascending: true, nullsFirst: false });

    if (error) {
      status(error.message, true);
      return;
    }

    rows = data || [];
    renderList();
    renderMap();
    $("contador-areas").textContent = `${rows.length} áreas`;
    status(`${rows.length} áreas carregadas.`);
  }

  function renderList() {
    $("lista-areas").innerHTML = rows.map(row => `
      <article class="area-item ${row.risk ? "risco" : ""} ${row.active ? "" : "inativa"}" data-id="${esc(row.id)}">
        <button class="area-selecionar" type="button">
          <span class="area-cor" style="background:${esc(row.color || (row.risk ? "#9ea5aa" : "#159447"))}"></span>
          <span>
            <strong>${esc(row.label || row.name)}</strong>
            <small>${row.risk ? "Área de risco" : formatMoney(row.price)} · ${row.active ? "Ativa" : "Inativa"}</small>
          </span>
        </button>
      </article>
    `).join("");
  }

  function renderMap() {
    areasLayer.clearLayers();

    const features = rows
      .filter(row => row.geometry)
      .map(row => ({
        type: "Feature",
        properties: row,
        geometry: row.geometry
      }));

    if (!features.length) return;

    L.geoJSON(
      { type: "FeatureCollection", features },
      {
        style: feature => ({
          color: feature.properties.color || (feature.properties.risk ? "#9ea5aa" : "#159447"),
          weight: 2,
          fillColor: feature.properties.color || (feature.properties.risk ? "#9ea5aa" : "#159447"),
          fillOpacity: feature.properties.active ? 0.35 : 0.12,
          dashArray: feature.properties.active ? null : "6 6"
        }),
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(feature.properties.label || feature.properties.name);
          layer.on("click", () => selectArea(feature.properties.id));
          areasLayer.addLayer(layer);
        }
      }
    );

    if (areasLayer.getLayers().length) {
      map.fitBounds(areasLayer.getBounds(), { padding: [20, 20] });
    }
  }

  function openNewForm() {
    selectedId = null;
    $("editor-form").classList.remove("oculto");
    $("editor-titulo").textContent = "Nova área";
    $("area-id").value = "";
    $("area-nome").value = "";
    $("area-label").value = "";
    $("area-preco").value = "";
    $("area-cor").value = "#159447";
    $("area-risco").checked = false;
    $("area-ativa").checked = true;
    $("excluir-area").classList.add("oculto");
  }

  function selectArea(id) {
    const row = rows.find(item => item.id === id);
    if (!row) return;

    selectedId = id;
    $("editor-form").classList.remove("oculto");
    $("editor-titulo").textContent = "Editar área";
    $("area-id").value = row.id;
    $("area-nome").value = row.name || "";
    $("area-label").value = row.label || "";
    $("area-preco").value = row.price ?? "";
    $("area-cor").value = row.color || (row.risk ? "#9ea5aa" : "#159447");
    $("area-risco").checked = Boolean(row.risk);
    $("area-ativa").checked = row.active !== false;
    $("excluir-area").classList.remove("oculto");

    editLayer.clearLayers();

    if (row.geometry) {
      const temp = L.geoJSON({
        type: "Feature",
        properties: {},
        geometry: row.geometry
      });

      temp.eachLayer(layer => {
        layer.setStyle?.({
          color: row.color || "#075838",
          weight: 4,
          fillOpacity: 0.22
        });
        editLayer.addLayer(layer);
      });

      if (editLayer.getLayers().length) {
        map.fitBounds(editLayer.getBounds(), { padding: [30, 30] });
      }
    }

    document.querySelectorAll(".area-item").forEach(item => {
      item.classList.toggle("selecionada", item.dataset.id === id);
    });
  }

  function closeEditor() {
    selectedId = null;
    editLayer.clearLayers();
    $("editor-form").classList.add("oculto");
    document.querySelectorAll(".area-item").forEach(item => item.classList.remove("selecionada"));
  }

  function currentGeometry() {
    const layers = editLayer.getLayers();
    if (!layers.length) return null;

    const geo = layers[0].toGeoJSON();
    return geo.geometry;
  }

  function createId() {
    if (crypto?.randomUUID) return `area-${crypto.randomUUID()}`;
    return `area-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function saveArea() {
    const name = $("area-nome").value.trim();
    const label = $("area-label").value.trim();
    const risk = $("area-risco").checked;
    const geometry = currentGeometry();

    if (!name || !label) {
      status("Preencha o nome interno e o nome exibido.", true);
      return;
    }

    if (!geometry) {
      status("Desenhe ou selecione um polígono no mapa.", true);
      return;
    }

    const payload = {
      id: selectedId || createId(),
      name,
      label,
      price: risk ? null : Number($("area-preco").value),
      risk,
      active: $("area-ativa").checked,
      color: $("area-cor").value,
      geometry,
      updated_at: new Date().toISOString()
    };

    if (!risk && (!Number.isFinite(payload.price) || payload.price < 0)) {
      status("Informe um valor de frete válido.", true);
      return;
    }

    status("Salvando área...");

    const query = selectedId
      ? db.from("delivery_areas").update(payload).eq("id", selectedId)
      : db.from("delivery_areas").insert(payload);

    const { error } = await query;

    if (error) {
      status(error.message, true);
      return;
    }

    status("Área salva e publicada para todos os clientes.");
    closeEditor();
    await load();
  }

  async function deleteArea() {
    if (!selectedId) return;
    const row = rows.find(item => item.id === selectedId);
    if (!confirm(`Excluir definitivamente “${row?.label || selectedId}”?`)) return;

    status("Excluindo área...");
    const { error } = await db.from("delivery_areas").delete().eq("id", selectedId);

    if (error) {
      status(error.message, true);
      return;
    }

    status("Área excluída.");
    closeEditor();
    await load();
  }

  async function importCurrentAreas() {
    if (!confirm("Importar os polígonos atuais do arquivo GeoJSON para o Supabase?")) return;

    status("Importando áreas atuais...");
    try {
      const response = await fetch("./dados/delivery_regions.geojson?v=1000");
      if (!response.ok) throw new Error("Não foi possível abrir o GeoJSON atual.");
      const geojson = await response.json();

      const currentById = Object.fromEntries(rows.map(row => [row.id, row]));
      const payload = geojson.features.map(feature => {
        const id = feature.properties.id;
        const existing = currentById[id] || {};
        return {
          id,
          name: existing.name || feature.properties.name || feature.properties.label || id,
          label: existing.label || feature.properties.label || feature.properties.name || id,
          price: existing.price ?? feature.properties.price ?? null,
          risk: existing.risk ?? Boolean(feature.properties.risk),
          active: existing.active ?? feature.properties.active !== false,
          color: existing.color || feature.properties.color || (feature.properties.risk ? "#9ea5aa" : "#159447"),
          geometry: feature.geometry,
          updated_at: new Date().toISOString()
        };
      });

      const { error } = await db.from("delivery_areas").upsert(payload, { onConflict: "id" });
      if (error) throw error;

      status(`${payload.length} áreas importadas para o banco.`);
      await load();
    } catch (error) {
      status(error.message || "Falha na importação.", true);
    }
  }

  function formatMoney(value) {
    if (value === null || value === undefined) return "Sem valor";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(value);
  }

  $("lista-areas").onclick = event => {
    const item = event.target.closest(".area-item");
    if (item) selectArea(item.dataset.id);
  };

  $("nova-area").onclick = () => {
    editLayer.clearLayers();
    openNewForm();
    status("Use a ferramenta de polígono no canto superior direito do mapa.");
  };

  $("cancelar-edicao").onclick = closeEditor;
  $("salvar-area").onclick = saveArea;
  $("excluir-area").onclick = deleteArea;
  $("recarregar").onclick = load;
  $("importar-atuais").onclick = importCurrentAreas;
  $("area-risco").onchange = () => {
    $("area-preco").disabled = $("area-risco").checked;
  };

  session();
});
