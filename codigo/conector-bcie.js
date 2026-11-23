// ============================================================
// RADAR PACÍFICO — Conector BCIE (Banco Centroamericano de
// Integración Económica, sede en Tegucigalpa) (v1)
// ============================================================
// El BCIE no tiene API, pero sus tablas vienen completas en la
// página (sin paginar). El conector lee dos tablas:
//   1. Avisos de adquisición en PROYECTOS financiados por el BCIE:
//      licitaciones y consultorías que ejecutan los gobiernos
//      (Honduras, Nicaragua, Guatemala…). La página trae todos los
//      avisos como datos dentro de su código (en español, con
//      entidad ejecutora, objeto, categoría y fecha de recepción);
//      se dejan los de fecha de recepción vigente.
//   2. Adquisiciones INSTITUCIONALES en curso (del propio banco):
//      solo las de categoría Consultoría; el resto son servicios
//      internos (mantenimiento, vigilancia…).
//
// Reglas:
//  - Proyectos: tipo según la categoría del BCIE (Consultorías
//    individuales/firmas → Consultoría; bienes, obras, servicios →
//    Licitación). Si no trae categoría: el código termina en -CI/-CF (consultor individual
//    o firma) → Consultoría; en -O/-B (obras o bienes) → Licitación;
//    si no trae sufijo, el título habla de diseño, supervisión, estudio o
//    consultoría → Consultoría; si no → Licitación.
//  - Cierre: "Fecha de recepción" / "Fecha de vencimiento".
//  - Monto: no se publica → No informado.
//  - Institucionales: no traen país; se usa el que aparezca en el
//    título y, si no hay, Honduras (sede del banco).
//  - La página puede llegar en español o en inglés: se entienden
//    los dos (meses, países, categorías).
// ============================================================

const BCIE = {
  nombre: "BCIE",
  proyectos: "https://www.bcie.org/adquisiciones-en-proyectos/avisos-de-adquisicion",
  institucionales: "https://www.bcie.org/adquisiciones-institucionales/en-curso"
};
const CAB_BCIE = { "User-Agent": "Mozilla/5.0 (RadarPacifico; recolector diario)", "Accept-Language": "es" };

function textoBCIE(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}
const sinTildesBCIE = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MESES_BCIE = { enero:1, january:1, febrero:2, february:2, marzo:3, march:3, abril:4, april:4, mayo:5, may:5,
  junio:6, june:6, julio:7, july:7, agosto:8, august:8, septiembre:9, setiembre:9, september:9, octubre:10, october:10,
  noviembre:11, november:11, diciembre:12, december:12 };
// "October 23, 2026" o "23 de octubre de 2026" o "23/10/2026"
function fechaBCIE(t) {
  if (!t) return null;
  const iso = String(t).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/);
  if (iso) {                                    // "2026-12-15T06:00:00.000Z": hora de Centroamérica → ese día
    const d = new Date(String(t)); d.setUTCHours(d.getUTCHours() - 6);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const n = sinTildesBCIE(t);
  let m = n.match(/([a-z]+) (\d{1,2}),? (\d{4})/);
  if (m && MESES_BCIE[m[1]]) return new Date(Date.UTC(+m[3], MESES_BCIE[m[1]] - 1, +m[2]));
  m = n.match(/(\d{1,2}) (?:de )?([a-z]+) (?:de )?(\d{4})/);
  if (m && MESES_BCIE[m[2]]) return new Date(Date.UTC(+m[3], MESES_BCIE[m[2]] - 1, +m[1]));
  m = n.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

const PAISES_BCIE = { "honduras": "Honduras", "nicaragua": "Nicaragua", "guatemala": "Guatemala", "el salvador": "El Salvador",
  "costa rica": "Costa Rica", "panama": "Panamá", "belize": "Belice", "belice": "Belice",
  "republica dominicana": "República Dominicana", "dominican republic": "República Dominicana",
  "argentina": "Argentina", "colombia": "Colombia", "mexico": "México", "cuba": "Cuba", "taiwan": "Taiwán",
  "corea": "Corea del Sur", "korea": "Corea del Sur", "espana": "España", "spain": "España",
  "ecuador": "Ecuador", "peru": "Perú", "paraguay": "Paraguay", "bolivia": "Bolivia", "uruguay": "Uruguay", "brasil": "Brasil", "brazil": "Brasil" };
function paisBCIE(t) {
  const n = sinTildesBCIE(t);
  for (const [k, v] of Object.entries(PAISES_BCIE)) if (new RegExp("\\b" + k + "\\b").test(n)) return v;
  return null;
}

// Filas de la tabla: celdas como texto + primer enlace
function filasBCIE(html) {
  const filas = [];
  for (const pedazo of String(html).split(/<tr\b[^>]*>/i).slice(1)) {
    const fila = pedazo.split(/<\/tr>/i)[0];
    const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1]);
    if (celdas.length < 5) continue;
    filas.push({ celdas: celdas.map(textoBCIE), enlace: (fila.match(/href="([^"]*avisos-de-adquisicion\/[^"]+)"/) || [])[1] || "" });
  }
  return filas;
}

