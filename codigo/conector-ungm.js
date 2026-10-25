// ============================================================
// RADAR PACÍFICO — Conector UNGM (Naciones Unidas) (v1, PMV)
// ============================================================
// UNGM reúne las compras de casi todo el sistema ONU (PNUD, OIT,
// UNICEF, OIM, FAO, UNOPS…). No tiene API pública: el conector
// hace lo mismo que el navegador cuando alguien abre la página:
//   1. Abre www.ungm.org/Public/Notice y toma la "ficha de
//      verificación" que la página entrega (y su cookie).
//   2. Pide al servicio interno las páginas de avisos ACTIVOS,
//      de 15 en 15 (el máximo que acepta), con una pausa entre
//      páginas para no exceder su límite (responde "429" si se
//      piden muy rápido).
//   3. Se queda con los avisos de América Latina y el Caribe.
//
// Reglas:
//  - Tipo: "Llamado a consultores/as" → Consultoría;
//    "Llamado a entidades asociadas" → Convocatoria;
//    presupuesto, propuesta, licitación, manifestación de
//    interés e información → Licitación.
//  - Solo avisos con fecha límite vigente (se toma solo el día).
//  - Se descartan "Varias localizaciones" (casi siempre globales).
//  - Monto y moneda: UNGM no los publica → No informado.
//
// La página puede responder en español o en inglés: el conector
// entiende los dos idiomas (meses, tipos y países).
// ============================================================

const UNGM = {
  nombre: "UNGM (ONU)",
  base: "https://www.ungm.org",
  porPagina: 15,
  maxPaginas: 120,          // tope de seguridad (hoy son ~35 páginas)
  pausaMs: 1500             // pausa entre páginas
};

// País tal como lo escribe UNGM (es o en) → país en español
const PAISES_UNGM = {
  "colombia": "Colombia", "honduras": "Honduras", "paraguay": "Paraguay", "nicaragua": "Nicaragua",
  "bolivia": "Bolivia", "bolivia (estado plurinacional de)": "Bolivia", "bolivia (plurinational state of)": "Bolivia",
  "ecuador": "Ecuador", "peru": "Perú",
  "guatemala": "Guatemala", "el salvador": "El Salvador", "panama": "Panamá", "costa rica": "Costa Rica",
  "republica dominicana": "República Dominicana", "dominican republic": "República Dominicana",
  "haiti": "Haití", "mexico": "México", "argentina": "Argentina", "brasil": "Brasil", "brazil": "Brasil",
  "chile": "Chile", "uruguay": "Uruguay", "cuba": "Cuba", "jamaica": "Jamaica",
  "venezuela": "Venezuela", "venezuela (republica bolivariana de)": "Venezuela",
  "venezuela (bolivarian republic of)": "Venezuela",
  "belice": "Belice", "belize": "Belice", "guyana": "Guyana", "surinam": "Surinam", "suriname": "Surinam",
  "trinidad y tabago": "Trinidad y Tobago", "trinidad and tobago": "Trinidad y Tobago",
  "barbados": "Barbados", "bahamas": "Bahamas"
};
// Misma lista, escrita como la deja normalizar() (sin tildes ni signos)
const PAISES_UNGM_N = Object.fromEntries(Object.entries(PAISES_UNGM).map(([k, v]) => [normalizar(k), v]));
const VARIOS = ["varias localizaciones", "multiple destinations", "multiple locations", "plusieurs lieux"];

// Meses en español, inglés y francés (UNGM escribe "03-nov.-2026" o "03-Nov-2026")
const MESES = { ene:1, jan:1, janv:1, feb:2, fev:2, fevr:2, mar:3, mars:3, abr:4, apr:4, avr:4, may:5, mai:5,
  jun:6, juin:6, jul:7, juil:7, ago:8, aug:8, aout:8, sep:9, sept:9, set:9, oct:10, nov:11, dic:12, dec:12 };

function fechaUNGM(txt) {
  const m = normalizar(txt).match(/(\d{1,2}) ([a-z]+) (\d{4})/);   // "03-nov.-2026" → "03 nov 2026"
  if (!m || !MESES[m[2]]) return null;
  const d = new Date(Date.UTC(Number(m[3]), MESES[m[2]] - 1, Number(m[1])));
  return isNaN(d) ? null : d;
}

function tipoUNGM(t) {
  const n = normalizar(t);
  if (n.includes("consultor") || n.includes("individual consultant")) return "Consultoría";
  if (n.includes("entidades asociadas") || n.includes("implementing partner") || n.includes("call for proposal"))
    return "Convocatoria";
  return "Licitación";
}

