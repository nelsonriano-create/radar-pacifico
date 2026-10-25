// ============================================================
// RADAR PACÍFICO — Conector Banco Mundial (v1, PMV)
// ============================================================
// Lee los avisos de adquisiciones del Banco Mundial (API pública
// procnotices, sin clave) y los traduce a la FICHA COMÚN.
//
// Reglas:
//  - Solo países de América Latina y el Caribe.
//  - Se descartan "Contract Award" (ya adjudicado) y
//    "General Procurement Notice" (plan general, no es un proceso).
//  - Solo avisos con fecha límite vigente.
//  - Tipo: consultoría (CS) → Consultoría; bienes, obras y
//    servicios (GO, WK, NC) → Licitación.
//
// Necesita: expansor.js (normalizar). Corre en el recolector.
// ============================================================

const BANCO_MUNDIAL = {
  nombre: "Banco Mundial",
  url: "https://search.worldbank.org/api/v2/procnotices",
  porPais: 100,                       // los 100 avisos más recientes de cada país
  // Nombre en la API → nombre en español
  paises: {
    "Colombia": "Colombia", "Honduras": "Honduras", "Paraguay": "Paraguay",
    "Nicaragua": "Nicaragua", "Bolivia": "Bolivia", "Ecuador": "Ecuador", "Peru": "Perú",
    "Guatemala": "Guatemala", "El Salvador": "El Salvador", "Panama": "Panamá",
    "Costa Rica": "Costa Rica", "Dominican Republic": "República Dominicana",
    "Haiti": "Haití", "Mexico": "México", "Argentina": "Argentina", "Brazil": "Brasil",
    "Chile": "Chile", "Uruguay": "Uruguay", "Jamaica": "Jamaica",
    "Latin America": "Regional", "Latin America and Caribbean": "Regional"
  },
  descartar: ["contract award", "general procurement notice"]
};

const ENTIDADES = { amp:"&", quot:'"', apos:"'", lt:"<", gt:">", nbsp:" ", ldquo:"“", rdquo:"”", lsquo:"‘", rsquo:"’",
  aacute:"á", eacute:"é", iacute:"í", oacute:"ó", uacute:"ú", ntilde:"ñ", uuml:"ü",
  Aacute:"Á", Eacute:"É", Iacute:"Í", Oacute:"Ó", Uacute:"Ú", Ntilde:"Ñ", ccedil:"ç", atilde:"ã", otilde:"õ" };
function textoBM(v) {
  if (v == null) return "";
  return String(v)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTIDADES[e] ?? " ")
    .replace(/\s+/g, " ").trim();
}

function fichaBM(n, paisEs) {
  const grupo = String(n.procurement_group || "").toUpperCase();
  // CS = servicios de consultoría; todo lo demás (bienes, obras, servicios, "CW"…) es licitación
  const tipo = grupo === "CS" ? "Consultoría" : "Licitación";
  const cierre = n.submission_deadline_date ? new Date(n.submission_deadline_date) : null;
  const pub = n.noticedate ? new Date(n.noticedate) : null;
  return {
    id: "bm:" + n.id,
    fuente: BANCO_MUNDIAL.nombre,
    id_fuente: n.id,
    tipo,
    modalidad: textoBM(n.procurement_method_name) || textoBM(n.notice_type),
    entidad: textoBM(n.contact_organization) || textoBM(n.project_name) || "No informado",
    titulo: textoBM(n.bid_description) || textoBM(n.project_name),
    objeto: textoBM(n.project_name),
    monto: null,
    moneda: null,
    pais: paisEs,
    departamento: "",
    ciudad: "",
    fecha_cierre: cierre && !isNaN(cierre) ? cierre : null,
    fecha_publicacion: pub && !isNaN(pub) ? pub : null,
    estado: "Abierto",
    enlace: "https://projects.worldbank.org/en/projects-operations/procurement-detail/" + encodeURIComponent(n.id),
    documento: false,
    fase: textoBM(n.notice_type),
    nota: n.notice_lang_name && n.notice_lang_name !== "Spanish" ? "Aviso en " + (n.notice_lang_name === "English" ? "inglés" : n.notice_lang_name) : null,
    referencia: textoBM(n.bid_reference_no)
  };
}

async function descargarBancoMundial({ hoy = new Date() } = {}) {
  const inicioHoy = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const informe = { recibidos: 0, adjudicado: 0, yaCerro: 0, sinFecha: 0, duplicado: 0, paisesConError: [] };
  const fichas = [];
  const vistos = new Set();
  const campos = "id,notice_type,noticedate,notice_lang_name,submission_deadline_date,project_ctry_name," +
                 "project_name,bid_reference_no,bid_description,procurement_group,procurement_method_name,contact_organization";

  for (const [paisApi, paisEs] of Object.entries(BANCO_MUNDIAL.paises)) {
    const p = new URLSearchParams({ format: "json", rows: String(BANCO_MUNDIAL.porPais), os: "0",
      srt: "noticedate", order: "desc", project_ctry_name: paisApi, fl: campos });
    let datos;
    try {
      const r = await fetch(BANCO_MUNDIAL.url + "?" + p);
      if (!r.ok) throw new Error("HTTP " + r.status);
      datos = await r.json();
    } catch (e) { informe.paisesConError.push(paisApi + " (" + e.message + ")"); continue; }

    for (const n of datos.procnotices || []) {
      // La API a veces devuelve otros países: se verifica
      if (normalizar(n.project_ctry_name) !== normalizar(paisApi)) continue;
      informe.recibidos++;
      if (BANCO_MUNDIAL.descartar.includes(normalizar(n.notice_type))) { informe.adjudicado++; continue; }
      const f = fichaBM(n, paisEs);
      if (!f.fecha_cierre) { informe.sinFecha++; continue; }
      if (f.fecha_cierre < inicioHoy) { informe.yaCerro++; continue; }
      if (vistos.has(f.id)) { informe.duplicado++; continue; }
      vistos.add(f.id);
      fichas.push(f);
    }
    await new Promise(r => setTimeout(r, 400));        // pausa corta entre países
  }
  informe.mostrados = fichas.length;
  return { fichas, informe };
}

if (typeof module !== "undefined") module.exports = { BANCO_MUNDIAL, fichaBM, descargarBancoMundial };
