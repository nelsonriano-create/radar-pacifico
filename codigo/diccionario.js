// ============================================================
// RADAR PACÍFICO — Diccionario de familias de términos (v1, PMV)
// ============================================================
// Cada familia agrupa palabras que significan lo mismo para el
// buscador. Si el usuario escribe cualquiera de ellas, se buscan
// TODAS las de la familia.
//
// Cómo editar (no hace falta saber programar):
//  - Cada término va entre comillas y separado por coma.
//  - Las tildes y mayúsculas dan igual ("Apícola" = "apicola").
//  - Los plurales simples se reconocen solos (abeja = abejas).
//  - "excluir": frases que NO deben contar como coincidencia
//    (p. ej. "luna de miel" no es apicultura).
// ============================================================

const DICCIONARIO = [
  {
    familia: "Apicultura",
    es: ["apicultura", "apicola", "miel", "abejas", "colmenas", "apicultores"],
    en: ["beekeeping", "apiculture", "honey", "bees", "beekeepers"],
    pt: ["apicultura", "mel", "abelhas", "apicultores"],
    excluir: ["luna de miel"]
  },
  {
    familia: "Videovigilancia",
    es: ["cctv", "videovigilancia", "camaras de seguridad", "camaras de vigilancia",
         "circuito cerrado de television", "videocamaras"],
    en: ["cctv", "video surveillance", "security cameras", "surveillance cameras"],
    pt: ["cftv", "videomonitoramento", "cameras de seguranca"],
    excluir: ["camara de comercio", "camara de representantes"]
  },
  {
    familia: "Control de acceso",
    es: ["control de acceso", "control de accesos", "biometria", "biometrico",
         "reconocimiento facial", "torniquetes"],
    en: ["access control", "biometric", "facial recognition", "turnstiles"],
    pt: ["controle de acesso", "biometria", "reconhecimento facial", "catracas"],
    excluir: []
  },
  {
    familia: "Alarmas e intrusión",
    es: ["alarmas", "deteccion de intrusion", "sistema de seguridad electronica",
         "seguridad electronica", "sensores de movimiento"],
    en: ["alarm system", "intrusion detection", "electronic security"],
    pt: ["alarme", "seguranca eletronica", "deteccao de intrusao"],
    excluir: []
  },
  {
    familia: "Cableado estructurado",
    es: ["cableado estructurado", "red de datos", "redes de datos", "puntos de red",
         "cableado de red"],
    en: ["structured cabling", "data network", "network cabling"],
    pt: ["cabeamento estruturado", "rede de dados"],
    excluir: []
  },
  {
    familia: "Mejora de procesos",
    es: ["mejoramiento de procesos", "mejora de procesos", "optimizacion de procesos",
         "lean", "six sigma", "lean six sigma", "productividad", "cuellos de botella",
         "teoria de restricciones"],
    en: ["process improvement", "process optimization", "lean", "six sigma",
         "productivity"],
    pt: ["melhoria de processos", "otimizacao de processos", "produtividade"],
    excluir: []
  },
  {
    familia: "Logística",
    es: ["logistica", "cadena de suministro", "cadena de abastecimiento",
         "distribucion en planta", "inventarios", "almacenamiento"],
    en: ["logistics", "supply chain", "plant layout", "inventory management"],
    pt: ["logistica", "cadeia de suprimentos", "cadeia de abastecimento"],
    excluir: []
  },
  {
    familia: "Planeación y diagnóstico",
    es: ["planeacion estrategica", "planificacion estrategica", "plan estrategico",
         "diagnostico organizacional", "reorganizacion", "rediseño organizacional",
         "estructura de costos", "sistema de costos"],
    en: ["strategic planning", "strategic plan", "organizational assessment",
         "organizational diagnosis", "restructuring"],
    pt: ["planejamento estrategico", "diagnostico organizacional"],
    excluir: []
  },
  {
    familia: "Proyectos",
    es: ["formulacion de proyectos", "gestion de proyectos", "gerencia de proyectos",
         "pmo", "oficina de proyectos", "estructuracion de proyectos"],
    en: ["project design", "project management", "project formulation"],
    pt: ["gestao de projetos", "elaboracao de projetos"],
    excluir: []
  },
  {
    familia: "Transformación digital",
    es: ["transformacion digital", "analitica de datos", "inteligencia artificial",
         "automatizacion de procesos", "ciencia de datos"],
    en: ["digital transformation", "data analytics", "artificial intelligence",
         "process automation", "data science"],
    pt: ["transformacao digital", "analise de dados", "inteligencia artificial"],
    excluir: []
  },
  {
    familia: "Certificaciones",
    es: ["iso 9001", "iso 14001", "iso 45001", "basc", "sistema de gestion de calidad",
         "sistema integrado de gestion", "certificacion iso"],
    en: ["quality management system", "iso certification", "iso 9001"],
    pt: ["sistema de gestao da qualidade", "certificacao iso"],
    excluir: []
  }
];

// (Línea técnica: permite usar este archivo también en pruebas automáticas.)
if (typeof module !== "undefined") module.exports = { DICCIONARIO };
