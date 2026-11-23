// ============================================================
// RADAR PACÍFICO — Conector Empleos.hn (Honduras) (v1)
// ============================================================
// Empleos.hn es una bolsa de empleo hondureña con una categoría
// "Consultorías" donde publican ONG, cooperación y proyectos con
// financiamiento externo (BID, OCP, Cruz Roja…). No tiene API:
// el conector lee la página igual que una persona:
//   1. Recorre la categoría "Consultorías" (todas sus páginas).
//   2. Hace además unas búsquedas por palabra (licitación,
//      términos de referencia, cotización, adquisición) para
//      atrapar compras publicadas en otras categorías; de esas
//      solo se queda con las que de verdad lo parecen.
//   3. Entra a cada aviso para tomar el título completo (en el
//      listado se corta con "...") y el inicio de la descripción.
//
// Reglas:
//  - País: Honduras. Moneda: HNL, monto No informado (casi nunca
//    se publica).
//  - Cierre: "Fecha Max. Postulación" (se toma solo el día).
//  - Tipo: Consultoría; si el título habla de licitación,
//    adquisición, compra, suministro o cotización → Licitación.
//  - Entidad: la que muestra el aviso; si dice "Empleos HN"
//    (publicado por el portal a nombre de otro) → No informado.
//  - Departamento: el del aviso; si trae los 18 → "Nacional".
//  - Se descartan ofertas de servicios ("Ofrecemos…", freelance),
//    pasantías y avisos con cierre a más de un año.
//  - Pausa de 1 s entre páginas para no sobrecargar el portal.
// ============================================================

const EMPLEOSHN = {
  nombre: "Empleos.hn",
  base: "https://empleos.hn",
  categoria: 54,                       // "Consultorías"
  palabras: ["licitación", "términos de referencia", "cotización", "adquisición"],
  maxPaginas: 15,                      // tope por recorrido (hoy son 2)
  pausaMs: 1000
};

const CABECERAS_EHN = { "User-Agent": "Mozilla/5.0 (RadarPacifico; recolector diario)", "Accept-Language": "es" };
const esperar = ms => new Promise(x => setTimeout(x, ms));

