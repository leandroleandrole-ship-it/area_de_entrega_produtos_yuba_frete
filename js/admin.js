document.addEventListener("DOMContentLoaded", async () => {
  const cfg = window.YUBA_CONFIG || {};
  const $ = id => document.getElementById(id);
  const supabaseUrl = String(cfg.SUPABASE_URL || "").trim();
  const supabaseKey = String(cfg.SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("COLE_AQUI") || supabaseKey.includes("COLE_AQUI")) {
    $("login-status").textContent = "A URL ou a chave do Supabase não foi encontrada em js/config.js.";
    return;
  }

  let db;
  try {
    db = supabase.createClient(supabaseUrl, supabaseKey);
  } catch (erro) {
    $("login-status").textContent = "Não foi possível iniciar a conexão com o Supabase.";
    console.error(erro);
    return;
  }

  let rows = [];
  let historyRows = [];
  let map;
  let areasLayer;
  let editLayer;
  let selectedId = null;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));

  const clone = value => JSON.parse(JSON.stringify(value));

  function status(message, error = false) {
    $("admin-status").textContent = message;
    $("admin-status").classList.toggle("status-erro", error);
  }

  function toggle(on) {
    $("login-card").classList.toggle("oculto", on);
    $("admin-conteudo").classList.toggle("oculto", !on);
    if (on) setTimeout(() => map?.invalidateSize(), 120);
  }

  function atualizarBotaoTelaCheia() {
    const card = document.querySelector(".mapa-editor-card");
    const button = $("alternar-tela-cheia");
    if (!card || !button) return;

    const active =
      document.fullscreenElement === card ||
      card.classList.contains("mapa-editor-expandido");

    button.textContent = active ? "✕ Sair da tela cheia" : "⛶ Tela cheia";
    button.setAttribute("aria-pressed", String(active));

    window.setTimeout(() => map?.invalidateSize(), 120);
    window.setTimeout(() => map?.invalidateSize(), 350);
  }

  async function alternarTelaCheia() {
    const card = document.querySelector(".mapa-editor-card");
    if (!card) return;

    try {
      if (document.fullscreenElement === card) {
        await document.exitFullscreen();
        return;
      }

      if (card.requestFullscreen) {
        await card.requestFullscreen();
        return;
      }
    } catch (erro) {
      console.warn("Fullscreen nativo indisponível; usando modo expandido.", erro);
    }

    card.classList.toggle("mapa-editor-expandido");
    document.body.classList.toggle(
      "mapa-editor-body-bloqueado",
      card.classList.contains("mapa-editor-expandido")
    );
    atualizarBotaoTelaCheia();
  }

  $("alternar-tela-cheia").onclick = alternarTelaCheia;

  document.addEventListener("fullscreenchange", () => {
    const card = document.querySelector(".mapa-editor-card");
    if (card && document.fullscreenElement !== card) {
      card.classList.remove("mapa-editor-expandido");
      document.body.classList.remove("mapa-editor-body-bloqueado");
    }
    atualizarBotaoTelaCheia();
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    const card = document.querySelector(".mapa-editor-card");
    if (card?.classList.contains("mapa-editor-expandido")) {
      card.classList.remove("mapa-editor-expandido");
      document.body.classList.remove("mapa-editor-body-bloqueado");
      atualizarBotaoTelaCheia();
    }
  });

  async function getUserEmail() {
    const { data } = await db.auth.getUser();
    return data?.user?.email || "administrador";
  }

  async function session() {
    const { data } = await db.auth.getSession();
    toggle(Boolean(data.session));
    if (data.session) {
      initMap();
      await loadAll();
    }
  }

  $("entrar").onclick = async () => {
    $("login-status").textContent = "Entrando...";
    try {
      const { error } = await db.auth.signInWithPassword({
        email: $("email").value.trim(),
        password: $("senha").value
      });
      $("login-status").textContent = error ? error.message : "Login realizado.";
      if (!error) {
        toggle(true);
        initMap();
        await loadAll();
      }
    } catch (erro) {
      $("login-status").textContent = "Falha de conexão com o Supabase.";
      console.error(erro);
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

    map.addControl(new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: "#075838", weight: 3, fillOpacity: 0.25 }
        },
        polyline: false, rectangle: false, circle: false,
        circlemarker: false, marker: false
      },
      edit: {
        featureGroup: editLayer,
        edit: true,
        remove: false
      }
    }));

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

  async function loadAll() {
    await loadAreas();
    await loadHistory();
  }

  async function loadAreas() {
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

  async function loadHistory() {
    const { data, error } = await db
      .from("delivery_area_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      $("historico-lista").innerHTML = '<p class="texto-suave">Execute o arquivo SQL v1.1 para ativar o histórico.</p>';
      return;
    }

    historyRows = data || [];
    $("historico-lista").innerHTML = historyRows.length
      ? historyRows.map(item => `
          <article class="historico-item">
            <strong>${esc(actionLabel(item.action))}</strong>
            <span>${esc(item.area_label || item.area_id || "Área")}</span>
            <small>${formatDate(item.created_at)} · ${esc(item.changed_by || "administrador")}</small>
          </article>
        `).join("")
      : '<p class="texto-suave">Nenhuma alteração registrada.</p>';
  }

  function filteredRows() {
    const term = $("buscar-area").value.trim().toLowerCase();
    const filter = $("filtro-status").value;

    return rows.filter(row => {
      const text = `${row.name || ""} ${row.label || ""}`.toLowerCase();
      const textOk = !term || text.includes(term);
      const statusOk =
        filter === "todas" ||
        (filter === "ativas" && row.active !== false && !row.risk) ||
        (filter === "inativas" && row.active === false) ||
        (filter === "risco" && row.risk);
      return textOk && statusOk;
    });
  }

  function renderList() {
    const visible = filteredRows();
    $("lista-areas").innerHTML = visible.length
      ? visible.map(row => `
          <article class="area-item ${row.risk ? "risco" : ""} ${row.active ? "" : "inativa"}" data-id="${esc(row.id)}">
            <button class="area-selecionar" type="button">
              <span class="area-cor" style="background:${esc(row.color || (row.risk ? "#9ea5aa" : "#159447"))}"></span>
              <span>
                <strong>${esc(row.label || row.name)}</strong>
                <small>${row.risk ? "Área de risco" : formatMoney(row.price)} · ${row.active ? "Ativa" : "Inativa"}</small>
              </span>
            </button>
          </article>
        `).join("")
      : '<p class="texto-suave">Nenhuma área encontrada.</p>';
  }

  function renderMap() {
    areasLayer.clearLayers();

    const features = rows.filter(row => row.geometry).map(row => ({
      type: "Feature",
      properties: row,
      geometry: row.geometry
    }));

    if (!features.length) return;

    const layer = L.geoJSON({ type: "FeatureCollection", features }, {
      style: feature => ({
        color: feature.properties.color || (feature.properties.risk ? "#9ea5aa" : "#159447"),
        weight: 2,
        fillColor: feature.properties.color || (feature.properties.risk ? "#9ea5aa" : "#159447"),
        fillOpacity: feature.properties.active ? 0.35 : 0.12,
        dashArray: feature.properties.active ? null : "6 6"
      }),
      onEachFeature: (feature, leafletLayer) => {
        leafletLayer.bindTooltip(feature.properties.label || feature.properties.name);
        leafletLayer.on("click", () => selectArea(feature.properties.id));
      }
    });

    layer.eachLayer(item => areasLayer.addLayer(item));
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
    $("area-preco").disabled = false;
    $("excluir-area").classList.add("oculto");
    $("duplicar-area").disabled = true;
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
    $("area-preco").disabled = Boolean(row.risk);
    $("excluir-area").classList.remove("oculto");
    $("duplicar-area").disabled = false;

    editLayer.clearLayers();
    if (row.geometry) {
      const temp = L.geoJSON({ type: "Feature", properties: {}, geometry: row.geometry });
      temp.eachLayer(layer => {
        layer.setStyle?.({ color: row.color || "#075838", weight: 4, fillOpacity: 0.22 });
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
    $("duplicar-area").disabled = true;
    document.querySelectorAll(".area-item").forEach(item => item.classList.remove("selecionada"));
  }

  function currentGeometry() {
    const layer = editLayer.getLayers()[0];
    return layer ? layer.toGeoJSON().geometry : null;
  }

  function createId() {
    return crypto?.randomUUID
      ? `area-${crypto.randomUUID()}`
      : `area-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function offsetGeometry(geometry, delta = 0.002) {
    const copy = clone(geometry);
    const move = coords => {
      if (typeof coords[0] === "number") return [coords[0] + delta, coords[1] + delta];
      return coords.map(move);
    };
    copy.coordinates = move(copy.coordinates);
    return copy;
  }

  async function recordHistory(action, area, previousData = null) {
    try {
      await db.from("delivery_area_history").insert({
        area_id: area?.id || previousData?.id || null,
        area_label: area?.label || previousData?.label || area?.name || previousData?.name || null,
        action,
        changed_by: await getUserEmail(),
        previous_data: previousData,
        new_data: area
      });
    } catch (erro) {
      console.warn("Histórico não registrado:", erro);
    }
  }

  async function saveArea() {
    const name = $("area-nome").value.trim();
    const label = $("area-label").value.trim();
    const risk = $("area-risco").checked;
    const geometry = currentGeometry();

    if (!name || !label) return status("Preencha o nome interno e o nome exibido.", true);
    if (!geometry) return status("Desenhe ou selecione um polígono no mapa.", true);

    const previous = selectedId ? clone(rows.find(item => item.id === selectedId)) : null;
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
      return status("Informe um valor de frete válido.", true);
    }

    status("Salvando área...");
    const query = selectedId
      ? db.from("delivery_areas").update(payload).eq("id", selectedId)
      : db.from("delivery_areas").insert(payload);

    const { error } = await query;
    if (error) return status(error.message, true);

    await recordHistory(selectedId ? "updated" : "created", payload, previous);
    status("Área salva e publicada para todos os clientes.");
    closeEditor();
    await loadAll();
  }

  async function duplicateArea() {
    if (!selectedId) return;
    const source = rows.find(item => item.id === selectedId);
    if (!source?.geometry) return status("A área selecionada não possui polígono.", true);

    const duplicate = {
      ...clone(source),
      id: createId(),
      name: `${source.name || source.label} - cópia`,
      label: `${source.label || source.name} - cópia`,
      geometry: offsetGeometry(source.geometry),
      updated_at: new Date().toISOString()
    };

    status("Duplicando área...");
    const { error } = await db.from("delivery_areas").insert(duplicate);
    if (error) return status(error.message, true);

    await recordHistory("duplicated", duplicate, source);
    await loadAll();
    selectArea(duplicate.id);
    status("Área duplicada. Ajuste os vértices e clique em Salvar área.");
  }

  async function deleteArea() {
    if (!selectedId) return;
    const row = clone(rows.find(item => item.id === selectedId));
    if (!confirm(`Excluir definitivamente “${row?.label || selectedId}”?`)) return;

    status("Excluindo área...");
    const { error } = await db.from("delivery_areas").delete().eq("id", selectedId);
    if (error) return status(error.message, true);

    await recordHistory("deleted", null, row);
    status("Área excluída.");
    closeEditor();
    await loadAll();
  }

  async function importCurrentAreas() {
    if (!confirm("Importar os polígonos atuais do arquivo GeoJSON para o Supabase?")) return;

    status("Importando áreas atuais...");
    try {
      const response = await fetch("./dados/delivery_regions.geojson?v=1100");
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

      await recordHistory("imported", { id: null, label: `${payload.length} áreas` }, null);
      status(`${payload.length} áreas importadas para o banco.`);
      await loadAll();
    } catch (error) {
      status(error.message || "Falha na importação.", true);
    }
  }

  function exportBackup() {
    const backup = {
      app: "Produtos Yuba",
      version: "1.1.0",
      exported_at: new Date().toISOString(),
      delivery_areas: rows
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `produtos-yuba-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    status("Backup exportado.");
  }

  async function restoreBackup(file) {
    if (!file) return;
    if (!confirm("Restaurar este backup? Áreas com o mesmo ID serão atualizadas.")) return;

    status("Lendo backup...");
    try {
      const parsed = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : parsed.delivery_areas;
      if (!Array.isArray(items) || !items.length) throw new Error("Arquivo de backup inválido.");

      const cleanItems = items.map(item => ({
        id: item.id || createId(),
        name: item.name || item.label || "Área restaurada",
        label: item.label || item.name || "Área restaurada",
        price: item.risk ? null : Number(item.price ?? 0),
        risk: Boolean(item.risk),
        active: item.active !== false,
        color: item.color || (item.risk ? "#9ea5aa" : "#159447"),
        geometry: item.geometry,
        updated_at: new Date().toISOString()
      })).filter(item => item.geometry);

      const { error } = await db.from("delivery_areas").upsert(cleanItems, { onConflict: "id" });
      if (error) throw error;

      await recordHistory("restored", { id: null, label: `${cleanItems.length} áreas` }, null);
      status(`${cleanItems.length} áreas restauradas.`);
      await loadAll();
    } catch (erro) {
      status(erro.message || "Não foi possível restaurar o backup.", true);
    } finally {
      $("restaurar-backup").value = "";
    }
  }

  function formatMoney(value) {
    if (value === null || value === undefined) return "Sem valor";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short", timeStyle: "short"
    }).format(new Date(value));
  }

  function actionLabel(action) {
    return ({
      created: "Área criada",
      updated: "Área alterada",
      deleted: "Área excluída",
      duplicated: "Área duplicada",
      imported: "Importação realizada",
      restored: "Backup restaurado"
    })[action] || action;
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

  $("duplicar-area").onclick = duplicateArea;
  $("exportar-backup").onclick = exportBackup;
  $("restaurar-backup").onchange = event => restoreBackup(event.target.files?.[0]);
  $("buscar-area").oninput = renderList;
  $("filtro-status").onchange = renderList;
  $("cancelar-edicao").onclick = closeEditor;
  $("salvar-area").onclick = saveArea;
  $("excluir-area").onclick = deleteArea;
  $("recarregar").onclick = loadAll;
  $("importar-atuais").onclick = importCurrentAreas;
  $("area-risco").onchange = () => {
    $("area-preco").disabled = $("area-risco").checked;
  };

  session();
});
