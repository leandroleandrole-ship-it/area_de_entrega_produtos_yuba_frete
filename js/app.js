document.addEventListener("DOMContentLoaded", async () => {
  const cfg = window.YUBA_CONFIG;
  const configured = cfg.SUPABASE_URL.startsWith("https://opojojmrmscaczmfsqol.supabase.co") && !cfg.SUPABASE_ANON_KEY.startsWith("sb_publishable_jYUJW4hr8eN1q1TaQrBIKw_wzt306mj");
  const db = configured ? supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = id => document.getElementById(id);
  const ui = {endereco:$("endereco"),limpar:$("limpar"),gps:$("gps"),buscar:$("buscar"),rota:$("rota"),status:$("status"),resultado:$("resultado"),situacao:$("situacao"),titulo:$("titulo-resultado"),icone:$("icone-resultado"),frete:$("frete"),regiao:$("regiao"),distancia:$("distancia"),tempo:$("tempo"),observacao:$("observacao")};
  let areas=[], atual=null, map, marker, geoLayer;

  map=L.map("mapa",{zoomControl:true}).setView([cfg.DISTRIBUTION_CENTER.lat,cfg.DISTRIBUTION_CENTER.lon],11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
  L.marker([cfg.DISTRIBUTION_CENTER.lat,cfg.DISTRIBUTION_CENTER.lon]).addTo(map).bindPopup(cfg.DISTRIBUTION_CENTER.name);
  $("centro-nome").textContent=cfg.DISTRIBUTION_CENTER.name;$("centro-endereco").textContent=cfg.DISTRIBUTION_CENTER.address;

  const colors=["#159447","#68b877","#f2cf35","#f6ae2d","#ef7d38","#e45d59","#de5f92","#bc64c8","#7a6dd2","#5c8bc7","#9ea5aa"];
  function colorFor(price,risk){if(risk)return"#9ea5aa";const values=[14,16,18,20,22,24,30,35,40,50];const i=values.indexOf(Math.round(Number(price)));return colors[i<0?0:i]}

  function toBoolean(value,defaultValue=false){
    if(typeof value==="boolean")return value;
    if(typeof value==="number")return value===1;
    if(typeof value==="string"){
      const normalized=value.trim().toLowerCase();
      if(["true","1","sim","yes","on"].includes(normalized))return true;
      if(["false","0","não","nao","no","off",""] .includes(normalized))return false;
    }
    return defaultValue;
  }

  function parsePrice(value){
    if(value===null||value===undefined||value==="")return null;
    if(typeof value==="number")return Number.isFinite(value)?value:null;
    let text=String(value).trim().replace(/R\$/gi,"").replace(/\s/g,"");
    if(text.includes(",")&&text.includes("."))text=text.replace(/\./g,"").replace(",",".");
    else if(text.includes(","))text=text.replace(",",".");
    const number=Number(text);
    return Number.isFinite(number)?number:null;
  }

  function normalizeProperties(properties={}){
    return {
      ...properties,
      risk:toBoolean(properties.risk,false),
      active:toBoolean(properties.active,true),
      price:parsePrice(properties.price)
    };
  }

  async function loadAreas(){
    let databaseRows = [];
    if(db){
      const {data,error}=await db
        .from("delivery_areas")
        .select("*")
        .order("price",{ascending:true,nullsFirst:false});
      if(error)throw error;
      databaseRows=data||[];
    }

    const databaseFeatures=databaseRows
      .filter(row=>row.geometry)
      .map(row=>({
        type:"Feature",
        properties:normalizeProperties(row),
        geometry:row.geometry
      }));

    if(databaseFeatures.length){
      areas=databaseFeatures.map(f=>({...f,geometry:normalizeGeometry(f.geometry),area:geometryArea(f.geometry)})).filter(f=>f.geometry);
    }else{
      const respostaGeo=await fetch("./dados/delivery_regions.geojson?v=1000");
      if(!respostaGeo.ok)throw new Error("Arquivo dados/delivery_regions.geojson não encontrado.");
      const g=await respostaGeo.json();
      const remote=Object.fromEntries(databaseRows.map(x=>[x.id,x]));
      areas=g.features.map(f=>({
        ...f,
        properties:normalizeProperties({...f.properties,...(remote[f.properties.id]||{})}),
        geometry:normalizeGeometry(f.geometry),
        area:geometryArea(f.geometry)
      }));
    }

    if(geoLayer)geoLayer.remove();
    geoLayer=L.geoJSON(
      {type:"FeatureCollection",features:areas},
      {
        style:f=>({
          color:f.properties.color||(toBoolean(f.properties.risk,false)?"#9ea5aa":"#159447"),
          weight:2,
          fillColor:f.properties.color||(toBoolean(f.properties.risk,false)?"#9ea5aa":"#159447"),
          fillOpacity:toBoolean(f.properties.active,true)?.35:.12,
          dashArray:toBoolean(f.properties.active,true)?null:"6 6"
        }),
        onEachFeature:(f,l)=>l.bindPopup(
          `<strong>${f.properties.label}</strong><br>${toBoolean(f.properties.risk,false)?"Não atendemos":money(f.properties.price)}`
        )
      }
    ).addTo(map);

    if(geoLayer.getLayers().length){
      map.fitBounds(geoLayer.getBounds(),{padding:[10,10]});
    }

    ui.status.textContent=databaseFeatures.length
      ? `${areas.length} áreas carregadas diretamente do banco de dados.`
      : `${areas.length} áreas carregadas. Importe os polígonos no painel para edição completa.`;
  }
  try {
    await loadAreas();
  } catch (erro) {
    console.error("Falha ao carregar áreas:", erro);
    ui.status.textContent = erro.message || "Não foi possível carregar as áreas de entrega.";
  }

  if (db) {
    db.channel("delivery-areas-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_areas" }, async () => {
        try {
          await loadAreas();
        } catch (erro) {
          console.error("Falha na atualização em tempo real:", erro);
        }
      })
      .subscribe();
  }

  async function geocode(q){
    const p=new URLSearchParams({q,format:"jsonv2",limit:"1",countrycodes:"br",addressdetails:"1","accept-language":"pt-BR"});
    const r=await fetch(`https://nominatim.openstreetmap.org/search?${p}`,{headers:{Accept:"application/json"}});
    if(!r.ok)throw Error("Falha ao consultar o endereço.");
    const d=await r.json();
    if(!d.length)throw Error("Endereço não encontrado.");
    return{lat:+d[0].lat,lon:+d[0].lon,address:d[0].display_name};
  }
  async function reverse(lat,lon){
    const p=new URLSearchParams({lat,lon,format:"jsonv2","accept-language":"pt-BR"});
    const r=await fetch(`https://nominatim.openstreetmap.org/reverse?${p}`,{headers:{Accept:"application/json"}});
    if(!r.ok)throw Error("Falha ao identificar sua localização.");
    const d=await r.json();
    return d.display_name||`${lat}, ${lon}`;
  }
  function normalizeGeometry(geometry){
    if(!geometry)return null;
    if(typeof geometry==="string"){
      try{geometry=JSON.parse(geometry)}catch{return null}
    }
    if(geometry.type==="Feature")geometry=geometry.geometry;
    if(!geometry?.type||!Array.isArray(geometry.coordinates))return null;
    return geometry;
  }

  function pointOnSegment(x,y,x1,y1,x2,y2,epsilon=1e-10){
    const cross=(x-x1)*(y2-y1)-(y-y1)*(x2-x1);
    if(Math.abs(cross)>epsilon)return false;
    const dot=(x-x1)*(x2-x1)+(y-y1)*(y2-y1);
    if(dot<0)return false;
    const lengthSquared=(x2-x1)**2+(y2-y1)**2;
    return dot<=lengthSquared;
  }

  function inRing(x,y,ring){
    if(!Array.isArray(ring)||ring.length<3)return false;
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [xi,yi]=ring[i];
      const [xj,yj]=ring[j];

      if(pointOnSegment(x,y,xi,yi,xj,yj))return true;

      const intersects=((yi>y)!==(yj>y)) &&
        (x < ((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi);
      if(intersects)inside=!inside;
    }
    return inside;
  }

  function inPolygonCoordinates(x,y,rings){
    if(!Array.isArray(rings)||!rings.length)return false;
    if(!inRing(x,y,rings[0]))return false;
    for(let i=1;i<rings.length;i++){
      if(inRing(x,y,rings[i]))return false;
    }
    return true;
  }

  function geometryContains(geometry,x,y){
    const g=normalizeGeometry(geometry);
    if(!g)return false;
    if(g.type==="Polygon")return inPolygonCoordinates(x,y,g.coordinates);
    if(g.type==="MultiPolygon"){
      return g.coordinates.some(polygon=>inPolygonCoordinates(x,y,polygon));
    }
    return false;
  }

  function ringArea(ring){
    if(!Array.isArray(ring)||ring.length<3)return Number.POSITIVE_INFINITY;
    let sum=0;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      sum+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];
    }
    return Math.abs(sum/2);
  }

  function geometryArea(geometry){
    const g=normalizeGeometry(geometry);
    if(!g)return Number.POSITIVE_INFINITY;
    if(g.type==="Polygon")return ringArea(g.coordinates[0]);
    if(g.type==="MultiPolygon"){
      return g.coordinates.reduce((total,polygon)=>total+ringArea(polygon[0]),0);
    }
    return Number.POSITIVE_INFINITY;
  }

  function findArea(lat,lon){
    const found=areas.filter(feature=>{
      feature.properties=normalizeProperties(feature.properties||{});
      return feature.properties.active && geometryContains(feature.geometry,lon,lat);
    });

    // Regra validada para as áreas antigas, que são zonas concêntricas:
    // 1) procura primeiro uma área normal de entrega;
    // 2) entre áreas normais sobrepostas, usa o menor polígono;
    // 3) só retorna área de risco quando nenhuma área normal contém o ponto.
    const normalArea=found
      .filter(feature=>feature.properties.risk===false)
      .sort((a,b)=>(a.area??geometryArea(a.geometry))-(b.area??geometryArea(b.geometry)))[0];

    if(normalArea)return normalArea;

    return found
      .filter(feature=>feature.properties.risk===true)
      .sort((a,b)=>(a.area??geometryArea(a.geometry))-(b.area??geometryArea(b.geometry)))[0]||null;
  }
  function distance(lat1,lon1,lat2,lon2){const R=6371,r=x=>x*Math.PI/180,d1=r(lat2-lat1),d2=r(lon2-lon1),a=Math.sin(d1/2)**2+Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(d2/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
  const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
  function highlightArea(feature){
    if(!geoLayer||!feature)return;
    geoLayer.eachLayer(layer=>{
      if(layer.feature===feature&&typeof layer.bringToFront==="function")layer.bringToFront();
    });
    if(marker&&typeof marker.bringToFront==="function")marker.bringToFront();
  }
  function show(f,lat,lon){atual={lat,lon};if(marker)marker.remove();marker=L.marker([lat,lon],{zIndexOffset:1000}).addTo(map).bindPopup("Endereço consultado").openPopup();map.setView([lat,lon],14);highlightArea(f);const km=distance(cfg.DISTRIBUTION_CENTER.lat,cfg.DISTRIBUTION_CENTER.lon,lat,lon);ui.resultado.classList.remove("oculto","erro");if(!f||toBoolean(f.properties.risk,false)){ui.resultado.classList.add("erro");ui.situacao.textContent=f?"Área de risco":"Fora da cobertura";ui.titulo.textContent="Entrega indisponível";ui.icone.textContent="!";ui.frete.textContent=f?"Não atendemos":"Indisponível";ui.regiao.textContent=f?.properties.label||"Fora das áreas cadastradas";ui.distancia.textContent=`${km.toFixed(1).replace(".",",")} km`;ui.tempo.textContent="Não aplicável";ui.observacao.textContent=f?.properties.description||"Consulte a Produtos Yuba.";return}ui.situacao.textContent="Entrega disponível";ui.titulo.textContent="Endereço dentro da cobertura";ui.icone.textContent="✓";ui.frete.textContent=Number.isFinite(f.properties.price)?money(f.properties.price):"Frete não configurado";ui.regiao.textContent=f.properties.label;ui.distancia.textContent=`${km.toFixed(1).replace(".",",")} km`;ui.tempo.textContent=`aprox. ${Math.max(20,Math.round(km/22*60+15))} min`;ui.observacao.textContent="Distância em linha reta e tempo aproximado; o trajeto real pode variar."}
  function loading(v,m=""){ui.buscar.disabled=v;ui.gps.disabled=v;ui.buscar.textContent=v?"Aguarde...":"🚚 Calcular frete";ui.status.textContent=m}
  ui.buscar.onclick=async()=>{const q=ui.endereco.value.trim();if(!q)return ui.endereco.focus();loading(true,"Localizando endereço...");try{const l=await geocode(q);ui.endereco.value=l.address;const area=findArea(l.lat,l.lon);show(area,l.lat,l.lon);ui.status.textContent=area?`Consulta concluída: ${area.properties.label||area.properties.name}.`:"Consulta concluída: endereço fora da cobertura."}catch(e){console.error(e);ui.status.textContent=e.message}finally{loading(false,ui.status.textContent)}};
  ui.endereco.onkeydown=e=>{if(e.key==="Enter")ui.buscar.click()};ui.limpar.onclick=()=>{ui.endereco.value="";ui.endereco.focus()};
  ui.gps.onclick=()=>{
    if(!navigator.geolocation){
      ui.status.textContent="Geolocalização indisponível.";
      return;
    }
    loading(true,"Obtendo sua localização...");
    navigator.geolocation.getCurrentPosition(async p=>{
      const lat=p.coords.latitude,lon=p.coords.longitude;
      try{
        ui.endereco.value=await reverse(lat,lon);
        show(findArea(lat,lon),lat,lon);
        ui.status.textContent="Localização consultada.";
      }catch(erro){
        console.error(erro);
        ui.status.textContent=erro.message||"Não foi possível consultar sua localização.";
      }finally{
        loading(false,ui.status.textContent);
      }
    },erro=>{
      const mensagens={1:"Permissão de localização negada.",2:"Localização indisponível.",3:"A localização demorou demais."};
      loading(false,mensagens[erro.code]||"Não foi possível obter sua localização.");
    },{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
  };
  ui.rota.onclick=()=>atual&&window.open(`https://www.google.com/maps/dir/?api=1&origin=${cfg.DISTRIBUTION_CENTER.lat},${cfg.DISTRIBUTION_CENTER.lon}&destination=${atual.lat},${atual.lon}`,"_blank");
  $("como-funciona").onclick=()=>{
    const modal=$("modal-ajuda");
    if(typeof modal.showModal==="function") modal.showModal();
    else modal.setAttribute("open","");
  };
  $("fechar-ajuda").onclick=()=>{
    const modal=$("modal-ajuda");
    if(typeof modal.close==="function") modal.close();
    else modal.removeAttribute("open");
  };
});
