// ============================================================
// RADAR PACÍFICO — Conector SECOP II (v1, PMV)
// ============================================================
// Traduce los procesos de SECOP II (datos.gov.co, conjunto
// p6dx-8zbt) a la FICHA COMÚN del Radar.
//
// Pasos:
//  1. PEDIR: arma la consulta a datos.gov.co con los términos
//     del expansor (solo procesos recientes y sin contratación
//     directa).
//  2. FILTRAR: descarta lo que no es oportunidad (ya tiene
//     contratista, ya cerró, cancelado, duplicado) y lo que no
//     coincide con palabras completas.
//  3. TRADUCIR: convierte cada fila en una ficha común.
//  4. INFORMAR: cuenta cuánto llegó y por qué se descartó cada
//     cosa (así detectamos si SECOP cambia algo).
//
// Necesita: expansor.js (normalizar, raiz, coincide).
// ============================================================

const SECOP = {
  nombre: "SECOP II",
  url: "https://www.datos.gov.co/resource/p6dx-8zbt.json",
  diasAtras: 90,      // solo procesos publicados en los últimos 90 días
  limite: 1000        // máximo de filas por consulta
};

// --- Utilidades pequeñas -------------------------------------
function textoSecop(v) {
  if (v == null) return "";
  if (typeof v === "object") return v.url || v.description || "";   // el enlace viene "envuelto"
  return String(v).replace(/\s*;\s*/g, ", ").trim();                // SECOP cambia comas por ";"
}
function fechaSecop(v) {
  const t = textoSecop(v);
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d) ? null : d;
}
function definido(v) {                                   // "No Definido" = sin dato
  const t = textoSecop(v);
  return /^(no definido|no aplica|n\/a|ninguno)$/.test(normalizar(t)) ? "" : t;
}
function montoSecop(v) {
  const n = Number(String(v || "").replace(/[^0-9.]/g, ""));
  return n > 0 ? n : null;
}

// --- 1. PEDIR ------------------------------------------------
// Para la consulta al portal se usan las vocales como comodín
// ("_"), así "APICOLA" también trae "APÍCOLA". El filtro fino de
// palabras completas se hace después, en el paso 2.
function consultaSecop(grupos, hoy = new Date()) {
  const desde = new Date(hoy.getTime() - SECOP.diasAtras * 86400000).toISOString().slice(0, 10);
  const condiciones = new Set();
  for (const g of grupos) {
    for (const t of g.terminos) {
      // Palabras cortas (miel, lean, pmo) van exactas: con comodines traerían demasiado ruido
      const base = normalizar(t).split(" ").map(raiz)
        .map(p => p.length >= 5 ? p.toUpperCase().replace(/[AEIOU]/g, "_") : p.toUpperCase())
        .join(" ");
      condiciones.add(`upper(nombre_del_procedimiento) like '%${base}%'`);
      condiciones.add(`upper(descripci_n_del_procedimiento) like '%${base}%'`);
    }
  }
  const where =
    `fecha_de_publicacion_del > '${desde}'` +
    ` AND upper(modalidad_de_contratacion) not like '%DIRECTA%'` +
    ` AND (${[...condiciones].join(" OR ")})`;
  const p = new URLSearchParams({
    "$where": where,
    "$order": "fecha_de_publicacion_del DESC",
    "$limit": String(SECOP.limite)
  });
  return SECOP.url + "?" + p.toString();
}

// --- 3. TRADUCIR a la ficha común ----------------------------
function tipoSecop(modalidad) {
  const m = normalizar(modalidad);
  if (m.includes("concurso de meritos")) return "Consultoría";
  if (m.includes("solicitud de informacion")) return "Licitación";   // cotización / estudio de mercado
  if (m.includes("minima cuantia") || m.includes("seleccion abreviada") ||
      m.includes("licitacion") || m.includes("regimen especial")) return "Licitación";
  return "Sin clasificar";
}

