const SYSTEM_PROMPT = `Extrae parámetros de búsqueda inmobiliaria del mensaje. Ecuador. Solo JSON, sin texto.

Campos posibles:
tipo_propiedad: casa|departamento|terreno|comercial|oficina
tipo_operacion: venta|alquiler
ciudad: string (ciudades Ecuador)
sector: string
habitaciones_min: int
banos_min: int
precio_min: int (USD, interpreta "100k"=100000)
precio_max: int
m2_min: int
con_estacionamiento: bool
tipo_pago: biess|contado|financiamiento
amoblado: bool
con_piscina: bool
con_jardin: bool
conjunto_cerrado: bool
nueva_construccion: bool
con_bodega: bool
ascensor: bool
mascotas: bool
confianza: float 0-1

Inferencias clave:
- grande/amplio → habitaciones_min:3, mediano→2, pequeño/studio→1
- arriendo/rentar/alquilar → alquiler
- comprar/adquirir → venta
- garaje/parqueadero → con_estacionamiento:true
- biess/iess → tipo_pago:biess
- estreno/nueva → nueva_construccion:true
- conjunto/urbanización/seguridad → conjunto_cerrado:true

Omite campos no mencionados. Devuelve solo JSON.`

const SYSTEM_PROMPT_FECHA = `Extrae fecha y hora de un mensaje en español. Solo JSON, sin texto.

Formato de respuesta:
{
  "fecha": "YYYY-MM-DD o null",
  "hora": "HH:MM o null",
  "confianza": 0.0-1.0
}

Reglas:
- Resuelve fechas relativas según la fecha de hoy que se indica
- "mañana" → día siguiente
- "pasado mañana" → dos días después
- "el lunes/martes/etc" → próximo día de esa semana
- "en la mañana" → "09:00"
- "en la tarde" → "15:00"
- "en la noche" → "18:00"
- "a las 3" sin contexto → "15:00"
- "a las 3 de la mañana" → "03:00"
- Si no menciona hora → null
- Si no menciona fecha → null

Omite campos nulos. Devuelve solo JSON.`

export interface ParametrosExtraidos {
    tipo_propiedad?: "casa" | "departamento" | "terreno" | "comercial" | "oficina"
    tipo_operacion?: "venta" | "alquiler"
    ciudad?: string
    sector?: string
    habitaciones_min?: number
    banos_min?: number
    precio_min?: number
    precio_max?: number
    m2_min?: number
    con_estacionamiento?: boolean
    tipo_pago?: "biess" | "contado" | "financiamiento"
    amoblado?: boolean
    con_piscina?: boolean
    con_jardin?: boolean
    conjunto_cerrado?: boolean
    nueva_construccion?: boolean
    con_bodega?: boolean
    ascensor?: boolean
    mascotas?: boolean
    confianza: number
}

export interface FechaHoraExtraida {
    fecha?: string
    hora?: string
    confianza: number
}

async function llamarHaiku(
    systemPrompt: string,
    userMessage: string
): Promise<string | null> {
    try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": process.env.ANTHROPIC_API_KEY!,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 300,
                system: systemPrompt,
                messages: [{ role: "user", content: userMessage }]
            })
        })

        if (!res.ok) {
            const err = await res.json()
            console.error("[NLP] Haiku error:", res.status, JSON.stringify(err))
            return null
        }

        const data = await res.json()
        return data.content?.[0]?.text?.trim() || null

    } catch (err) {
        console.error("[NLP] Error llamando Haiku:", err)
        return null
    }
}

function parsearJSON(content: string): any | null {
    try {
        // Limpiar posibles backticks o texto extra
        const limpio = content
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim()
        return JSON.parse(limpio)
    } catch {
        // Intentar extraer JSON del texto
        const match = content.match(/\{[\s\S]*\}/)
        if (match) {
            try { return JSON.parse(match[0]) } catch { return null }
        }
        return null
    }
}

