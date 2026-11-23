// ============================================================
// RADAR PACÍFICO — Conector HonduCompras / ONCAE (Honduras) (v1)
// ============================================================
// HonduCompras es el sistema oficial de compras del Estado de
// Honduras (lo administra ONCAE). No tiene API, y su versión HTTPS
// tiene el certificado vencido; pero el buscador de procesos
// responde por HTTP sencillo (solo lectura de datos públicos).
// El conector hace lo mismo que una persona en el buscador:
//   1. Abre el buscador y toma los datos ocultos del formulario
//      (ASP.NET: __VIEWSTATE, __EVENTVALIDATION…).
//   2. Busca la etapa "Recepción de Ofertas" (= procesos abiertos).
//   3. Recorre todas las páginas de resultados.
//   4. Repite la búsqueda solo con tipo "Consultoría" para marcar
//      cuáles de esos procesos son consultorías.
//
// Reglas:
//  - Tipo: Consultoría si aparece en la búsqueda de consultorías;
//    si no, Licitación.
//  - Modalidad: la del portal (licitación pública nacional,
//    concurso privado, compra menor…).
//  - Cierre: "Fecha Cierre" (solo el día). País: Honduras, HNL.
//  - Monto: el listado no lo trae → No informado.
//  - Funciona desde EE. UU. (GitHub); desde Colombia el portal
//    a veces no abre en el navegador.
// ============================================================

const HONDUCOMPRAS = {
  nombre: "HonduCompras (ONCAE)",
  url: "http://sicc.honducompras.gob.hn/HC/procesos/busquedahistorico.aspx",
  baseDetalle: "http://sicc.honducompras.gob.hn/HC/procesos/",
  etapaRecepcion: "3",
  tipoConsultoria: "3",
  maxPaginas: 60,
  pausaMs: 1200
};
const CAB_HC = { "User-Agent": "Mozilla/5.0 (RadarPacifico; recolector diario)", "Accept-Language": "es" };
const C = "ctl00$cphCuerpo$wpParametros$";
const esperarHC = ms => new Promise(x => setTimeout(x, ms));

