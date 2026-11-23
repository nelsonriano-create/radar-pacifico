// ============================================================
// RADAR PACÍFICO — Recolector diario (v1, PMV)
// ============================================================
// Lo ejecuta GitHub todos los días (ver .github/workflows).
//  1. Llama a cada conector (SECOP II, Banco Mundial, UNGM, Empleos.hn…).
//  2. Junta todas las oportunidades ABIERTAS en un solo archivo:
//     datos/oportunidades.json  ← esto es lo que lee el buscador.
//  3. Anota en una bitácora cómo le fue a cada fuente.
// Si una fuente falla, las demás siguen; y se conservan los datos
// de ayer de la fuente que falló, para no dejar el buscador vacío.
// También se conservan si la fuente responde "bien" pero trae muy
// pocos resultados (menos de la mitad que ayer): eso suele ser un
// daño en el portal (como pasó con datos.gov.co el 15-nov-2026).
// ============================================================

const fs = require("fs");
const path = require("path");

// Funciones compartidas con el buscador
Object.assign(global, require("../codigo/expansor.js"));
const { descargarSecop } = require("../codigo/conector-secop.js");
const { descargarBancoMundial } = require("../codigo/conector-bancomundial.js");
const { descargarUNGM } = require("../codigo/conector-ungm.js");
const { descargarEmpleosHN } = require("../codigo/conector-empleoshn.js");
const { descargarHonduCompras } = require("../codigo/conector-honducompras.js");
const { descargarBCIE } = require("../codigo/conector-bcie.js");

const CARPETA = path.join(__dirname, "..", "datos");
const ARCHIVO = path.join(CARPETA, "oportunidades.json");
const BITACORA = path.join(CARPETA, "bitacora.json");

// Lista de fuentes activas. Agregar una fuente = agregar una línea.
const FUENTES = [
  { nombre: "SECOP II",      correr: () => descargarSecop({ token: process.env.SECOP_TOKEN || "" }) },
  { nombre: "Banco Mundial", correr: () => descargarBancoMundial() },
  { nombre: "UNGM (ONU)",    correr: () => descargarUNGM() },
  { nombre: "Empleos.hn",    correr: () => descargarEmpleosHN() },
  { nombre: "HonduCompras (ONCAE)", correr: () => descargarHonduCompras() },
  { nombre: "BCIE",          correr: () => descargarBCIE() }
];

// La ficha que se guarda (sin los datos originales, para que el archivo sea liviano)
const CAMPOS = ["id", "fuente", "id_fuente", "tipo", "modalidad", "entidad", "titulo", "objeto",
  "monto", "moneda", "pais", "departamento", "ciudad", "fecha_cierre", "fecha_publicacion",
  "estado", "enlace", "fase", "nota"];
function liviana(f) {
  const o = {};
  for (const c of CAMPOS) {
    let v = f[c];
    if (v instanceof Date) v = v.toISOString();
    if (v !== undefined && v !== null && v !== "") o[c] = v;
  }
  return o;
}

function leerJson(ruta, porDefecto) {
  try { return JSON.parse(fs.readFileSync(ruta, "utf8")); } catch (e) { return porDefecto; }
}

// Si hoy una fuente trae menos de esta fracción de lo de ayer, se
// considera sospechosa y se conservan los datos de ayer.
const UMBRAL_CAIDA = 0.5;
// Solo se aplica si ayer la fuente tenía al menos esta cantidad
// (para que una fuente pequeña, que varía mucho, no se bloquee).
const MINIMO_PARA_COMPARAR = 50;

// Devuelve las oportunidades de ayer de una fuente que siguen abiertas
// (quita las que ya cerraron; las "Próximamente" sin fecha se quedan).
function conservarDeAyer(anterior, nombre) {
  const hoy = new Date().toISOString().slice(0, 10);
  return (anterior.oportunidades || []).filter(o =>
    o.fuente === nombre && (!o.fecha_cierre || String(o.fecha_cierre).slice(0, 10) >= hoy));
}

(async () => {
  const inicio = Date.now();
  const anterior = leerJson(ARCHIVO, { oportunidades: [] });
  const todas = [];
  const resumen = [];

  for (const fuente of FUENTES) {
    const t0 = Date.now();
    try {
      const { fichas, informe } = await fuente.correr();
      const deAyer = conservarDeAyer(anterior, fuente.nombre);
      const sospechosa = deAyer.length >= MINIMO_PARA_COMPARAR && fichas.length < deAyer.length * UMBRAL_CAIDA;
      if (sospechosa) {
        // Respondió, pero trajo muy poco: se usan las de ayer
        todas.push(...deAyer);
        resumen.push({ fuente: fuente.nombre, estado: "advertencia",
          mensaje: `Trajo ${fichas.length} y ayer había ${deAyer.length}: posible daño en la fuente; se conservan las de ayer`,
          oportunidades: deAyer.length, recibidasHoy: fichas.length, conservadasDeAyer: true,
          segundos: Math.round((Date.now() - t0) / 1000), informe });
        console.log(`⚠ ${fuente.nombre}: trajo ${fichas.length} (ayer ${deAyer.length}); se conservan las de ayer`);
      } else {
        todas.push(...fichas.map(liviana));
        resumen.push({ fuente: fuente.nombre, estado: "ok", oportunidades: fichas.length,
          segundos: Math.round((Date.now() - t0) / 1000), informe });
        console.log(`✔ ${fuente.nombre}: ${fichas.length} oportunidades abiertas`);
      }
    } catch (e) {
      // Falló: se conservan las de ayer de esta fuente (solo las que siguen abiertas)
      const deAyer = conservarDeAyer(anterior, fuente.nombre);
      todas.push(...deAyer);
      resumen.push({ fuente: fuente.nombre, estado: "error", mensaje: String(e.message || e).slice(0, 300),
        oportunidades: deAyer.length, conservadasDeAyer: true });
      console.log(`✘ ${fuente.nombre}: ${e.message} (se conservan ${deAyer.length} de ayer)`);
    }
  }

  fs.mkdirSync(CARPETA, { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify({
    generado: new Date().toISOString(),
    total: todas.length,
    fuentes: resumen.map(r => ({ fuente: r.fuente, estado: r.estado, oportunidades: r.oportunidades })),
    oportunidades: todas
  }));

  // Bitácora: se guardan las últimas 60 ejecuciones
  const bitacora = leerJson(BITACORA, []);
  bitacora.unshift({ fecha: new Date().toISOString(), segundos: Math.round((Date.now() - inicio) / 1000), fuentes: resumen });
  fs.writeFileSync(BITACORA, JSON.stringify(bitacora.slice(0, 60), null, 1));

  console.log(`Listo: ${todas.length} oportunidades guardadas en datos/oportunidades.json`);
  // Si TODAS las fuentes fallaron, se marca la ejecución como fallida para que GitHub avise
  if (resumen.every(r => r.estado === "error")) process.exit(1);
})();