function fichaSecop(fila, estado) {
  const titulo = textoSecop(fila.nombre_del_procedimiento);
  const objeto = textoSecop(fila.descripci_n_del_procedimiento);
  const enlace = textoSecop(fila.urlproceso);
  return {
    id: "secop2:" + textoSecop(fila.id_del_proceso),
    fuente: SECOP.nombre,
    id_fuente: textoSecop(fila.id_del_proceso),
    tipo: tipoSecop(fila.modalidad_de_contratacion),
    modalidad: textoSecop(fila.modalidad_de_contratacion),
    entidad: textoSecop(fila.entidad) || "No informado",
    titulo: titulo || objeto,
    objeto: objeto && objeto !== titulo ? objeto : "",
    monto: montoSecop(fila.precio_base),
    moneda: "COP",
    pais: "Colombia",
    departamento: definido(fila.departamento_entidad),
    ciudad: definido(fila.ciudad_entidad),
    fecha_cierre: fechaSecop(fila.fecha_de_recepcion_de),
    fecha_publicacion: fechaSecop(fila.fecha_de_publicacion_del),
    estado,                                            // "Abierto" o "Próximamente"
    enlace: estado === "Próximamente" ? null : (enlace || null),
    documento: false,
    fase: textoSecop(fila.fase),
    nota: normalizar(fila.modalidad_de_contratacion).includes("solicitud de informacion")
      ? "Solicitud de cotización (estudio de mercado): aún no es el proceso definitivo" : null,
    original: fila
  };
}

// --- 2. FILTRAR ----------------------------------------------
// Devuelve { fichas, informe }.
function filtrarSecop(filas, grupos, hoy = new Date()) {
  const informe = {
    recibidos: filas.length,
    directa: 0, adjudicado: 0, cerrado: 0, yaCerro: 0, enCurso: 0, sinFecha: 0,
    sinCoincidencia: 0, duplicado: 0, incompleto: 0,
    otrosEstados: {}, otrasFases: {}
  };
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const vistos = new Set();
  const fichas = [];

  for (const f of filas) {
    // a) Contratación directa (por si se coló alguna)
    if (normalizar(f.modalidad_de_contratacion).includes("directa")) { informe.directa++; continue; }

    // b) Ya tiene contratista
    const prov = normalizar(textoSecop(f.nombre_del_proveedor));
    if ((prov && prov !== "no definido" && prov !== "no aplica") ||
        normalizar(f.adjudicado) === "si") { informe.adjudicado++; continue; }

    // c) Estado del proceso
    const est = normalizar(f.estado_del_procedimiento);
    let estado;
    if (est.includes("borrador") || est.includes("aprobacion")) estado = "Próximamente";
    else if (est.includes("publicado") || est === "abierto") estado = "Abierto";
    else if (/evaluacion|seleccionado|adjudicado|cancelado|desierto|terminado|cerrado|suspendido/.test(est)) {
      informe.cerrado++; continue;
    } else {
      const clave = textoSecop(f.estado_del_procedimiento) || "(vacío)";
      informe.otrosEstados[clave] = (informe.otrosEstados[clave] || 0) + 1;
      continue;
    }

    // d) La FASE dice que ya pasó la etapa de ofertas (evaluación, selección, contrato, ejecución…)
    const fase = normalizar(f.fase);
    if (/evaluacion|seleccion|adjudic|contrat|ejecucion|cerrad|terminad|liquidacion|cancel|desiert/.test(fase)) {
      informe.enCurso++; continue;
    }
    if (fase && !/presentacion|observacion|manifestacion|borrador|aprobacion|publicacion|recepcion|ofertas?|cotizacion|informacion/.test(fase)) {
      const clave = textoSecop(f.fase);
      informe.otrasFases[clave] = (informe.otrasFases[clave] || 0) + 1;   // se muestra, pero se avisa
    }

    // e) La fecha de cierre ya pasó (se cuenta todo el día de cierre)
    const cierre = fechaSecop(f.fecha_de_recepcion_de);
    if (cierre && cierre < inicioHoy) { informe.yaCerro++; continue; }

    // f) Abierto pero SIN fecha de cierre: se descarta. En SECOP II son decenas de miles
    //    (sobre todo régimen especial) y casi todos ya están cerrados o en ejecución.
    if (estado === "Abierto" && !cierre) { informe.sinFecha++; continue; }

    // e) Palabras completas (aquí se cae "consultorio", "lapiceros"…).
    //    El recolector no busca palabras (grupos = null): guarda todo lo abierto.
    let encontrados = [];
    if (grupos) {
      const texto = textoSecop(f.nombre_del_procedimiento) + " " + textoSecop(f.descripci_n_del_procedimiento);
      encontrados = coincide(texto, grupos);
      if (encontrados.length === 0) { informe.sinCoincidencia++; continue; }
    }

    // f) Reglas obligatorias de la ficha
    const ficha = fichaSecop(f, estado);
    if (!ficha.id_fuente || !ficha.titulo || (estado === "Abierto" && !ficha.enlace)) {
      informe.incompleto++; continue;
    }

    // g) Duplicados (mismo ID, o misma entidad + título + monto)
    const k1 = ficha.id_fuente;
    const k2 = normalizar(ficha.entidad + "|" + ficha.titulo + "|" + ficha.monto);
    if (vistos.has(k1) || vistos.has(k2)) { informe.duplicado++; continue; }
    vistos.add(k1); vistos.add(k2);

    ficha.encontrados = encontrados;
    fichas.push(ficha);
  }

  // Lo que cierra primero, arriba; los "Próximamente" al final
  fichas.sort((a, b) =>
    (a.estado === "Próximamente") - (b.estado === "Próximamente") ||
    (a.fecha_cierre || 8.64e15) - (b.fecha_cierre || 8.64e15));

  informe.mostrados = fichas.length;
  return { fichas, informe };
}

