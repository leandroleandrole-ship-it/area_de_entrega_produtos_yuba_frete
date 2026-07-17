document.addEventListener("DOMContentLoaded", async () => {
  const cfg = window.YUBA_CONFIG;
  const configured = cfg.SUPABASE_URL.startsWith("https://") && !cfg.SUPABASE_ANON_KEY.startsWith("COLE_");
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

  async function loadAreas(){
    const g=await fetch("./dados/delivery_regions.geojson?v=6").then(r=>r.json());
    let remote={};
    if(db){const {data,error}=await db.from("delivery_areas").select("*");if(!error)remote=Object.fromEntries(data.map(x=>[x.id,x]));}
    areas=g.features.map(f=>({...f,properties:{...f.properties,...(remote[f.properties.id]||{})},area:polyArea(f.geometry.coordinates[0])}));
    if(geoLayer)geoLayer.remove();
    geoLayer=L.geoJSON({type:"FeatureCollection",features:areas},{style:f=>({color:"#fff",weight:1,fillColor:colorFor(f.properties.price,f.properties.risk),fillOpacity:.58}),onEachFeature:(f,l)=>l.bindPopup(`<strong>${f.properties.label}</strong><br>${f.properties.risk?"Não atendemos":money(f.properties.price)}`)}).addTo(map);
    map.fitBounds(geoLayer.getBounds(),{padding:[10,10]});
    ui.status.textContent=configured?`${areas.length} áreas sincronizadas com o banco de dados.`:`${areas.length} áreas carregadas. Configure o Supabase para sincronização global.`;
  }
  await loadAreas();

  if(db) db.channel("delivery-areas-live").on("postgres_changes",{event:"*",schema:"public",table:"delivery_areas"},loadAreas).subscribe();

  async function geocode(q){const p=new URLSearchParams({q,format:"jsonv2",limit:"1",countrycodes:"br",addressdetails:"1","accept-language":"pt-BR"});const r=await fetch(`https://nominatim.openstreetmap.org/search?${p}`);const d=await r.json();if(!d.length)throw Error("Endereço não encontrado.");return{lat:+d[0].lat,lon:+d[0].lon,address:d[0].display_name}}
  async function reverse(lat,lon){const p=new URLSearchParams({lat,lon,format:"jsonv2","accept-language":"pt-BR"});const r=await fetch(`https://nominatim.openstreetmap.org/reverse?${p}`);const d=await r.json();return d.display_name||`${lat}, ${lon}`}
  function inRing(x,y,a){let c=false;for(let i=0,j=a.length-1;i<a.length;j=i++){const[xi,yi]=a[i],[xj,yj]=a[j];if((yi>y)!=(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c}return c}
  function inPoly(x,y,r){if(!inRing(x,y,r[0]))return false;for(let i=1;i<r.length;i++)if(inRing(x,y,r[i]))return false;return true}
  function polyArea(a){let s=0;for(let i=0,j=a.length-1;i<a.length;j=i++)s+=a[j][0]*a[i][1]-a[i][0]*a[j][1];return Math.abs(s/2)}
  function findArea(lat,lon){const found=areas.filter(f=>f.properties.active!==false&&inPoly(lon,lat,f.geometry.coordinates));return found.find(f=>f.properties.risk)||found.filter(f=>!f.properties.risk).sort((a,b)=>a.area-b.area)[0]||null}
  function distance(lat1,lon1,lat2,lon2){const R=6371,r=x=>x*Math.PI/180,d1=r(lat2-lat1),d2=r(lon2-lon1),a=Math.sin(d1/2)**2+Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(d2/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
  const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
  function show(f,lat,lon){atual={lat,lon};if(marker)marker.remove();marker=L.marker([lat,lon]).addTo(map).bindPopup("Endereço consultado").openPopup();map.setView([lat,lon],14);const km=distance(cfg.DISTRIBUTION_CENTER.lat,cfg.DISTRIBUTION_CENTER.lon,lat,lon);ui.resultado.classList.remove("oculto","erro");if(!f||f.properties.risk){ui.resultado.classList.add("erro");ui.situacao.textContent=f?"Área de risco":"Fora da cobertura";ui.titulo.textContent="Entrega indisponível";ui.icone.textContent="!";ui.frete.textContent=f?"Não atendemos":"Indisponível";ui.regiao.textContent=f?.properties.label||"Fora das áreas cadastradas";ui.distancia.textContent=`${km.toFixed(1).replace(".",",")} km`;ui.tempo.textContent="Não aplicável";ui.observacao.textContent=f?.properties.description||"Consulte a Produtos Yuba.";return}ui.situacao.textContent="Entrega disponível";ui.titulo.textContent="Endereço dentro da cobertura";ui.icone.textContent="✓";ui.frete.textContent=money(f.properties.price);ui.regiao.textContent=f.properties.label;ui.distancia.textContent=`${km.toFixed(1).replace(".",",")} km`;ui.tempo.textContent=`aprox. ${Math.max(20,Math.round(km/22*60+15))} min`;ui.observacao.textContent="Distância em linha reta e tempo aproximado; o trajeto real pode variar."}
  function loading(v,m=""){ui.buscar.disabled=v;ui.gps.disabled=v;ui.buscar.textContent=v?"Aguarde...":"🚚 Calcular frete";ui.status.textContent=m}
  ui.buscar.onclick=async()=>{const q=ui.endereco.value.trim();if(!q)return ui.endereco.focus();loading(true,"Localizando endereço...");try{const l=await geocode(q);ui.endereco.value=l.address;show(findArea(l.lat,l.lon),l.lat,l.lon);ui.status.textContent="Consulta concluída."}catch(e){ui.status.textContent=e.message}finally{loading(false,ui.status.textContent)}};
  ui.endereco.onkeydown=e=>{if(e.key==="Enter")ui.buscar.click()};ui.limpar.onclick=()=>{ui.endereco.value="";ui.endereco.focus()};
  ui.gps.onclick=()=>navigator.geolocation?navigator.geolocation.getCurrentPosition(async p=>{const lat=p.coords.latitude,lon=p.coords.longitude;ui.endereco.value=await reverse(lat,lon);show(findArea(lat,lon),lat,lon);ui.status.textContent="Localização consultada."},()=>ui.status.textContent="Não foi possível obter sua localização.",{enableHighAccuracy:true,timeout:15000}):ui.status.textContent="Geolocalização indisponível.";
  ui.rota.onclick=()=>atual&&window.open(`https://www.google.com/maps/dir/?api=1&origin=${cfg.DISTRIBUTION_CENTER.lat},${cfg.DISTRIBUTION_CENTER.lon}&destination=${atual.lat},${atual.lon}`,"_blank");
  $("como-funciona").onclick=()=>$("modal-ajuda").showModal();$("fechar-ajuda").onclick=()=>$("modal-ajuda").close();
});