export async function extraerParametros(
    texto: string
): Promise<ParametrosExtraidos> {
    const content = await llamarHaiku(SYSTEM_PROMPT, texto)

    if (!content) return fallbackNLP(texto)

    const parsed = parsearJSON(content)
    if (!parsed) return fallbackNLP(texto)

    const limpio: ParametrosExtraidos = { confianza: parsed.confianza ?? 0.5 }
    Object.entries(parsed).forEach(([k, v]) => {
        if (v !== null && v !== "null" && v !== undefined && k !== "confianza") {
            (limpio as any)[k] = v
        }
    })

    console.log("[NLP] Parámetros:", JSON.stringify(limpio))
    return limpio
}

export async function extraerFechaHora(
    texto: string,
    fechaReferencia: string
): Promise<FechaHoraExtraida> {
    const content = await llamarHaiku(
        SYSTEM_PROMPT_FECHA,
        `Hoy es ${fechaReferencia}. Mensaje: ${texto}`
    )

    if (!content) return { confianza: 0 }

    const parsed = parsearJSON(content)
    if (!parsed) return { confianza: 0 }

    const limpio: FechaHoraExtraida = { confianza: parsed.confianza ?? 0.5 }
    if (parsed.fecha && parsed.fecha !== "null") limpio.fecha = parsed.fecha
    if (parsed.hora && parsed.hora !== "null") limpio.hora = parsed.hora

    console.log("[NLP FechaHora]", JSON.stringify(limpio))
    return limpio
}

export function parametrosFaltantes(params: ParametrosExtraidos): string[] {
    const faltantes: string[] = []
    if (!params.ciudad) faltantes.push("ciudad")
    if (!params.tipo_propiedad) faltantes.push("tipo_propiedad")
    if (!params.tipo_operacion) faltantes.push("tipo_operacion")
    return faltantes
}

export function preguntarParametro(
    param: string,
    contexto?: ParametrosExtraidos
): string {
    if (param === "ciudad") return "En qué ciudad estás buscando?"

    if (param === "tipo_propiedad") {
        return "Qué tipo de propiedad buscas? Casa, departamento, terreno, local u oficina?"
    }

    if (param === "tipo_operacion") {
        const tipo = contexto?.tipo_propiedad
        const articulo = tipo === "departamento" ? "el departamento"
            : tipo === "terreno" ? "el terreno"
            : tipo === "comercial" ? "el local"
            : tipo === "oficina" ? "la oficina"
            : "la propiedad"
        return `Buscas comprar o arrendar ${articulo}?`
    }

    return "Puedes darme más detalles?"
}

export function resumirParametros(params: ParametrosExtraidos): string {
    const partes: string[] = []
    if (params.tipo_propiedad) partes.push(params.tipo_propiedad.charAt(0).toUpperCase() + params.tipo_propiedad.slice(1))
    if (params.tipo_operacion) partes.push(`en ${params.tipo_operacion === "alquiler" ? "arriendo" : "venta"}`)
    if (params.ciudad) partes.push(params.ciudad)
    if (params.sector) partes.push(`sector ${params.sector}`)
    if (params.habitaciones_min) partes.push(`${params.habitaciones_min}+ hab`)
    if (params.banos_min) partes.push(`${params.banos_min}+ baños`)
    if (params.precio_max) partes.push(`hasta $${Number(params.precio_max).toLocaleString("es-EC")}`)
    if (params.precio_min) partes.push(`desde $${Number(params.precio_min).toLocaleString("es-EC")}`)
    if (params.m2_min) partes.push(`${params.m2_min}+ m²`)
    if (params.con_estacionamiento) partes.push("con garaje")
    if (params.tipo_pago === "biess") partes.push("BIESS")
    if (params.tipo_pago === "financiamiento") partes.push("financiado")
    if (params.amoblado) partes.push("amoblado")
    if (params.con_piscina) partes.push("con piscina")
    if (params.con_jardin) partes.push("con jardín")
    if (params.conjunto_cerrado) partes.push("conjunto cerrado")
    if (params.nueva_construccion) partes.push("a estrenar")
    if (params.ascensor) partes.push("con ascensor")
    if (params.mascotas) partes.push("acepta mascotas")
    if (params.con_bodega) partes.push("con bodega")
    return partes.join(" · ")
}

