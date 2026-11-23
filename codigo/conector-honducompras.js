// ============================================================
// RADAR PACÍFICO — Conector HonduCompras / ONCAE (Honduras)
// ============================================================
// ETAPA DE SONDA: todavía no entrega oportunidades al buscador.
// Abre el buscador de procesos de HonduCompras (sicc.honducompras
// .gob.hn, por HTTP: la versión HTTPS tiene el certificado vencido),
// pide los procesos en etapa "Recepción de Ofertas" (= abiertos) y
// anota en la bitácora cómo viene la respuesta, para escribir luego
// el lector definitivo.
// ============================================================

const HONDUCOMPRAS = {
  nombre: "HonduCompras (ONCAE)",
  url: "http://sicc.honducompras.gob.hn/HC/procesos/busquedahistorico.aspx",
  etapaRecepcion: "3"
};
const CAB_HC = { "User-Agent": "Mozilla/5.0 (RadarPacifico; recolector diario)", "Accept-Language": "es" };

function textoHC(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// Campos del formulario (incluidos los ocultos de ASP.NET: __VIEWSTATE, etc.)
function camposFormularioHC(html) {
  const campos = {};
  for (const m of html.matchAll(/<input[^>]*>/gi)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]+)"/) || [])[1];
    if (!name) continue;
    const tipo = ((tag.match(/type="([^"]+)"/) || [])[1] || "text").toLowerCase();
    if (tipo === "submit" || tipo === "button" || tipo === "image") continue;
    campos[name] = ((tag.match(/value="([^"]*)"/) || [])[1] || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }
  for (const m of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const sel = (m[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/) || m[2].match(/<option[^>]*value="([^"]*)"/) || [])[1];
    campos[m[1]] = sel || "";
  }
  return campos;
}

async function descargarHonduCompras() {
  const r1 = await fetch(HONDUCOMPRAS.url, { headers: CAB_HC });
  const html1 = await r1.text();
  const galletas = (r1.headers.getSetCookie ? r1.headers.getSetCookie() : []).map(c => c.split(";")[0]).join("; ");
  const campos = camposFormularioHC(html1);
  const informe = { sonda: true, getStatus: r1.status, getLargo: html1.length, campos: Object.keys(campos).map(k => k + ":" + String(campos[k]).length) };

  campos["ctl00$cphCuerpo$wpParametros$ddlEtapas"] = HONDUCOMPRAS.etapaRecepcion;
  campos["ctl00$cphCuerpo$wpParametros$btnBuscar"] = "Buscar";
  const r2 = await fetch(HONDUCOMPRAS.url, {
    method: "POST",
    headers: { ...CAB_HC, "Content-Type": "application/x-www-form-urlencoded", "Cookie": galletas, "Referer": HONDUCOMPRAS.url },
    body: new URLSearchParams(campos).toString()
  });
  const html2 = await r2.text();
  informe.postStatus = r2.status;
  informe.postLargo = html2.length;

  // Filas de tablas con varias celdas: muestra para conocer la estructura
  const filas = [];
  for (const tr of html2.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const celdas = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => textoHC(c[1]));
    if (celdas.length >= 4 && celdas.join("").length > 30 && celdas.join("").length < 1500) filas.push(celdas);
  }
  informe.filasConCeldas = filas.length;
  informe.muestraFilas = filas.slice(0, 8).map(c => c.map(x => x.slice(0, 120)));
  informe.enlaces = [...new Set([...html2.matchAll(/href="([^"]+)"/gi)].map(m => m[1])
    .filter(h => !/\.css|\.js|oncae\.gob|#$|javascript:void/i.test(h)))].slice(0, 15);
  informe.postbacks = [...new Set([...html2.matchAll(/__doPostBack\(&#39;([^&]+)&#39;,&#39;([^&]*)&#39;/g)].map(m => m[1] + "|" + m[2]))].slice(0, 15);
  informe.textoTotales = (textoHC(html2).match(/[^.]{0,80}(registros|resultados|encontr|Total)[^.]{0,80}/i) || [""])[0];
  return { fichas: [], informe };
}

if (typeof module !== "undefined") module.exports = { HONDUCOMPRAS, camposFormularioHC, descargarHonduCompras };
