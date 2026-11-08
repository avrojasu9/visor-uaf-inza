/*
 * Visor UAF ZRC Montaña Caucana · v0.5 (código completo)
 * Leaflet, GeoJSON estático local. Sin dependencia del SDK ArcGIS.
 * NOTA: Las categorías son exploratorias, no constituyen un dictamen jurídico.
 */
'use strict';
(() => {
  const el = id => document.getElementById(id);
  const fmt0 = new Intl.NumberFormat('es-CO', {maximumFractionDigits: 0});
  const fmt2 = new Intl.NumberFormat('es-CO', {maximumFractionDigits: 2});
  const sanitize = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norma = s => String(s ?? '').trim().toLocaleLowerCase('es-CO');
  const clave = (municipio, vereda) => `${norma(municipio)}|||${norma(vereda)}`;
  const MUNICIPIO_OBJETIVO = 'Inzá';
  const esMunicipioObjetivo = municipio => norma(municipio) === norma(MUNICIPIO_OBJETIVO);
  const CLAS_COL = {menor:'#16867a',mayor:'#d46b40',revision:'#d6ac4e',sin_referencia:'#89969c'};
  const CLAS_TEX = {menor:'Menor que la UAF',mayor:'Igual o mayor que la UAF',revision:'Requiere revisión',sin_referencia:'Sin UAF de referencia'};
  // Clasificación de rangos inspirada en la leyenda de referencia; no constituye tipología predial oficial.
  const BANDAS = [
    {min:0,max:1,nom:'0–1',grupo:'Microfundio',color:'#d65b32'},
    {min:1,max:3,nom:'1–3',grupo:'Microfundio',color:'#e18431'},
    {min:3,max:5,nom:'3–5',grupo:'Minifundio',color:'#e3a43a'},
    {min:5,max:10,nom:'5–10',grupo:'Minifundio',color:'#e8c93b'},
    {min:10,max:15,nom:'10–15',grupo:'Pequeña propiedad',color:'#d6dc3d'},
    {min:15,max:20,nom:'15–20',grupo:'Pequeña propiedad',color:'#b7d944'},
    {min:20,max:50,nom:'20–50',grupo:'Mediana propiedad',color:'#6bc85f'},
    {min:50,max:100,nom:'50–100',grupo:'Mediana propiedad',color:'#39b773'},
    {min:100,max:200,nom:'100–200',grupo:'Mediana propiedad',color:'#299f90'},
    {min:200,max:500,nom:'200–500',grupo:'Gran propiedad',color:'#268ba1'},
    {min:500,max:1000,nom:'500–1.000',grupo:'Gran propiedad',color:'#226c98'},
    {min:1000,max:1500,nom:'1.000–1.500',grupo:'Gran propiedad',color:'#1d5288'},
    {min:1500,max:Infinity,nom:'Más de 1.500',grupo:'Gran propiedad',color:'#123766'}
  ];
  // Valores presentes en las 148 unidades UAF publicadas del respaldo (ha).
  const UAF_COLOR = {'4':'#355f8d','8':'#2b83ba','14':'#4dafb6','17':'#7bccc4','26':'#c7e9b4'};
  const UAF_OTRO = '#758796';
  const STATE = {
    datos:{},p:[{id:'izq',map:null,tipo:'relacion',base:null,tema:null,extras:[],etiquetas:null,indPred:new Map(),fondo:null},
             {id:'der',map:null,tipo:'uaf',base:null,tema:null,extras:[],etiquetas:null,indPred:new Map(),fondo:null}],
    comparando:false,everCompared:false,syncLock:false,veredas:[],seleccionVeredas:new Set(),selected:null,
    initBounds:null,observer:null,tileErrors:0
  };
  const panel = i => STATE.p[i];
  const categoria = p => {
    if (p.estado === 'revision') return 'revision';
    if (p.estado === 'sin_referencia' || !Number.isFinite(Number(p.uaf_ha)) || Number(p.uaf_ha) <= 0) return 'sin_referencia';
    return Number(p.area_ha) < Number(p.uaf_ha) ? 'menor' : 'mayor';
  };
  const banda = v => BANDAS.find(b => Number(v) >= b.min && Number(v) < b.max) || BANDAS[0];
  const colorUaf = h => UAF_COLOR[String(Number(h))] || UAF_OTRO;
  const estadoActivo = f => {
    const pr=f.properties,cat=el('estado').value;
    if(!esMunicipioObjetivo(pr.uaf_municipio))return false;
    if(cat && categoria(pr)!==cat)return false;
    return !STATE.seleccionVeredas.size || STATE.seleccionVeredas.has(clave(pr.uaf_municipio,pr.uaf_nombre));
  };
  const uafActiva = f => {
    const pr=f.properties;
    if(!esMunicipioObjetivo(pr.municipio))return false;
    return !STATE.seleccionVeredas.size || STATE.seleccionVeredas.has(clave(pr.municipio,pr.nombre));
  };
  const show = (id, vis) => {el(id).hidden=!vis;};
  const visiblePredios = () => STATE.datos.predios.features.filter(estadoActivo);

  function resolverDatos(name) {
    return fetch(`./data/${name}`,{cache:'no-store'}).then(async r => {
      if(!r.ok)throw new Error(`No se pudo cargar ${name} (HTTP ${r.status})`);
      return r.json();
    });
  }
  function avisoError(msg){
    el('app-error').textContent=msg;show('app-error',true);
    el('map-status').textContent='No fue posible cargar todos los datos';
    console.error(msg);
  }
  function cargarMunicipios() {
    const s=el('municipio');
    s.replaceChildren(new Option(MUNICIPIO_OBJETIVO,MUNICIPIO_OBJETIVO));
    s.value=MUNICIPIO_OBJETIVO;
  }
  function cargarVeredas() {
    const aux=new Map();
    STATE.datos.uaf.features.filter(f=>esMunicipioObjetivo(f.properties.municipio)).forEach(f=>{
      const q=f.properties,k=clave(q.municipio,q.nombre);
      if(!aux.has(k))aux.set(k,{clave:k,nombre:q.nombre,municipio:q.municipio,veces:0});
      aux.get(k).veces++;
    });
    STATE.veredas=[...aux.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')||a.municipio.localeCompare(b.municipio,'es'));
    dibujarVeredasSeleccion();
  }
  function dibujarVeredasSeleccion(){
    const filtro=norma(el('buscar-vereda').value),m=norma(el('municipio').value);
    const cont=el('veredas-opciones');cont.replaceChildren();let num=0;
    for(const v of STATE.veredas){
      if(m&&norma(v.municipio)!==m)continue;
      if(filtro&&!norma(`${v.nombre} ${v.municipio}`).includes(filtro))continue;
      num++;
      const label=document.createElement('label');label.className='vereda-item';
      const check=document.createElement('input');check.type='checkbox';check.value=v.clave;
      check.checked=STATE.seleccionVeredas.has(v.clave);check.setAttribute('aria-label',`${v.nombre}, ${v.municipio}`);
      check.addEventListener('change',()=>{
        if(check.checked)STATE.seleccionVeredas.add(v.clave);else STATE.seleccionVeredas.delete(v.clave);
        dibujarVeredasSeleccion();actualizar();
      });
      const lab=document.createElement('span');lab.className='vereda-texto';
      const b=document.createElement('strong');b.textContent=v.nombre;
      const sm=document.createElement('small');sm.textContent=v.municipio+(v.veces>1?` · ${v.veces} polígonos`:'');
      lab.append(b,sm);label.append(check,lab);cont.append(label);
    }
    if(num===0){const p=document.createElement('p');p.className='no-veredas';p.textContent='Sin coincidencias.';cont.append(p);}
    el('veredas-count').textContent=STATE.seleccionVeredas.size?`${STATE.seleccionVeredas.size} vereda(s) elegida(s)`:`Todas (${num})`;
  }
  function selectVeredasVisibles(){
    const filtro=norma(el('buscar-vereda').value),m=norma(el('municipio').value);
    STATE.veredas.filter(v=>(!m||norma(v.municipio)===m)&&(!filtro||norma(`${v.nombre} ${v.municipio}`).includes(filtro)))
      .forEach(v=>STATE.seleccionVeredas.add(v.clave));
    dibujarVeredasSeleccion();actualizar();
  }
  function zoomVeredas(){
    const box=L.latLngBounds([]);
    for(const f of STATE.datos.uaf.features)if(uafActiva(f))box.extend(L.geoJSON(f).getBounds());
    if(box.isValid())panel(0).map.fitBounds(box,{padding:[24,24],maxZoom:15});
  }

  function fondoCapa(opcion){
    const common={keepBuffer:2};
    if(opcion==='satelite')return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
      ...common,maxZoom:19,attribution:'Imágenes © Esri y colaboradores. Ver condiciones del proveedor.'});
    if(opcion==='osm')return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      ...common,maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'});
    if(opcion==='nimbo')return L.tileLayer('https://prod-data.nimbo.earth/mapcache-free/tms/1.0.0/latest@kermap/{z}/{x}/{-y}.png',{
      ...common,minZoom:2,maxZoom:19,maxNativeZoom:13,attribution:'© NIMBO · Sentinel-2 Copernicus'});
    return null;
  }
  function cambiarFondos(){
    const tipo=el('mapa-base').value;
    for(const pane of STATE.p){
      if(!pane.map)continue;
      if(pane.fondo)pane.map.removeLayer(pane.fondo);
      pane.fondo=fondoCapa(tipo);
      if(pane.fondo){
        pane.fondo.on('tileerror',()=>{
          STATE.tileErrors++;
          if(STATE.tileErrors===12){el('map-status').textContent='Algunas imágenes satelitales no cargaron: prueba otro mapa base.';show('map-status',true);}
        });
        pane.fondo.addTo(pane.map);pane.fondo.bringToBack();
      }
    }
    STATE.tileErrors=0;
    actualizar();
  }
  function estiloPredial(f, i){
    const p=f.properties,active=estadoActivo(f),chosen=STATE.selected?.kind==='predio'&&STATE.selected.id===p.id;
    const mode=panel(i).tipo;
    const c=mode==='superficie'?banda(p.area_ha).color:CLAS_COL[categoria(p)];
    const satellite=['satelite','nimbo'].includes(el('mapa-base').value);
    const z=panel(i).map?panel(i).map.getZoom():10;
    const baseWeight = z >= 14 ? 0.18 : z >= 12 ? 0.24 : 0.32;
    if(!active)return {stroke:false,fill:false,interactive:false};
    return {
      stroke:true,fill:true,
      color:chosen?'#162c30':active?'#ffffff':'#718388',
      weight:chosen?2.1:active?baseWeight:0.06,
      fillColor:c,fillOpacity:chosen?0.88:active?(satellite?0.70:0.76):0.02,
      opacity:chosen?1:active?0.8:0.03,
      interactive:active
    };
  }
  function estiloUaf(f,i){
    const active=uafActiva(f),chosen=STATE.selected?.kind==='uaf'&&STATE.selected.id===f.properties.id;
    const satellite=['satelite','nimbo'].includes(el('mapa-base').value);
    if(!active)return {stroke:false,fill:false,interactive:false};
    return {
      stroke:true,fill:true,
      color:chosen?'#122a3c':active?'#344e59':'#8e9c9b',
      weight:chosen?3:active?1.6:.3,
      fillColor:colorUaf(f.properties.uaf_ha),
      fillOpacity:chosen?.84:active?(satellite?.69:.75):.02,
      opacity:chosen?1:active?1:.05
    };
  }
  function geoPredPopup(p){
    const cat=categoria(p);
    return `<div class="popup-head"><strong>Predio rural</strong><span>${sanitize(CLAS_TEX[cat])}</span></div>
      <div class="popup-code">${sanitize(p.codigo||'Sin código')}</div>
      <div class="popup-metrics"><div><small>Área predial</small><b>${fmt2.format(p.area_ha)} ha</b></div>
      <div><small>UAF de referencia</small><b>${p.uaf_ha?fmt2.format(p.uaf_ha)+' ha':'Sin dato'}</b></div></div>
      <div class="popup-note">${sanitize(p.uaf_nombre||'Sin vereda UAF')} · ${sanitize(p.uaf_municipio||'Municipio no asignado')}</div>
      ${cat==='revision'?'<div class="popup-alert">Asociación espacial pendiente de verificación.</div>':''}`;
  }
  function geoUafPopup(p){
    return `<div class="popup-head"><strong>${sanitize(p.nombre||'Sin nombre')}</strong><span>UAF publicada</span></div>
      <div class="popup-code">${sanitize(p.municipio||'Municipio no indicado')}</div>
      <div class="popup-metrics"><div><small>UAF de referencia</small><b>${fmt2.format(p.uaf_ha)} ha</b></div></div>
      <div class="popup-note">El color representa el valor UAF atribuido a la unidad, no la superficie del polígono dibujado.</div>`;
  }
  function mostrarDetallePredio(p){
    const cat=categoria(p),caja=el('detalle');caja.replaceChildren();
    const tit=document.createElement('div');tit.className='selected-name';tit.textContent=`Predio: ${p.codigo||'sin código'}`;
    const grid=document.createElement('div');grid.className='detail-grid';
    for(const [k,v] of [
      ['Área del predio',`${fmt2.format(p.area_ha)} ha`],
      ['UAF asignada',p.uaf_ha?`${fmt2.format(p.uaf_ha)} ha`:'Sin dato']
    ]){
      const box=document.createElement('div');box.className='detail-metric';
      const l=document.createElement('span');l.textContent=k;
      const b=document.createElement('strong');b.textContent=v;box.append(l,b);grid.append(box);
    }
    const label=document.createElement('div');label.className='detail-status';label.textContent=CLAS_TEX[cat];
    label.style.background=`${CLAS_COL[cat]}1c`;label.style.color='#304b42';
    const info=document.createElement('div');info.className='detail-sub';
    info.textContent=`Vereda UAF: ${p.uaf_nombre||'Sin referencia'} · Municipio: ${p.uaf_municipio||'Sin asignación'}`;
    caja.append(tit,grid,label,info);
    if(Array.isArray(p.alertas)&&p.alertas.length){
      const ul=document.createElement('ul');ul.className='detail-warnings';
      p.alertas.forEach(a=>{const li=document.createElement('li');li.textContent=a;ul.append(li);});caja.append(ul);
    }
    el('selected-marker').textContent='PREDIO SELECCIONADO';
  }
  function mostrarDetalleUaf(p){
    const box=el('detalle');box.replaceChildren();
    const tit=document.createElement('div');tit.className='selected-name';tit.textContent=`Unidad UAF: ${p.nombre||'Sin nombre'}`;
    const met=document.createElement('div');met.className='detail-metric';
    const lab=document.createElement('span');lab.textContent='Valor UAF de referencia';
    const val=document.createElement('strong');val.textContent=`${fmt2.format(p.uaf_ha)} ha`;
    met.append(lab,val);
    const desc=document.createElement('p');desc.className='detail-sub';
    desc.textContent=`Municipio: ${p.municipio||'Sin nombre'}. El área mostrada es el valor de UAF, no el tamaño del polígono territorial.`;
    box.append(tit,met,desc);el('selected-marker').textContent='UAF SELECCIONADA';
  }
  function selectPredio(p,i,layer,evt,zoom=false){
    STATE.selected={kind:'predio',id:p.id};mostrarDetallePredio(p);
    actualizarEstilos();
    if(layer){layer.bringToFront();if(evt?.latlng)layer.openPopup(evt.latlng);else layer.openPopup();}
    if(zoom&&layer)panel(i).map.fitBounds(layer.getBounds(),{maxZoom:16,padding:[45,45]});
  }
  function selectUaf(p,i,layer,evt){
    STATE.selected={kind:'uaf',id:p.id};mostrarDetalleUaf(p);actualizarEstilos();
    layer.bringToFront();if(evt?.latlng)layer.openPopup(evt.latlng);else layer.openPopup();
  }
  function addPane(map,name,z,clicks){
    map.createPane(name);map.getPane(name).style.zIndex=String(z);
    if(!clicks)map.getPane(name).style.pointerEvents='none';
  }
  function crearEtiquetas(){
    const out=L.layerGroup();
    for(const f of STATE.datos.etiquetas.features){
      const p=f.properties;if(!String(p.nombre||'').trim())continue;
      const icon=L.divIcon({className:'etiqueta-vereda',html:`<span>${sanitize(p.nombre)}</span>`,iconSize:[0,0],iconAnchor:[0,0]});
      const marker=L.marker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{
        icon,interactive:false,keyboard:false,zIndexOffset:300});
      marker._infoVereda=p;out.addLayer(marker);
    }
    return out;
  }
  function asegurarExtras(i){
    const P=panel(i),map=P.map;
    const uafOutline=L.geoJSON(STATE.datos.uaf,{filter:f=>esMunicipioObjetivo(f.properties.municipio),pane:`p${i}-extras`,interactive:false,style:f=>({
      color:uafActiva(f)?'#f4f1d2':'#6a8b83',weight:uafActiva(f)?1.4:.2,opacity:uafActiva(f)?.9:.04,fillOpacity:0,dashArray:'6 4'
    })});
    const veredas=L.geoJSON(STATE.datos.veredas,{filter:f=>esMunicipioObjetivo(f.properties.municipio),pane:`p${i}-extras`,interactive:false,style:()=>({color:'#e8f1dc',weight:1.35,opacity:.8,fillOpacity:0})});
    const baldios=L.geoJSON(STATE.datos.baldios,{pane:`p${i}-extras`,interactive:false,style:()=>({color:'#db9b35',weight:2,fillColor:'#f0bc54',fillOpacity:.28})});
    P.extras=[uafOutline,veredas,baldios];
    P.etiquetas=crearEtiquetas();
    map.on('zoomend',()=>actualizarEtiquetas(i));
  }
  function cambiarTema(i,tipo){
    const P=panel(i);P.tipo=tipo;
    if(!P.map)return;
    if(P.tema){P.map.removeLayer(P.tema);P.tema=null;}
    P.indPred.clear();
    if(tipo==='uaf'){
      P.tema=L.geoJSON(STATE.datos.uaf,{
        pane:`p${i}-tematico`,renderer:L.canvas({pane:`p${i}-tematico`,padding:.7}),
        style:f=>estiloUaf(f,i),
        onEachFeature:(f,l)=>{
          l.bindPopup(()=>geoUafPopup(f.properties),{maxWidth:340,autoPan:true});
          l.bindTooltip(()=>`${f.properties.nombre} · UAF ${fmt2.format(f.properties.uaf_ha)} ha`,{sticky:true});
          l.on('click',e=>{if(!uafActiva(f))return;L.DomEvent.stopPropagation(e);selectUaf(f.properties,i,l,e);});
        }
      }).addTo(P.map);
    }else{
      P.tema=L.geoJSON(STATE.datos.predios,{
        pane:`p${i}-tematico`,renderer:L.canvas({pane:`p${i}-tematico`,padding:.7}),
        style:f=>estiloPredial(f,i),
        onEachFeature:(f,l)=>{
          P.indPred.set(f.properties.id,l);
          l.bindPopup(()=>geoPredPopup(f.properties),{maxWidth:330,autoPan:true});
          l.bindTooltip(()=>`${fmt2.format(f.properties.area_ha)} ha · ${CLAS_TEX[categoria(f.properties)]}`,{sticky:true});
          l.on('click',e=>{if(!estadoActivo(f))return;L.DomEvent.stopPropagation(e);selectPredio(f.properties,i,l,e);});
        }
      }).addTo(P.map);
    }
    actualizarExtras(i);construirLeyenda(i);actualizarEstilos();
  }
  function actualizarExtras(i){
    const P=panel(i);if(!P.map||!P.extras.length)return;
    const [outlines,veredas,baldios]=P.extras;
    const ctrl=[Boolean(el('ver-uaf').checked)&&P.tipo!=='uaf',Boolean(el('ver-veredas').checked),Boolean(el('ver-baldios').checked)];
    [outlines,veredas,baldios].forEach((layer,j)=>{
      const isShown=P.map.hasLayer(layer);
      if(ctrl[j]&&!isShown)P.map.addLayer(layer);
      if(!ctrl[j]&&isShown)P.map.removeLayer(layer);
    });
    outlines.setStyle(f=>({color:uafActiva(f)?'#ecf1d0':'#78948c',weight:uafActiva(f)?1.5:.3,
      opacity:uafActiva(f)?.8:.04,fillOpacity:0,dashArray:'6 4'}));
    actualizarEtiquetas(i);
  }
  function actualizarEtiquetas(i){
    const P=panel(i);if(!P.map||!P.etiquetas)return;
    const mostrar=el('ver-etiquetas').checked&&(P.map.getZoom()>=10||STATE.seleccionVeredas.size>0);
    if(mostrar&&!P.map.hasLayer(P.etiquetas))P.map.addLayer(P.etiquetas);
    if(!mostrar&&P.map.hasLayer(P.etiquetas))P.map.removeLayer(P.etiquetas);
    P.etiquetas.eachLayer(m=>m.setOpacity(uafActiva({properties:m._infoVereda})?1:0));
  }
  function actualizarEstilos(){
    STATE.p.forEach((P,i)=>{
      if(P.tema){P.tema.setStyle(P.tipo==='uaf'?f=>estiloUaf(f,i):f=>estiloPredial(f,i));}
    });
  }
  function actualizar(){
    const cantidades={menor:0,mayor:0,revision:0,sin_referencia:0};let total=0;
    for(const f of STATE.datos.predios.features){
      if(!estadoActivo(f))continue;
      total++;cantidades[categoria(f.properties)]++;
    }
    const conUaf=cantidades.menor+cantidades.mayor;
    for(const [id,val] of Object.entries({'stat-total':total,'stat-con-uaf':conUaf,'stat-menor':cantidades.menor,'stat-mayor':cantidades.mayor})){
      const node=el(id); if(node) node.textContent=fmt0.format(val);
    }
    actualizarEstilos();
    STATE.p.forEach((P,i)=>{if(P.map){actualizarExtras(i);construirLeyenda(i);}});
  }
  function construirLeyenda(i){
    const P=panel(i),wrap=el(`legend-${P.id}`);wrap.replaceChildren();
    const details=document.createElement('details');details.className='legend-details';details.open=true;
    const summary=document.createElement('summary');
    summary.textContent=P.tipo==='relacion'?'Predio frente a UAF':P.tipo==='superficie'?'Área del predio (ha)':'UAF de referencia (ha)';
    details.append(summary);
    const rows=document.createElement('div');rows.className=P.tipo==='superficie'?'legend-items area-legend':'legend-items';
    let items;
    if(P.tipo==='relacion')items=[
      {nombre:CLAS_TEX.menor,color:CLAS_COL.menor},
      {nombre:CLAS_TEX.mayor,color:CLAS_COL.mayor},
      {nombre:CLAS_TEX.revision,color:CLAS_COL.revision}
    ];
    else if(P.tipo==='superficie')items=BANDAS.map(b=>({nombre:b.nom,grupo:b.grupo,color:b.color}));
    else{
      items=[...new Set(STATE.datos.uaf.features.map(f=>Number(f.properties.uaf_ha)))].filter(Number.isFinite)
        .sort((a,b)=>a-b).map(v=>({nombre:`${fmt2.format(v)} ha`,color:colorUaf(v)}));
    }
    let previous='';
    items.forEach(item=>{
      if(item.grupo&&item.grupo!==previous){
        const subtitle=document.createElement('div');subtitle.className='legend-group';subtitle.textContent=item.grupo;rows.append(subtitle);previous=item.grupo;
      }
      const r=document.createElement('div');r.className='legend-line';
      const sw=document.createElement('span');sw.className='legend-square';sw.style.backgroundColor=item.color;
      const t=document.createElement('span');t.textContent=item.nombre;
      r.append(sw,t);rows.append(r);
    });
    details.append(rows);wrap.append(details);
    if(P.tipo==='uaf'){
      const tip=document.createElement('div');tip.className='legend-foot';
      tip.textContent='Los colores indican el valor UAF de referencia asignado a cada unidad.';wrap.append(tip);
    }else if(P.tipo==='superficie'){
      const tip=document.createElement('div');tip.className='legend-foot';
      tip.textContent='Rangos visuales de área predial en hectáreas.';wrap.append(tip);
    }
  }
  function sincronizar(i){
    if(!STATE.comparando||!panel(1).map||STATE.syncLock)return;
    const a=panel(i).map,b=panel(i===0?1:0).map;
    if(a.getCenter().distanceTo(b.getCenter())<2&&Math.abs(a.getZoom()-b.getZoom())<.001)return;
    STATE.syncLock=true;
    b.setView(a.getCenter(),a.getZoom(),{animate:false});
    requestAnimationFrame(()=>{STATE.syncLock=false;});
  }
  function crearMapa(i){
    const P=panel(i);
    P.map=L.map(P.id==='izq'?'mapa':'mapa-comparacion',{
      preferCanvas:true,zoomControl:false,zoomAnimation:false,fadeAnimation:false
    });
    L.control.zoom({position:'topright'}).addTo(P.map);
    addPane(P.map,`p${i}-extras`,420,false);
    addPane(P.map,`p${i}-tematico`,460,true);
    asegurarExtras(i);
    P.map.on('moveend zoomend',()=>sincronizar(i));
    const referencia = i === 0 ? null : panel(0).map;
    P.map.setView(referencia ? referencia.getCenter() : [2.65,-76.05], referencia ? referencia.getZoom() : 10, {animate:false});
    P.fondo=fondoCapa(el('mapa-base').value);
    if(P.fondo)P.fondo.addTo(P.map);
    cambiarTema(i,P.tipo);
    return P;
  }
  function refrescarTamanos(){
    if(panel(0).map)panel(0).map.invalidateSize({pan:false});
    if(STATE.comparando&&panel(1).map){
      panel(1).map.invalidateSize({pan:false});
      STATE.syncLock=true;
      panel(1).map.setView(panel(0).map.getCenter(),panel(0).map.getZoom(),{animate:false});
      requestAnimationFrame(()=>{STATE.syncLock=false;});
    }
  }

  function actualizarEtiquetasPaneles(){
    const lbl=el('label-visualizacion-izq');
    if(lbl) lbl.textContent = STATE.comparando ? 'Mostrar a la izquierda' : 'Visualización del mapa';
  }

  function modoComparar(activo){
    // Primero mostrar el contenedor; Leaflet no debe inicializarse sobre un panel oculto.
    STATE.comparando=activo;
    show('pane-right',activo);
    el('map-wrapper').classList.toggle('comparacion',activo);
    el('modo-simple').classList.toggle('active',!activo);
    el('modo-comparar').classList.toggle('active',activo);
    el('modo-simple').setAttribute('aria-pressed',String(!activo));
    el('modo-comparar').setAttribute('aria-pressed',String(activo));
    actualizarEtiquetasPaneles();
    if(activo&&!STATE.everCompared){
      STATE.everCompared=true;
      el('visualizacion-izq').value='superficie';
      el('visualizacion-der').value='uaf';
      panel(0).tipo='superficie';panel(1).tipo='uaf';
      cambiarTema(0,'superficie');
    }
    requestAnimationFrame(()=>{
      if(activo&&!panel(1).map){
        crearMapa(1);
      }
      refrescarTamanos();
      // Corregimos los tamaños tras la transición de diseño y las teselas.
      requestAnimationFrame(refrescarTamanos);
      setTimeout(refrescarTamanos,120);
      setTimeout(refrescarTamanos,450);
    });
  }
  function buscarCodigo(){
    const q=norma(el('codigo').value),root=el('resultados-busqueda');root.replaceChildren();
    if(!q){show('resultados-busqueda',false);return;}
    const results=STATE.datos.predios.features.filter(f=>estadoActivo(f)&&norma(f.properties.codigo).includes(q)).slice(0,35);
    if(!results.length){const p=document.createElement('p');p.className='no-results';p.textContent='No se encontraron predios.';root.append(p);}
    results.forEach(f=>{
      const b=document.createElement('button');b.type='button';b.className='result-item';
      const strong=document.createElement('b');strong.textContent=f.properties.codigo;
      const small=document.createElement('small');small.textContent=`${fmt2.format(f.properties.area_ha)} ha · ${f.properties.uaf_nombre||'Sin UAF'}`;
      b.append(strong,small);
      b.addEventListener('click',()=>{
        if(panel(0).tipo==='uaf'){
          el('visualizacion-izq').value='superficie';cambiarTema(0,'superficie');
        }
        const lay=panel(0).indPred.get(f.properties.id);
        if(lay)selectPredio(f.properties,0,lay,null,true);
        show('resultados-busqueda',false);
      });root.append(b);
    });show('resultados-busqueda',true);
  }
  function exportarCSV(){
    const ks=['id','codigo','area_ha','uaf_nombre','uaf_municipio','uaf_ha','estado','alertas'];
    const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const cab=['id','codigo','area_predial_ha','vereda_uaf','municipio_uaf','uaf_referencia_ha','clasificacion','observaciones'];
    const rows=[cab.map(esc).join(',')];
    for(const f of visiblePredios()){
      const p=f.properties,vals=[p.id,p.codigo,p.area_ha,p.uaf_nombre,p.uaf_municipio,p.uaf_ha,CLAS_TEX[categoria(p)],Array.isArray(p.alertas)?p.alertas.join('; '):''];
      rows.push(vals.map(esc).join(','));
    }
    const blob=new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download='UAF_PREDIOS_COMPARACION_EXPLORATORIA.csv';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function resetear(){
    for(const id of ['estado','buscar-vereda','codigo'])el(id).value='';
    el('municipio').value=MUNICIPIO_OBJETIVO;
    STATE.seleccionVeredas.clear();STATE.selected=null;
    show('resultados-busqueda',false);show('resumen-seleccion',false);
    el('detalle').innerHTML='<p class="empty-detail">Haz clic sobre un predio coloreado para ver su código, el área predial, la UAF asignada y la vereda de referencia. También puedes seleccionar una unidad UAF.</p>';
    el('selected-marker').textContent='SIN SELECCIÓN';
    dibujarVeredasSeleccion();actualizar();
    if(STATE.initBounds?.isValid())panel(0).map.fitBounds(STATE.initBounds,{padding:[30,30]});
  }
  function actualizarCapas(){STATE.p.forEach((p,i)=>{if(p.map)actualizarExtras(i);});}
  async function iniciar(){
    if(typeof L==='undefined')throw new Error('Leaflet no cargó. Conecta el computador a internet y abre el visor desde INICIAR_VISOR.bat.');
    const [predios,uaf,veredas,baldios,etiquetas]=await Promise.all([
      resolverDatos('predios.geojson'),resolverDatos('uaf_publicada.geojson'),
      resolverDatos('veredas.geojson'),resolverDatos('baldios.geojson'),
      resolverDatos('etiquetas_uaf.geojson')
    ]);
    STATE.datos={predios,uaf,veredas,baldios,etiquetas};
    cargarMunicipios();cargarVeredas();
    panel(0).tipo=el('visualizacion-izq').value;
    crearMapa(0);
    actualizarEtiquetasPaneles();
    STATE.initBounds=L.geoJSON(uaf,{filter:f=>esMunicipioObjetivo(f.properties.municipio)}).getBounds();
    panel(0).map.fitBounds(STATE.initBounds,{padding:[24,24]});
    el('map-status').textContent='Haz clic en un predio para consultar su información.';
    setTimeout(()=>show('map-status',false),3300);
    actualizar();
    el('municipio').addEventListener('change',()=>{STATE.seleccionVeredas.clear();dibujarVeredasSeleccion();actualizar();});
    el('estado').addEventListener('change',actualizar);
    el('buscar-vereda').addEventListener('input',dibujarVeredasSeleccion);
    el('btn-seleccionar-veredas').addEventListener('click',selectVeredasVisibles);
    el('btn-limpiar-veredas').addEventListener('click',()=>{STATE.seleccionVeredas.clear();dibujarVeredasSeleccion();actualizar();});
    el('btn-zoom-veredas').addEventListener('click',zoomVeredas);
    el('btn-buscar').addEventListener('click',buscarCodigo);
    el('codigo').addEventListener('keydown',e=>{if(e.key==='Enter')buscarCodigo();});
    el('codigo').addEventListener('input',()=>show('resultados-busqueda',false));
    el('btn-reset').addEventListener('click',resetear);
    el('mapa-base').addEventListener('change',cambiarFondos);
    ['ver-uaf','ver-veredas','ver-baldios','ver-etiquetas'].forEach(id=>el(id).addEventListener('change',actualizarCapas));
    el('visualizacion-izq').addEventListener('change',()=>cambiarTema(0,el('visualizacion-izq').value));
    el('visualizacion-der').addEventListener('change',()=>cambiarTema(1,el('visualizacion-der').value));
    el('modo-simple').addEventListener('click',()=>modoComparar(false));
    el('modo-comparar').addEventListener('click',()=>modoComparar(true));
    el('btn-exportar').addEventListener('click',exportarCSV);
    if(typeof ResizeObserver!=='undefined'){
      STATE.observer=new ResizeObserver(()=>requestAnimationFrame(refrescarTamanos));
      STATE.observer.observe(el('map-wrapper'));
    }
    window.addEventListener('resize',()=>requestAnimationFrame(refrescarTamanos));
    console.info(`Visor UAF v0.5 · Inzá · ${predios.features.filter(f=>esMunicipioObjetivo(f.properties.uaf_municipio)).length} predios asociados al municipio, ${uaf.features.filter(f=>esMunicipioObjetivo(f.properties.municipio)).length} UAF publicadas`);
  }
  document.addEventListener('DOMContentLoaded',()=>iniciar().catch(e=>avisoError(e.message)));
})();
