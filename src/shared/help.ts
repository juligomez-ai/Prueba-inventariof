/** Guías paso a paso: las usa el Centro de ayuda (M14) y el Copiloto (RF-13.7). */
export const HELP_TOPICS = [
  {
    title: "Comprar y recibir",
    href: "/compras",
    keywords: ["compr", "recib", "recepci", "proveedor", "oc", "orden de compra", "remisi"],
    steps: [
      "Compras → Nueva orden de compra (o desde los faltantes de una orden de producción).",
      "Marca la OC como enviada y registra el envío del proveedor: transportadora, guía y fecha estimada.",
      "Cuando llegue, Recibir mercancía: cantidad, número de bultos, lote y vencimiento, y la remisión del proveedor (obligatoria).",
      "Imprime las etiquetas de los bultos y pégalas. El costo promedio se recalcula solo.",
    ],
  },
  {
    title: "Producir",
    href: "/produccion/nueva",
    keywords: ["produc", "orden de producci", "op", "fabric"],
    steps: [
      "Nueva orden: elige producto y cantidad; revisa la disponibilidad.",
      "Iniciar: el sistema reserva los bultos que vencen primero (FEFO).",
      "Completar: registra lo realmente consumido y las unidades buenas. Se crea el lote en cuarentena y se empaca en cajas con serial.",
      "Control de calidad: libera o rechaza el lote con una nota. Solo los lotes liberados se pueden despachar.",
    ],
  },
  {
    title: "Liberar un lote (control de calidad)",
    href: "/calidad",
    keywords: ["calidad", "cuarentena", "liber", "rechaz", "bloque"],
    steps: [
      "Control de calidad muestra los lotes pendientes de liberación y los días que llevan.",
      "Escribe el resultado (ej. pH, olor, textura) y pulsa Liberar o Rechazar.",
      "Ante una sospecha (reclamo de cliente) cualquier lote se puede volver a poner en cuarentena desde su página.",
    ],
  },
  {
    title: "Contar (conteo cíclico)",
    href: "/conteos",
    keywords: ["cont", "escane", "pistol", "inventario c", "abc", "cámara"],
    steps: [
      "Conteo cíclico → elige la bodega; el sistema marca lo que toca contar según su clase ABC.",
      "Escanea cada bulto con la pistola o la cámara. Las cajas selladas se confirman con un escaneo; las abiertas se cuentan y se digitan.",
      "Mientras cuentas no ves la cantidad del sistema (así no te influye).",
      "Cierra el conteo, revisa sistema vs contado y aprueba: se crean los ajustes sobre cada serial.",
    ],
  },
  {
    title: "Despachar",
    href: "/despachos",
    keywords: ["despach", "envi", "client", "remisi", "gu", "transportadora", "entreg"],
    steps: [
      "Despachos → Nuevo: cliente, NIT, dirección y productos. Se asigna la remisión REM.",
      "Alistar: el sistema asigna cajas por FEFO (solo lotes liberados y con más de 90 días de vida útil).",
      "Escanea cada caja para verificar; luego Despachar con transportadora y guía.",
      "Imprime la remisión, y cuando llegue adjunta la remisión firmada como prueba de entrega.",
    ],
  },
  {
    title: "Ajustar inventario",
    href: "/ajustes",
    keywords: ["ajust", "baja", "dañ", "venc", "merma", "inicial"],
    steps: [
      "Ajustes → Salida o baja: escanea el serial, indica cantidad y motivo (dañado, vencido, merma…).",
      "Ajustes → Entrada / inventario inicial: producto, bodega, cantidad, bultos, costo, lote y vencimiento.",
      "Todo ajuste queda en el Kardex con su motivo; el stock nunca se edita directamente.",
    ],
  },
  {
    title: "Imprimir etiquetas",
    href: "/etiquetas",
    keywords: ["etiquet", "código de barras", "serial", "imprim"],
    steps: [
      "Etiquetas → elige el producto y marca los bultos; se genera un PDF de 50 × 25 mm para impresora térmica.",
      "También puedes imprimirlas desde cada recepción, orden de producción o ajuste.",
      "La etiqueta muestra la cantidad inicial del bulto, no la actual.",
    ],
  },
  {
    title: "Crear una fórmula",
    href: "/formulas",
    keywords: ["fórmula", "formula", "receta", "insumo"],
    steps: [
      "Fórmulas → elige el producto terminado → agrega cada insumo y su cantidad para el rendimiento (ej. 100 unidades).",
      "Puedes digitar en g o ml: el sistema convierte a kg o L.",
      "El costo por lote y por unidad se calcula en vivo con el costo promedio de cada insumo.",
      "O pégale la fórmula en texto al Copiloto y confirma la propuesta.",
    ],
  },
];