// Texto limpio de un pedazo de HTML
function textoEHN(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}
const sinTildesEHN = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Lee las tarjetas de una página del listado
function leerTarjetasEHN(html) {
  const tarjetas = [];
  for (const p of String(html).split('<div class="tarjeta">').slice(1)) {
    const enlace = (p.match(/href="([^"]*\/jobs\/[^"]+)"/) || [])[1];
    if (!enlace) continue;
    tarjetas.push({
      enlace: enlace.startsWith("http") ? enlace : EMPLEOSHN.base + enlace,
      titulo: textoEHN((p.match(/class="nombre-empresa">([\s\S]*?)<\/div>/) || [])[1]),
      entidad: textoEHN((p.match(/class="nombre-posicion">([\s\S]*?)<br/) || [])[1]),
      ubicacion: textoEHN((p.match(/class="ubicacion">([\s\S]*?)<\/div>/) || [])[1]).replace(/^\s*📍\s*/u, "").trim(),
      cierre: (p.match(/datetime="(\d{4}-\d{2}-\d{2})/) || [])[1] || null
    });
  }
  const hayMas = /pager__item--next/.test(html);
  return { tarjetas, hayMas };
}

// Lee la ficha de un aviso: título completo, categoría y descripción
function leerAvisoEHN(html) {
  const titulo = textoEHN((String(html).match(/<title>([\s\S]*?)<\/title>/) || [])[1]).replace(/\s*\|\s*RDS - Empleos\.hn\s*$/i, "");
  const campo = nombre => {
    const i = html.indexOf("field--name-" + nombre);
    if (i < 0) return "";
    const trozo = html.slice(i, i + 4000);
    return textoEHN((trozo.match(/field__item[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
  };
  // La página tiene varios bloques "body" (publicidad, analítica); el del aviso es el más largo
  const cuerpo = (() => {
    let mejor = "";
    for (let i = html.indexOf("field--name-body"); i >= 0; i = html.indexOf("field--name-body", i + 1)) {
      const t = trozoBody(i);
      if (t.length > mejor.length) mejor = t;
    }
    return mejor;
  })();
  function trozoBody(i) {
    const trozo = html.slice(i, i + 20000).replace(/^[^>]*>/, "")       // desde donde empieza la descripción
      .split(/<footer|field--name-|class="a2a/)[0]                       // hasta el siguiente campo
      .replace(/<[^>]*$/, "");                                             // sin la etiqueta que quedó a medias
    return textoEHN(trozo);
  }
  const correo = campo("field-correo-o-url-para-aplicar-");
  return { titulo, categoria: campo("field-categoria"), descripcion: cuerpo.replace(/^Descripción\s*/i, ""), correo };
}

const DEPARTAMENTOS_HN = 18;
function departamentoEHN(u) {
  const partes = String(u || "").split(",").map(s => s.trim()).filter(Boolean);
  if (partes.length >= DEPARTAMENTOS_HN) return "Nacional";
  return partes.join(", ");
}

function tipoEHN(titulo) {
  const n = sinTildesEHN(titulo);
  if (/licitacion|adquisicion|compra de|suministro|cotizacion|\bbienes\b|\bobras?\b/.test(n)) return "Licitación";
  return "Consultoría";
}

// ¿Una tarjeta encontrada por palabra (fuera de la categoría) es de verdad una oportunidad?
function pareceOportunidadEHN(t) {
  return /consultor|terminos de referencia|\btdr\b|licitacion|cotizacion|adquisicion|propuesta|servicios profesionales|auditoria|evaluacion/
    .test(sinTildesEHN(t));
}

// Avisos que NO son oportunidades: personas o empresas que ofrecen sus
// servicios, pasantías, o "avisos permanentes" con cierre a años vista.
function esRuidoEHN(t) {
  const n = sinTildesEHN(t.titulo);
  if (/^(ofrecemos|ofrezco|brindo|brindamos|se ofrece|servicios? de freelance)|freelance|\bpasant/.test(n)) return true;
  if (/^consultor(a|es|as)? independientes?$/.test(n)) return true;
  return false;
}
const MAX_DIAS_CIERRE = 365;   // un cierre a más de un año suele ser un aviso permanente

function fichaEHN(t, aviso) {
  const slug = t.enlace.split("/jobs/")[1] || t.enlace;
  const titulo = (aviso && aviso.titulo) || t.titulo;
  const entidad = /^empleos ?hn$/i.test(t.entidad.trim()) ? "No informado" : (t.entidad || "No informado");
  return {
    id: "empleoshn:" + slug,
    fuente: EMPLEOSHN.nombre,
    id_fuente: slug,
    tipo: tipoEHN(titulo),
    modalidad: (aviso && aviso.categoria) || "Consultorías",
    entidad,
    titulo,
    objeto: aviso && aviso.descripcion ? aviso.descripcion.slice(0, 600) : "",
    monto: null,
    moneda: "HNL",
    pais: "Honduras",
    departamento: departamentoEHN(t.ubicacion),
    ciudad: "",
    fecha_cierre: t.cierre ? new Date(t.cierre + "T00:00:00Z") : null,
    fecha_publicacion: null,
    estado: "Abierto",
    enlace: t.enlace,
    documento: false,
    fase: "",
    nota: null
  };
}

async function traerEHN(url) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch(url, { headers: CABECERAS_EHN });
    if (r.ok) return r.text();
    if (r.status === 429 || r.status >= 500) { await esperar(5000 * intento); continue; }
    throw new Error("HTTP " + r.status + " en " + url);
  }
  throw new Error("El portal no respondió tras 3 intentos: " + url);
}

// Recorre todas las páginas de un listado
async function recorrerEHN(parametros, informe) {
  const todas = [];
  for (let pagina = 0; pagina < EMPLEOSHN.maxPaginas; pagina++) {
    const url = EMPLEOSHN.base + "/busqueda-avanzada?" + parametros + "&page=" + pagina;
    const { tarjetas, hayMas } = leerTarjetasEHN(await traerEHN(url));
    informe.paginas++;
    todas.push(...tarjetas);
    if (!hayMas || !tarjetas.length) break;
    await esperar(EMPLEOSHN.pausaMs);
  }
  return todas;
}

async function descargarEmpleosHN({ hoy = new Date() } = {}) {
  const hoyTxt = hoy.toISOString().slice(0, 10);
  const informe = { paginas: 0, categoria: 0, porPalabra: 0, descartadasPorPalabra: 0,
    sinFecha: 0, yaCerro: 0, ruido: 0, duplicado: 0, fichasSinLeer: 0, tipos: {} };
  const candidatas = new Map();           // enlace → tarjeta

  // 1. Categoría "Consultorías"
  for (const t of await recorrerEHN("field_categoria_target_id=" + EMPLEOSHN.categoria, informe)) {
    informe.categoria++;
    if (candidatas.has(t.enlace)) { informe.duplicado++; continue; }
    candidatas.set(t.enlace, t);
  }
  // 2. Búsquedas por palabra (otras categorías)
  for (const palabra of EMPLEOSHN.palabras) {
    await esperar(EMPLEOSHN.pausaMs);
    for (const t of await recorrerEHN("keys=" + encodeURIComponent(palabra), informe)) {
      informe.porPalabra++;
      if (candidatas.has(t.enlace)) { informe.duplicado++; continue; }
      if (!pareceOportunidadEHN(t.titulo)) { informe.descartadasPorPalabra++; continue; }
      candidatas.set(t.enlace, t);
    }
  }
  if (informe.categoria === 0) throw new Error("La categoría Consultorías llegó vacía (¿cambió la página?)");

  // 3. Fichas de cada aviso vigente
  const fichas = [];
  for (const t of candidatas.values()) {
    if (!t.cierre) { informe.sinFecha++; continue; }
    if (t.cierre < hoyTxt) { informe.yaCerro++; continue; }
    if (esRuidoEHN(t) || (new Date(t.cierre) - hoy) / 864e5 > MAX_DIAS_CIERRE) { informe.ruido++; continue; }
    let aviso = null;
    try { aviso = leerAvisoEHN(await traerEHN(t.enlace)); }
    catch (e) { informe.fichasSinLeer++; }       // si falla, se usa lo del listado
    const f = fichaEHN(t, aviso);
    informe.tipos[f.tipo] = (informe.tipos[f.tipo] || 0) + 1;
    fichas.push(f);
    await esperar(EMPLEOSHN.pausaMs);
  }
  informe.mostrados = fichas.length;
  return { fichas, informe };
}

if (typeof module !== "undefined")
  module.exports = { EMPLEOSHN, esRuidoEHN, leerTarjetasEHN, leerAvisoEHN, fichaEHN, tipoEHN, departamentoEHN, descargarEmpleosHN };
