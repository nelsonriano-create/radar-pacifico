// ============================================================
// RADAR PACÍFICO — Expansor de términos (v1, PMV)
// ============================================================
// Recibe lo que escribe el usuario (p. ej. "apicultura") y:
//  1. Detecta a qué familia del diccionario pertenece.
//  2. Devuelve todos los términos de esa familia (ES, EN, PT).
//  3. Permite revisar si un texto (título u objeto de una
//     oportunidad) coincide con la búsqueda.
//
// Reglas:
//  - Sin tildes ni mayúsculas.
//  - Plurales simples (abeja = abejas, red = redes).
//  - Solo palabras completas ("miel" no encuentra "familiar").
//  - Frases exactas ("control de acceso").
//  - Varias ideas se separan con coma: "apicultura, cctv".
//  - Si la palabra no está en el diccionario, se busca tal cual.
// ============================================================

// --- 1. Normalizar: quitar tildes, mayúsculas y signos -------
function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // quita tildes y la virgulilla de la ñ
    .replace(/[^a-z0-9]+/g, " ")                        // signos y guiones → espacio
    .trim();
}

// --- 2. Raíz de una palabra (para reconocer plurales) --------
function raiz(palabra) {
  if (palabra.length <= 3) return palabra;              // "de", "red", "pmo": se dejan igual
  if (/[lrndzj]es$/.test(palabra)) return palabra.slice(0, -2); // redes → red, sensores → sensor
  if (palabra.endsWith("s")) return palabra.slice(0, -1);       // abejas → abeja
  return palabra;
}

// --- 3. Patrón de búsqueda de una frase ----------------------
// Convierte "camaras de seguridad" en un patrón que acepta
// "cámara de seguridad", "cámaras de seguridad", etc.,
// y solo como palabras completas.
function patron(frase) {
  const palabras = normalizar(frase).split(" ").filter(Boolean);
  const partes = palabras.map(p => {
    if (p.length <= 2) return p;                        // "de", "la", "en": exactas
    return raiz(p) + "(?:s|es)?";
  });
  return new RegExp("(?:^| )" + partes.join(" ") + "(?= |$)");
}

function clave(frase) {
  return normalizar(frase).split(" ").map(raiz).join(" ");
}

// --- 4. Expandir la consulta del usuario ---------------------
// Devuelve una lista de "grupos". Cada grupo es una idea de la
// consulta con sus términos y exclusiones.
function expandir(consulta, diccionario) {
  const partes = String(consulta || "").split(",").map(normalizar).filter(Boolean);
  const grupos = [];

  for (const parte of partes) {
    const familias = diccionario.filter(f => {
      const terminos = [...f.es, ...f.en, ...f.pt];
      return terminos.some(t => clave(t) === clave(parte) || patron(t).test(parte));
    });

    if (familias.length === 0) {
      // No está en el diccionario: se busca la palabra tal cual.
      grupos.push({ escrito: parte, familias: [], terminos: [parte], excluir: [] });
    } else {
      const terminos = new Set([parte]);
      const excluir = new Set();
      for (const f of familias) {
        [...f.es, ...f.en, ...f.pt].forEach(t => terminos.add(normalizar(t)));
        (f.excluir || []).forEach(e => excluir.add(normalizar(e)));
      }
      grupos.push({
        escrito: parte,
        familias: familias.map(f => f.familia),
        terminos: [...terminos],
        excluir: [...excluir]
      });
    }
  }
  return grupos;
}

// --- 5. ¿Este texto coincide con la búsqueda? ----------------
// Devuelve los términos encontrados (lista vacía = no coincide).
function coincide(texto, grupos) {
  const base = normalizar(texto);
  const encontrados = [];
  for (const g of grupos) {
    // Primero se borran las frases trampa del texto
    let limpio = " " + base + " ";
    for (const e of g.excluir) limpio = limpio.replace(new RegExp(patron(e).source, "g"), " ");
    limpio = limpio.trim();
    for (const t of g.terminos) {
      if (patron(t).test(limpio) && !encontrados.includes(t)) encontrados.push(t);
    }
  }
  return encontrados;
}

if (typeof module !== "undefined") module.exports = { normalizar, raiz, expandir, coincide, patron };