function decodHC(t) {
  return String(t || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
function textoHC(html) {
  return decodHC(String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// Campos del formulario (incluidos los ocultos de ASP.NET)
function camposFormularioHC(html) {
  const campos = {};
  for (const m of html.matchAll(/<input[^>]*>/gi)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]+)"/) || [])[1];
    if (!name) continue;
    const tipo = ((tag.match(/type="([^"]+)"/) || [])[1] || "text").toLowerCase();
    if (["submit", "button", "image", "checkbox", "radio"].includes(tipo)) continue;
    campos[name] = decodHC((tag.match(/value="([^"]*)"/) || [])[1] || "");
  }
  for (const m of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const sel = (m[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/) || m[2].match(/<option[^>]*value="([^"]*)"/) || [])[1];
    campos[m[1]] = sel || "";
  }
  return campos;
}

// "16/11/2026" → fecha
function fechaHC(t) {
  const m = String(t || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
}

// Lee las filas de resultados de una página
function leerFilasHC(html) {
  const filas = [];
  // Se corta en cada "<tr": así cada pedazo tiene solo las celdas de su fila
  // (aunque la tabla de resultados esté dentro de otra tabla de diseño)
  for (const pedazo of String(html).split(/<tr\b[^>]*>/i).slice(1)) {
    const tr = [null, pedazo];
    const celdasHtml = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1]);
    if (celdasHtml.length < 5) continue;
    const t0 = textoHC(celdasHtml[0]);
    if (!/^Expediente\s*:/i.test(t0)) continue;     // solo filas de resultados (no tablas de diseño)
    const entre = (desde, hasta) => {
      const m = t0.match(new RegExp(desde + "\\s*:\\s*([\\s\\S]*?)\\s*(?:" + hasta + "|$)", "i"));
      return m ? m[1].trim() : "";
    };
    const fechas = textoHC(celdasHtml[3]);
    const enlace = decodHC((tr[1].match(/href="(ProcesoHistorico\.aspx\?[^"]+)"/i) || [])[1] || "");
    filas.push({
      expediente: entre("Expediente", "Entidad\\s*:"),
      entidad: entre("Entidad", "Unidad Compra\\s*:"),
      unidad: entre("Unidad Compra", "Objeto[^:]*:"),
      objeto: (t0.match(/Objeto[^:]*:\s*([\s\S]*)$/i) || [])[1] || "",
      etapa: textoHC(celdasHtml[1]),
      modalidad: textoHC(celdasHtml[2]),
      inicio: fechaHC((fechas.match(/Inicio\s*:\s*([\d/]+)/i) || [])[1]),
      cierre: fechaHC((fechas.match(/Cierre\s*:\s*([\d/]+)/i) || [])[1]),
      enlace: enlace ? HONDUCOMPRAS.baseDetalle + enlace : "",
      id: decodeURIComponent((enlace.match(/Id0=([^&]+)/) || [])[1] || "")
    });
  }
  return filas;
}

// Números de página que ofrece el paginador (Page$2, Page$3…)
function paginasOfrecidasHC(html) {
  return [...new Set([...decodHC(html).matchAll(/Page\$(\d+)/g)].map(m => Number(m[1])))];
}

async function postHC(campos, galletas) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch(HONDUCOMPRAS.url, {
      method: "POST",
      headers: { ...CAB_HC, "Content-Type": "application/x-www-form-urlencoded", "Cookie": galletas, "Referer": HONDUCOMPRAS.url },
      body: new URLSearchParams(campos).toString()
    });
    if (r.ok) return r.text();
    if (r.status >= 500) { await esperarHC(5000 * intento); continue; }
    throw new Error("HTTP " + r.status + " al buscar");
  }
  throw new Error("HonduCompras no respondió tras 3 intentos");
}

// Una búsqueda completa (todas las páginas) con los filtros dados
async function buscarHC(filtros, informe) {
  const r = await fetch(HONDUCOMPRAS.url, { headers: CAB_HC });
  if (!r.ok) throw new Error("No abre el buscador (HTTP " + r.status + ")");
  const galletas = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(c => c.split(";")[0]).join("; ");
  let campos = camposFormularioHC(await r.text());
  if (!campos.__VIEWSTATE) throw new Error("El buscador no entregó el formulario (¿cambió la página?)");
  Object.assign(campos, filtros, { [C + "btnBuscar"]: "Buscar" });

  let html = await postHC(campos, galletas);
  const filas = [];
  let actual = 1;
  for (let i = 0; i < HONDUCOMPRAS.maxPaginas; i++) {
    informe.paginas++;
    filas.push(...leerFilasHC(html));
    const siguiente = paginasOfrecidasHC(html).filter(n => n > actual).sort((a, b) => a - b)[0];
    if (!siguiente) break;
    await esperarHC(HONDUCOMPRAS.pausaMs);
    campos = camposFormularioHC(html);                   // el formulario cambia en cada página
    delete campos[C + "btnBuscar"];
    campos.__EVENTTARGET = "ctl00$cphCuerpo$gvResultados";
    campos.__EVENTARGUMENT = "Page$" + siguiente;
    html = await postHC(campos, galletas);
    actual = siguiente;
  }
  return filas;
}

function fichaHC(f, esConsultoria) {
  const idf = f.id || f.expediente;
  return {
    id: "honducompras:" + idf,
    fuente: HONDUCOMPRAS.nombre,
    id_fuente: f.expediente || idf,
    tipo: esConsultoria ? "Consultoría" : "Licitación",
    modalidad: f.modalidad,
    entidad: f.entidad || "No informado",
    titulo: f.objeto || f.expediente,
    objeto: f.unidad ? "Unidad de compra: " + f.unidad : "",
    monto: null,
    moneda: "HNL",
    pais: "Honduras",
    departamento: "",
    ciudad: "",
    fecha_cierre: f.cierre,
    fecha_publicacion: f.inicio,
    estado: "Abierto",
    enlace: f.enlace || HONDUCOMPRAS.url,
    documento: false,
    fase: f.etapa,
    nota: null
  };
}

async function descargarHonduCompras({ hoy = new Date() } = {}) {
  const inicioHoy = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const informe = { paginas: 0, recibidos: 0, consultorias: 0, sinFecha: 0, yaCerro: 0, duplicado: 0, modalidades: {} };

  const todas = await buscarHC({ [C + "ddlEtapas"]: HONDUCOMPRAS.etapaRecepcion }, informe);
  if (!todas.length) throw new Error("HonduCompras respondió, pero sin procesos en Recepción de Ofertas (¿cambió la página?)");

  // Consultorías: si esta segunda búsqueda falla, se sigue sin marcarlas
  const consultorias = new Set();
  try {
    await esperarHC(HONDUCOMPRAS.pausaMs);
    for (const f of await buscarHC({ [C + "ddlEtapas"]: HONDUCOMPRAS.etapaRecepcion, [C + "ddlTipoAdquisicion"]: HONDUCOMPRAS.tipoConsultoria }, informe))
      consultorias.add(f.id || f.expediente);
  } catch (e) { informe.avisoConsultorias = String(e.message || e).slice(0, 150); }

  const fichas = [];
  const vistos = new Set();
  for (const f of todas) {
    informe.recibidos++;
    if (!f.cierre) { informe.sinFecha++; continue; }
    if (f.cierre < inicioHoy) { informe.yaCerro++; continue; }
    const clave = f.id || f.expediente;
    if (vistos.has(clave)) { informe.duplicado++; continue; }
    vistos.add(clave);
    const esC = consultorias.has(clave);
    if (esC) informe.consultorias++;
    informe.modalidades[f.modalidad] = (informe.modalidades[f.modalidad] || 0) + 1;
    fichas.push(fichaHC(f, esC));
  }
  informe.mostrados = fichas.length;
  return { fichas, informe };
}

if (typeof module !== "undefined")
  module.exports = { HONDUCOMPRAS, camposFormularioHC, leerFilasHC, paginasOfrecidasHC, fichaHC, descargarHonduCompras };