// Los avisos vienen como objetos JSON dentro del código de la página
// (escapados como texto de JavaScript: \"campo\":\"valor\")
function avisosEnDatosBCIE(html) {
  const avisos = [];
  const re = /\{\\"id\\":\d+,\\"address\\":[\s\S]*?\\"createdAt\\":\\"[^"\\]*\\"\}/g;
  for (const m of String(html).matchAll(re)) {
    let obj = null;
    try { obj = JSON.parse(JSON.parse('"' + m[0] + '"')); }          // quita el escape de JavaScript y lee el JSON
    catch (e) {
      try { obj = JSON.parse(m[0].replace(/\\"/g, '"').replace(/\\\\/g, "\\")); } catch (e2) { obj = null; }
    }
    if (obj && obj.process_number !== undefined && obj.reception_date !== undefined) avisos.push(obj);
  }
  return avisos;
}
function limpiarBCIE(t) { return String(t || "").replace(/\s+/g, " ").trim(); }

function tipoBCIE(categoria, codigo, texto) {
  const c = sinTildesBCIE(categoria);
  if (c.startsWith("consultoria")) return "Consultoría";
  if (c.startsWith("bienes") || c.startsWith("obras") || c.startsWith("servicios")) return "Licitación";
  return tipoProyectoBCIE(codigo, texto);
}

function tipoProyectoBCIE(id, titulo) {
  const cod = String(id).replace(/\s+/g, "");
  if (/-C[IF]$/i.test(cod)) return "Consultoría";            // consultor individual o firma
  if (/-[OB]$/i.test(cod)) return "Licitación";              // obras o bienes
  if (/consultor|supervisi|disen|design|estudio|study|asesor|advisory|consulting|auditor/.test(sinTildesBCIE(titulo))) return "Consultoría";
  return "Licitación";
}

async function traerBCIE(url) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch(url, { headers: CAB_BCIE });
    if (r.ok) return r.text();
    if (r.status === 429 || r.status >= 500) { await new Promise(x => setTimeout(x, 5000 * intento)); continue; }
    throw new Error("HTTP " + r.status + " en " + url);
  }
  throw new Error("El BCIE no respondió tras 3 intentos");
}

function base(ficha) {
  return Object.assign({ monto: null, moneda: null, departamento: "", ciudad: "", estado: "Abierto",
    documento: false, fase: "", nota: null }, ficha);
}

async function descargarBCIE({ hoy = new Date() } = {}) {
  const inicioHoy = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const informe = { proyectos: 0, institucionales: 0, institucionalesNoConsultoria: 0, sinFecha: 0, yaCerro: 0,
    duplicado: 0, avisoInstitucionales: undefined, paises: {} };
  const fichas = [];
  const vistos = new Set();
  const agregar = f => {
    if (!f.fecha_cierre) { informe.sinFecha++; return; }
    if (f.fecha_cierre < inicioHoy) { informe.yaCerro++; return; }
    if (vistos.has(f.id)) { informe.duplicado++; return; }
    vistos.add(f.id);
    informe.paises[f.pais] = (informe.paises[f.pais] || 0) + 1;
    fichas.push(f);
  };

  // 1. Proyectos. La tabla la arma el navegador con JavaScript, pero la
  //    página trae TODOS los avisos (vigentes y viejos) como datos dentro
  //    de su código: se leen de ahí y se dejan los de recepción vigente.
  const htmlProyectos = await traerBCIE(BCIE.proyectos);
  const avisos = avisosEnDatosBCIE(htmlProyectos);
  informe.avisosEnPagina = avisos.length;
  if (!avisos.length) {
    // Respaldo: si algún día la tabla viene armada, se lee la tabla
    for (const { celdas: c, enlace } of filasBCIE(htmlProyectos))
      avisos.push({ process_number: c[0], title_project: c[1], country: c[2], start_date_sale: c[3], reception_date: c[4], _enlace: enlace });
  }
  for (const a of avisos) {
    informe.proyectos++;
    const codigo = String(a.process_number || "").trim() || ("bcie-" + a.id);
    const pais = PAISES_BCIE[sinTildesBCIE(a.country)] || (/^rep\.? dominicana/i.test(a.country || "") ? "República Dominicana" : (a.country || "Regional"));
    const titulo = limpiarBCIE(a.title_project) || limpiarBCIE(a.object).slice(0, 200) || codigo;
    agregar(base({
      id: "bcie:" + codigo, fuente: BCIE.nombre, id_fuente: codigo,
      tipo: tipoBCIE(a.category, codigo, titulo + " " + (a.object || "")),
      modalidad: limpiarBCIE(a.modality_description) || "Proyecto financiado por el BCIE",
      entidad: limpiarBCIE(a.executor) ? limpiarBCIE(a.executor) + " · BCIE" : "Proyecto financiado por el BCIE",
      titulo,
      objeto: [limpiarBCIE(a.object), limpiarBCIE(a.name) && "Programa: " + limpiarBCIE(a.name)].filter(Boolean).join(" · ").slice(0, 600),
      pais,
      fecha_cierre: fechaBCIE(a.reception_date) || fechaBCIE(a.end_date_sale),
      fecha_publicacion: fechaBCIE(a.start_date_sale),
      enlace: a._enlace || (a.id ? BCIE.proyectos + "/" + a.id + "-" + encodeURIComponent(codigo) : BCIE.proyectos)
    }));
  }
  if (informe.proyectos === 0) throw new Error("No se encontraron avisos de proyectos en la página (¿cambió?)");

  // 2. Institucionales: [bien o servicio, método, categoría, publicación, vencimiento, tiempo]
  try {
    for (const { celdas: c } of filasBCIE(await traerBCIE(BCIE.institucionales))) {
      informe.institucionales++;
      const [titulo, metodo, categoria, publicado, vence] = c;
      if (!/consult/i.test(sinTildesBCIE(categoria))) { informe.institucionalesNoConsultoria++; continue; }
      const codigo = (titulo.match(/^(\d{2,4}[\/ -]\d{4})/) || [])[1] || titulo.slice(0, 40);
      agregar(base({
        id: "bcie-inst:" + codigo.replace(/\s+/g, "-"), fuente: BCIE.nombre, id_fuente: codigo,
        tipo: "Consultoría", modalidad: metodo, entidad: "BCIE · Adquisición institucional",
        titulo: titulo.replace(/^\d{2,4}[\/ -]\d{4}\s*/, "").replace(/^["“]|["”]$/g, ""), objeto: "",
        pais: paisBCIE(titulo) || "Honduras",
        fecha_cierre: fechaBCIE(vence), fecha_publicacion: fechaBCIE(publicado),
        enlace: BCIE.institucionales
      }));
    }
  } catch (e) { informe.avisoInstitucionales = String(e.message || e).slice(0, 150); }

  informe.mostrados = fichas.length;
  return { fichas, informe };
}

if (typeof module !== "undefined")
  module.exports = { BCIE, avisosEnDatosBCIE, filasBCIE, fechaBCIE, tipoProyectoBCIE, paisBCIE, descargarBCIE };