// Texto limpio de un pedazo de HTML
function limpiar(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")     // programas de la página: no son texto
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Convierte la respuesta HTML del servicio en una lista de filas
function leerFilasUNGM(html) {
  const filas = [];
  const partes = String(html).split(/(?=<div[^>]*data-noticeid=")/);
  for (const p of partes) {
    const id = (p.match(/data-noticeid="(\d+)"/) || [])[1];
    if (!id) continue;
    const celdas = p.split(/<div[^>]*class="tableCell/).slice(1);
    if (celdas.length < 8) continue;
    // Orden de columnas: [opciones, título, fecha límite, publicado, agencia, tipo, referencia, país]
    const span = c => limpiar((c.match(/<span[^>]*>([\s\S]*?)<\/span>/) || [])[1] || "");  // primer <span> de la celda
    const titulo = limpiar((celdas[1].match(/<span[^>]*ungm-title[^>]*>([\s\S]*?)<\/span>/) || [])[1] || "");
    const limite = limpiar((celdas[2].match(/<span>([\s\S]*?)<\/span>/) || [])[1] || celdas[2]);
    filas.push({
      id, titulo, limite,
      publicado: span(celdas[3]),
      agencia:   span(celdas[4]),
      tipo:      span(celdas[5]),
      referencia:span(celdas[6]),
      pais:      span(celdas[7])
    });
  }
  return filas;
}

function fichaUNGM(f, paisEs) {
  return {
    id: "ungm:" + f.id,
    fuente: UNGM.nombre,
    id_fuente: f.id,
    tipo: tipoUNGM(f.tipo),
    modalidad: f.tipo,
    entidad: f.agencia || "No informado",
    titulo: f.titulo,
    objeto: "",
    monto: null,
    moneda: null,
    pais: paisEs,
    departamento: "",
    ciudad: "",
    fecha_cierre: fechaUNGM(f.limite),
    fecha_publicacion: fechaUNGM(f.publicado),
    estado: "Abierto",
    enlace: UNGM.base + "/Public/Notice/" + f.id,
    documento: false,
    fase: "",
    nota: null,
    referencia: f.referencia
  };
}

// --- Conexión: toma la ficha de verificación y la cookie ---
async function abrirSesionUNGM() {
  const r = await fetch(UNGM.base + "/Public/Notice", {
    headers: { "User-Agent": "Mozilla/5.0 (RadarPacifico; recolector diario)", "Accept-Language": "es" }
  });
  if (!r.ok) throw new Error("No abre la página de avisos (HTTP " + r.status + ")");
  const html = await r.text();
  const token = (html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/) ||
                 html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/) || [])[1];
  if (!token) throw new Error("La página no entregó la ficha de verificación");
  const galletas = (r.headers.getSetCookie ? r.headers.getSetCookie() : [])
    .map(c => c.split(";")[0]).join("; ");
  return { token, galletas };
}

async function paginaUNGM(sesion, indice) {
  const cuerpo = { PageIndex: indice, PageSize: UNGM.porPagina, Title: "", Description: "", Reference: "",
    PublishedFrom: "", PublishedTo: "", DeadlineFrom: "", DeadlineTo: "", Countries: [], Agencies: [],
    UNSPSCs: [], NoticeTypes: [], SortField: "DatePublished", SortAscending: false, isPicker: false,
    IsSustainable: false, IsActive: true, NoticeDisplayType: null,
    NoticeSearchTotalLabelId: "noticeSearchTotal", TypeOfCompetitions: [] };
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch(UNGM.base + "/Public/Notice/Search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "*/*", "X-Requested-With": "XMLHttpRequest",
        "RequestVerificationToken": sesion.token, "Cookie": sesion.galletas, "Accept-Language": "es",
        "User-Agent": "Mozilla/5.0 (RadarPacifico; recolector diario)", "Referer": UNGM.base + "/Public/Notice" },
      body: JSON.stringify(cuerpo)
    });
    if (r.status === 429) { await new Promise(x => setTimeout(x, 30000 * intento)); continue; }  // pidió calma
    if (!r.ok) throw new Error("Página " + indice + ": HTTP " + r.status);
    return leerFilasUNGM(await r.text());
  }
  throw new Error("Página " + indice + ": UNGM sigue pidiendo pausa (429)");
}

async function descargarUNGM({ hoy = new Date() } = {}) {
  const inicioHoy = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const informe = { paginas: 0, recibidos: 0, otrasRegiones: 0, variasLocalizaciones: 0, sinFecha: 0,
    yaCerro: 0, duplicado: 0, tipos: {} };
  const fichas = [];
  const vistos = new Set();
  const sesion = await abrirSesionUNGM();

  for (let i = 0; i < UNGM.maxPaginas; i++) {
    const filas = await paginaUNGM(sesion, i);
    informe.paginas++;
    if (!filas.length) break;
    for (const f of filas) {
      informe.recibidos++;
      const p = normalizar(f.pais);
      if (VARIOS.includes(p)) { informe.variasLocalizaciones++; continue; }
      const paisEs = PAISES_UNGM[p] || PAISES_UNGM_N[p];
      if (!paisEs) {
        informe.otrasRegiones++;
        informe.paisesVistos = informe.paisesVistos || {};
        informe.paisesVistos[f.pais] = (informe.paisesVistos[f.pais] || 0) + 1;
        continue;
      }
      const ficha = fichaUNGM(f, paisEs);
      if (!ficha.fecha_cierre) { informe.sinFecha++; continue; }
      if (ficha.fecha_cierre < inicioHoy) { informe.yaCerro++; continue; }
      if (vistos.has(ficha.id)) { informe.duplicado++; continue; }
      vistos.add(ficha.id);
      informe.tipos[f.tipo] = (informe.tipos[f.tipo] || 0) + 1;
      fichas.push(ficha);
    }
    await new Promise(x => setTimeout(x, UNGM.pausaMs));
  }
  if (informe.recibidos === 0) throw new Error("UNGM respondió, pero sin avisos (¿cambió la página?)");
  // Diagnóstico: solo los 25 países más frecuentes que no se reconocieron
  if (informe.paisesVistos) informe.paisesVistos = Object.fromEntries(
    Object.entries(informe.paisesVistos).sort((a, b) => b[1] - a[1]).slice(0, 25));
  informe.mostrados = fichas.length;
  return { fichas, informe };
}

if (typeof module !== "undefined")
  module.exports = { UNGM, leerFilasUNGM, fichaUNGM, fechaUNGM, tipoUNGM, descargarUNGM };