export function parametrosAFiltrosBD(params: ParametrosExtraidos): Record<string, any> {
    const f: Record<string, any> = {}
    if (params.tipo_propiedad) f.p_tipo = params.tipo_propiedad
    if (params.tipo_operacion) f.p_operacion = params.tipo_operacion
    if (params.ciudad) f.p_ciudad = params.ciudad
    if (params.sector) f.p_sector = params.sector
    if (params.habitaciones_min) f.p_habitaciones_min = params.habitaciones_min
    if (params.precio_max) f.p_precio_max = params.precio_max
    if (params.precio_min) f.p_precio_min = params.precio_min
    if (params.m2_min) f.p_m2_min = params.m2_min
    if (params.banos_min) f.p_banos_min = params.banos_min
    if (params.tipo_pago) f.p_tipo_pago = params.tipo_pago
    if (params.nueva_construccion !== undefined) f.p_nueva_construccion = params.nueva_construccion

    const extras: Record<string, boolean> = {}
    if (params.con_estacionamiento === true) extras.estacionamiento = true
    if (params.con_piscina === true) extras.piscina = true
    if (params.con_jardin === true) extras.jardin = true
    if (params.conjunto_cerrado === true) extras.conjunto_cerrado = true
    if (params.amoblado === true) extras.amoblado = true
    if (params.ascensor === true) extras.ascensor = true
    if (params.con_bodega === true) extras.bodega = true
    if (Object.keys(extras).length > 0) f.p_extras = extras

    return f
}

// Fallback regex cuando Haiku falla
function fallbackNLP(texto: string): ParametrosExtraidos {
    console.log("[NLP] Usando fallback regex")
    const t = texto.toLowerCase()
    const resultado: ParametrosExtraidos = { confianza: 0.3 }

    if (/\bcasa\b|\bvilla\b/.test(t)) resultado.tipo_propiedad = "casa"
    else if (/\bdepa\b|\bdepartamento\b|\bapto\b/.test(t)) resultado.tipo_propiedad = "departamento"
    else if (/\bterreno\b|\blote\b|\bsolar\b/.test(t)) resultado.tipo_propiedad = "terreno"
    else if (/\blocal\b|\bcomercial\b/.test(t)) resultado.tipo_propiedad = "comercial"
    else if (/\boficina\b/.test(t)) resultado.tipo_propiedad = "oficina"

    if (/\bcomprar\b|\bcompra\b|\bventa\b/.test(t)) resultado.tipo_operacion = "venta"
    else if (/\barriend\b|\balquil\b|\brenta\b/.test(t)) resultado.tipo_operacion = "alquiler"

    const ciudades = [
        "guayaquil", "quito", "cuenca", "samborondón", "samborondon",
        "daule", "manta", "ambato", "loja", "ibarra", "esmeraldas",
        "portoviejo", "riobamba", "machala", "durán", "duran"
    ]
    for (const ciudad of ciudades) {
        if (t.includes(ciudad)) {
            resultado.ciudad = ciudad.charAt(0).toUpperCase() + ciudad.slice(1)
            break
        }
    }

    const habMatch = t.match(/(\d+)\s*(?:habitaci|cuarto|dormitorio|hab\b)/)
    if (habMatch) resultado.habitaciones_min = parseInt(habMatch[1])
    else if (/\bgrande\b|\bampli/.test(t)) resultado.habitaciones_min = 3
    else if (/\bmedian/.test(t)) resultado.habitaciones_min = 2
    else if (/\bpeque|studio|estudio/.test(t)) resultado.habitaciones_min = 1

    const precioMax = t.match(/hasta\s*\$?\s*(\d[\d.,]*)\s*(?:mil|k)?/i)
    if (precioMax) {
        const val = parseFloat(precioMax[1].replace(",", ""))
        resultado.precio_max = /mil|k/i.test(t) ? val * 1000 : val
    }

    if (/garaje|parqueadero|estacionamiento/.test(t)) resultado.con_estacionamiento = true
    if (/biess|iess/.test(t)) resultado.tipo_pago = "biess"
    if (/piscina/.test(t)) resultado.con_piscina = true
    if (/conjunto|urbanizaci/.test(t)) resultado.conjunto_cerrado = true
    if (/estreno|nueva|nuevo/.test(t)) resultado.nueva_construccion = true
    if (/amoblado|amueblado/.test(t)) resultado.amoblado = true

    return resultado
}