// --- Para el RECOLECTOR: traer todo lo abierto ---------------
// Pide a SECOP, de a 1.000 filas, los procesos competitivos con
// fecha de cierre vigente, más los que están en borrador o en
// aprobación ("Próximamente").
async function descargarSecop({ token = "", hoy = new Date(), maxPaginas = 15 } = {}) {
  const dia = hoy.toISOString().slice(0, 10);
  const desde = new Date(hoy.getTime() - 180 * 86400000).toISOString().slice(0, 10);
  const comun = `fecha_de_publicacion_del > '${desde}' AND upper(modalidad_de_contratacion) not like '%DIRECTA%'`;
  const consultas = [
    `${comun} AND estado_del_procedimiento in('Publicado','Abierto') AND fecha_de_recepcion_de >= '${dia}'`,
    `${comun} AND estado_del_procedimiento in('Borrador','En aprobación')`
  ];
  const cabeceras = token ? { "X-App-Token": token } : {};
  const filas = [];
  for (const where of consultas) {
    for (let pagina = 0; pagina < maxPaginas; pagina++) {
      const p = new URLSearchParams({ "$where": where, "$order": "fecha_de_publicacion_del DESC",
        "$limit": "1000", "$offset": String(pagina * 1000) });
      const r = await fetch(SECOP.url + "?" + p, { headers: cabeceras });
      if (!r.ok) throw new Error("SECOP II respondió " + r.status + ": " + (await r.text()).slice(0, 200));
      const lote = await r.json();
      filas.push(...lote);
      if (lote.length < 1000) break;
    }
  }
  return filtrarSecop(filas, null, hoy);
}

// --- Todo junto: buscar en SECOP II --------------------------
async function buscarSecop(grupos) {
  const url = consultaSecop(grupos);
  const r = await fetch(url);
  if (!r.ok) throw new Error("SECOP II respondió con error " + r.status);
  const filas = await r.json();
  const resultado = filtrarSecop(filas, grupos);
  resultado.url = url;
  resultado.informe.tope = filas.length >= SECOP.limite;   // ¿llegamos al máximo?
  return resultado;
}

if (typeof module !== "undefined")
  module.exports = { SECOP, consultaSecop, filtrarSecop, fichaSecop, tipoSecop, buscarSecop, descargarSecop };
