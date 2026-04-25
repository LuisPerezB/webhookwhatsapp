import { supabase } from "./supabase"
import { validarCedulaAPI } from "./cedula"
import {
    sendWhatsAppMessage,
    sendWhatsAppImage,
} from "./whatsapp"

// ─────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────
type Respuesta = string | { tipo: "buttons" | "list"; payload: any }

interface Filtros {
    tipo_propiedad?: string
    tipo_operacion?: string
    ubicacion?: string
    ciudad?: string | null
    sector?: string | null
    ciudad_id?: number | null
    sector_id?: number | null
    precio_min?: number
    precio_max?: number
    habitaciones_min?: number
    banos_min?: number
    con_garaje?: boolean
    acepta_mascotas?: boolean
    tipo_pago?: string
    m2_min?: number
    conjunto_cerrado?: boolean
    nueva_construccion?: boolean
    amoblado?: boolean
    con_piscina?: boolean
    con_jardin?: boolean
    ascensor?: boolean
}

interface Interpretacion {
    intencion:
    | "buscar"        // búsqueda nueva
    | "refinar"       // agrega filtros a búsqueda actual
    | "cambiar_lugar" // quiere otra ubicación
    | "ver_detalle"   // quiere ver detalles de una propiedad de la lista
    | "ver_proyectos" // quiere ver proyectos
    | "info"          // pregunta sobre propiedad en contexto
    | "agendar"       // quiere reservar visita
    | "agente"        // quiere persona humana
    | "citas"         // ver sus citas agendadas
    | "url"           // detectó un slug/link
    | "saludo"        // saludo sin intención clara
    | "otro"          // no relacionado

    filtros_agregar: Filtros
    filtros_quitar: string[]
    slug?: string
    pregunta_sobre?: string
    numero_seleccion?: number   // si dijo "el primero", "el 2", etc.
    pedir_aclaracion?: string | null
    confianza: number
}

// ─────────────────────────────────────────
// ENTRADA PRINCIPAL
// ─────────────────────────────────────────
export async function handleMessage({
    tenant, cliente, session, textoMensaje, buttonId,
    phoneNumberId, from, config,
}: any): Promise<Respuesta | null> {

    const text = (textoMensaje || "").trim()
    const textLow = text.toLowerCase()
    const btnId = buttonId || ""
    const state = session.contenido || {}

    console.log("[Bot] step:", state.step, "btn:", btnId, "text:", text.slice(0, 60))

    // ══════════════════════════════════════
    // CAPA 1 — BOTONES (nunca usan LLM)
    // ══════════════════════════════════════
    if (btnId) {
        return await procesarBoton(
            btnId, state, session, tenant, cliente, config, phoneNumberId, from
        )
    }

    // ══════════════════════════════════════
    // CAPA 2 — STEPS DE ACCIÓN CONCRETA
    // Cédula, fecha, selección de horario — 
    // necesitan texto pero no LLM
    // ══════════════════════════════════════
    if (["solicitar_cedula", "solicitar_fecha_visita", "agendar_propiedad", "agendar_proyecto"].includes(state.step)) {
        const stepResult = await manejarStepAccion(
            state, session, tenant, cliente, config, phoneNumberId, from, text
        )
        if (stepResult !== null) return stepResult
    }

    // ══════════════════════════════════════
    // CAPA 3 — COMANDOS EXACTOS (sin LLM)
    // ══════════════════════════════════════
    const comando = detectarComandoExacto(textLow)
    if (comando) {
        return await ejecutarComando(
            comando, state, session, tenant, cliente, config, phoneNumberId, from
        )
    }

    // Slug en texto
    const slugMatch = text.match(/[a-z]+-\d+-\d+/)
    if (slugMatch) {
        return await resolverSlug(
            slugMatch[0], session, tenant, phoneNumberId, from
        )
    }

    // ══════════════════════════════════════
    // CAPA 4 — LLM interpreta TODO lo demás
    // ══════════════════════════════════════
    if (!text || text.length < 1) return null

    const interpretacion = await interpretarConLLM(text, state)

    return await ejecutarInterpretacion(
        interpretacion, text, state, session,
        tenant, cliente, config, phoneNumberId, from
    )
}

// ─────────────────────────────────────────
// LLM — INTERPRETAR MENSAJE
// ─────────────────────────────────────────
async function interpretarConLLM(
    text: string,
    state: any
): Promise<Interpretacion> {

    const params = state.params_busqueda || {}
    const tieneContexto = Object.keys(params).length > 0
    const propActual = state.propiedad_id ? `propiedad_id: ${state.propiedad_id}` : ""
    const proyActual = state.proyecto_id ? `proyecto_id: ${state.proyecto_id}` : ""
    const resultados = state.propiedades_ids?.length
        ? `Hay ${state.propiedades_ids.length} resultados listados actualmente.`
        : ""

    const contexto = tieneContexto
        ? `Búsqueda activa: ${JSON.stringify(params)}. ${resultados} ${propActual} ${proyActual}`
        : "Sin búsqueda activa."

    const prompt = `Eres asistente inmobiliario en Ecuador. Analiza el mensaje y devuelve JSON.

CONTEXTO: ${contexto}

MENSAJE: "${text}"

INTENCIONES:
- "buscar": quiere buscar propiedades (casa, depa, terreno, local, oficina)
- "refinar": ajusta búsqueda actual (más hab, con garaje, hasta X precio, solo nuevas, etc.)
- "cambiar_lugar": quiere diferente sector/ciudad ("en otro lado", "mejor en urdesa")
- "ver_detalle": quiere ver detalle de un resultado ("el primero", "esa", "la número 2", "muéstrame esa")
- "ver_proyectos": quiere ver proyectos inmobiliarios
- "info": pregunta sobre propiedad en contexto (precio, mascotas, garaje, escritura, BIESS, alícuota, disponibilidad)
- "agendar": quiere visitar/reservar
- "agente": quiere persona humana, asesor
- "citas": ver sus citas
- "url": menciona un código como "propiedad-1-5" o "proyecto-1-2"
- "saludo": saludo sin intención clara
- "otro": no relacionado con inmobiliaria

FILTROS para buscar/refinar:
tipo_propiedad: casa|departamento|terreno|comercial|oficina
tipo_operacion: venta|alquiler
ubicacion: texto libre del lugar mencionado
precio_max: número en USD
precio_min: número en USD
habitaciones_min: número
banos_min: número
con_garaje: true/false
acepta_mascotas: true/false
tipo_pago: biess|contado|financiamiento
m2_min: número
conjunto_cerrado: true/false
nueva_construccion: true/false
amoblado: true/false
con_piscina: true/false
con_jardin: true/false
ascensor: true/false

REGLAS:
- Si dice "el primero/segundo/tercero" o un número referenciando resultados → intencion="ver_detalle", numero_seleccion=1/2/3
- Para "refinar" solo incluye los filtros que CAMBIAN, no repitas los actuales
- Para "cambiar_lugar" pon la nueva ubicación en filtros_agregar.ubicacion
- Para "info" pon qué pregunta en pregunta_sobre (precio/mascotas/garaje/biess/escritura/alicuota/disponibilidad)
- confianza entre 0.0 y 1.0

Responde SOLO JSON válido, sin texto extra:
{
  "intencion": "buscar",
  "filtros_agregar": {"tipo_propiedad": "casa", "ubicacion": "la aurora"},
  "filtros_quitar": [],
  "slug": null,
  "pregunta_sobre": null,
  "numero_seleccion": null,
  "pedir_aclaracion": null,
  "confianza": 0.9
}`

    try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY!,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 400,
                messages: [{ role: "user", content: prompt }]
            })
        })

        const data = await res.json()
        const raw = data.content[0].text.replace(/```json|```/g, "").trim()
        const parsed = JSON.parse(raw)
        console.log("[LLM] intencion:", parsed.intencion, "confianza:", parsed.confianza)
        return parsed

    } catch (e) {
        console.error("[LLM] Error:", e)
        return {
            intencion: "otro",
            filtros_agregar: {},
            filtros_quitar: [],
            confianza: 0
        }
    }
}

// ─────────────────────────────────────────
// EJECUTAR INTERPRETACIÓN
// ─────────────────────────────────────────
async function ejecutarInterpretacion(
    interp: Interpretacion,
    textoOriginal: string,
    state: any,
    session: any,
    tenant: any,
    cliente: any,
    config: any,
    phoneNumberId: string,
    from: string
): Promise<Respuesta> {

    const paramsActuales: Filtros = state.params_busqueda || {}

    switch (interp.intencion) {

        // ── Búsqueda nueva ──
        case "buscar": {
            const params = await resolverFiltros(interp.filtros_agregar, tenant.id, config)
            if ((params as any).ambiguo) {
                await updateSession(session.id, {
                    ...state,
                    params_busqueda: params,
                    ambiguo_ciudades: (params as any).ambiguo.ciudades
                })
                return construirPreguntaAmbigua(
                    (params as any).ambiguo.sector,
                    (params as any).ambiguo.ciudades
                )
            }
            return await buscarYMostrar(params, session, tenant, cliente, config, phoneNumberId, from)
        }

        // ── Refinar búsqueda activa ──
        case "refinar": {
            let params = { ...paramsActuales }

            // Quitar lo indicado
            interp.filtros_quitar?.forEach(k => delete (params as any)[k])

            // Resolver nueva ubicación si cambió
            if (interp.filtros_agregar.ubicacion) {
                const ctx = await resolverUbicacion(interp.filtros_agregar.ubicacion, tenant.id)
                if (ctx.ambiguo) return construirPreguntaAmbigua(ctx.ambiguo.sector, ctx.ambiguo.ciudades)
                if (ctx.ciudad_id) {
                    params.ciudad = ctx.ciudad_nombre || undefined
                    params.ciudad_id = ctx.ciudad_id
                    params.sector = ctx.sector_nombre || undefined
                    params.sector_id = ctx.sector_id || undefined
                }
            }

            // Agregar nuevos filtros
            Object.entries(interp.filtros_agregar).forEach(([k, v]) => {
                if (v !== undefined && v !== null && k !== "ubicacion") {
                    (params as any)[k] = v
                }
            })

            return await buscarYMostrar(params, session, tenant, cliente, config, phoneNumberId, from)
        }

        // ── Cambiar lugar ──
        case "cambiar_lugar": {
            if (interp.filtros_agregar.ubicacion) {
                const ctx = await resolverUbicacion(interp.filtros_agregar.ubicacion, tenant.id)
                if (ctx.ambiguo) return construirPreguntaAmbigua(ctx.ambiguo.sector, ctx.ambiguo.ciudades)
                if (ctx.ciudad_id || ctx.sector_id) {
                    const params = {
                        ...paramsActuales,
                        ciudad: ctx.ciudad_nombre,
                        ciudad_id: ctx.ciudad_id,
                        sector: ctx.sector_nombre,
                        sector_id: ctx.sector_id,
                    }
                    return await buscarYMostrar(params, session, tenant, cliente, config, phoneNumberId, from)
                }
            }
            // No dijo dónde
            await updateSession(session.id, { ...state, esperando: "nueva_ubicacion" })
            const tipo = paramsActuales.tipo_propiedad || "propiedad"
            const hab = paramsActuales.habitaciones_min ? ` con ${paramsActuales.habitaciones_min}+ hab` : ""
            return `¿En qué sector o ciudad prefieres buscar la ${tipo}${hab}?`
        }

        // ── Ver detalle de resultado por número/referencia ──
        case "ver_detalle": {
            const num = interp.numero_seleccion
            if (num && state.propiedades_ids?.[num - 1]) {
                const propId = state.propiedades_ids[num - 1]
                return await mostrarDetallePropiedad(propId, session, state, tenant, phoneNumberId, from)
            }
            // Si solo hay un resultado en contexto
            if (state.propiedad_id) {
                return await mostrarDetallePropiedad(state.propiedad_id, session, state, tenant, phoneNumberId, from)
            }
            return "¿Cuál resultado quieres ver? Selecciónalo de la lista."
        }

        // ── Ver proyectos ──
        case "ver_proyectos": {
            await updateSession(session.id, { ...state, step: "inicio" })
            return await listarProyectos(tenant.id)
        }

        // ── Info sobre propiedad en contexto ──
        case "info": {
            if (state.propiedad_id) {
                return await responderInfo(interp.pregunta_sobre || "general", state.propiedad_id)
            }
            if (state.proyecto_id) {
                return await responderInfoProyecto(interp.pregunta_sobre || "general", state.proyecto_id)
            }
            // Sin propiedad en contexto — puede ser pregunta general
            return await responderInfoGeneral(textoOriginal, tenant, config)
        }

        // ── Agendar ──
        case "agendar": {
            const propId = state.propiedad_id
            const proyId = state.proyecto_id

            if (!propId && !proyId) {
                return "¿Para qué propiedad quieres agendar la visita? Selecciónala de la lista primero."
            }

            if (!cliente.verificado) {
                const nuevoState = { ...state, step: "solicitar_cedula" }
                await updateSession(session.id, nuevoState)
                return solicitarCedula()
            }

            if (propId) return await mostrarHorarios("propiedad", propId, config?.dias_max_cita ?? 7, session.id, state)
            return await mostrarHorarios("proyecto", proyId, config?.dias_max_cita ?? 7, session.id, state)
        }

        case "agente":
            return await ejecutarComando("agente", state, session, tenant, cliente, config, phoneNumberId, from)

        case "citas":
            return await listarCitas(cliente.id, tenant.id)

        case "url":
            if (interp.slug) return await resolverSlug(interp.slug, session, tenant, phoneNumberId, from)
            break

        case "saludo":
            return await menuPrincipal(tenant, cliente, config)
    }

    // ── Fallback con contexto ──
    if (interp.pedir_aclaracion) return interp.pedir_aclaracion

    // Si tiene búsqueda activa, re-buscar
    if (Object.keys(paramsActuales).length > 0) {
        return await buscarYMostrar(paramsActuales, session, tenant, cliente, config, phoneNumberId, from)
    }

    // Fallback final
    await supabase.from("notificaciones").insert({
        tenant_id: tenant.id,
        cliente_id: cliente.id,
        sesion_id: session.id,
        tipo: "bot_no_entendio",
        mensaje: `No entendió: "${textoOriginal}"`
    })

    return {
        tipo: "buttons",
        payload: {
            body: "No entendí bien. ¿Qué necesitas?",
            buttons: [
                { id: "btn_propiedades", title: "Buscar propiedad" },
                { id: "btn_proyectos", title: "Ver proyectos" },
                { id: "hablar_agente", title: "Hablar con asesor" },
            ]
        }
    }
}

// ─────────────────────────────────────────
// BUSCAR Y MOSTRAR
// ─────────────────────────────────────────
async function buscarYMostrar(
    params: Filtros,
    session: any,
    tenant: any,
    cliente: any,
    config: any,
    phoneNumberId: string,
    from: string
): Promise<Respuesta> {

    const tenantId = tenant.id
    let ciudadId = params.ciudad_id || null
    let sectorId = params.sector_id || null

    // Resolver IDs por nombre si no están
    if (!ciudadId && params.ciudad) {
        const { data: c } = await supabase
            .from("ciudades").select("id").ilike("nombre", `%${params.ciudad}%`).maybeSingle()
        ciudadId = c?.id || null
    }
    if (!sectorId && params.sector && ciudadId) {
        const { data: s } = await supabase
            .from("sectores").select("id")
            .eq("ciudad_id", ciudadId).ilike("nombre", `%${params.sector}%`).maybeSingle()
        sectorId = s?.id || null
    }

    // Ciudad default del tenant
    if (!ciudadId && config?.ciudad_default_id) {
        ciudadId = config.ciudad_default_id
        if (!params.ciudad) {
            const { data: c } = await supabase.from("ciudades").select("nombre").eq("id", ciudadId).single()
            params = { ...params, ciudad: c?.nombre }
        }
    }

    console.log("[Búsqueda] ciudadId:", ciudadId, "sectorId:", sectorId, "tipo:", params.tipo_propiedad, "op:", params.tipo_operacion)

    // Buscar propiedades
    const { data: propiedades } = await supabase.rpc("buscar_propiedades", {
        p_tenant_id: tenantId,
        p_tipo_propiedad: params.tipo_propiedad || null,
        p_tipo_operacion: params.tipo_operacion || null,
        p_provincia_id: null,
        p_ciudad_id: ciudadId,
        p_sector_id: sectorId,
        p_precio_min: params.precio_min || null,
        p_precio_max: params.precio_max || null,
        p_tipo_pago: params.tipo_pago || null,
        p_habitaciones: params.habitaciones_min || null,
        p_banos: params.banos_min || null,
        p_m2_min: params.m2_min || null,
        p_m2_max: null,
        p_patio: null,
        p_jardin: params.con_jardin || null,
        p_piscina: params.con_piscina || null,
        p_estacionamientos: params.con_garaje ? 1 : null,
        p_ascensor: params.ascensor || null,
        p_amoblado: params.amoblado || null,
        p_limite: 20,
    })

    // Buscar proyectos
    let qProy = supabase
        .from("proyectos")
        .select("id, nombre, precio_desde, ciudad:ciudad_id(nombre), sector:sector_id(nombre)")
        .eq("tenant_id", tenantId).eq("estado", "activo").is("deleted_at", null)

    if (ciudadId) qProy = qProy.eq("ciudad_id", ciudadId)
    if (sectorId) qProy = qProy.eq("sector_id", sectorId)
    if (params.precio_max) qProy = qProy.lte("precio_desde", params.precio_max)
    if (params.tipo_pago === "biess") qProy = qProy.contains("tipo_pago", ["biess"])

    const { data: proyectos } = await qProy.limit(3)

    // Fallback sin sector si no hay nada
    let propsFallback: any[] = []
    let esFallback = false

    if (!propiedades?.length && !proyectos?.length && sectorId) {
        esFallback = true
        const { data: fb } = await supabase.rpc("buscar_propiedades", {
            p_tenant_id: tenantId,
            p_tipo_propiedad: params.tipo_propiedad || null,
            p_tipo_operacion: params.tipo_operacion || null,
            p_provincia_id: null,
            p_ciudad_id: ciudadId,
            p_sector_id: null,
            p_precio_min: null, p_precio_max: null,
            p_tipo_pago: null, p_habitaciones: null,
            p_banos: null, p_m2_min: null, p_m2_max: null,
            p_patio: null, p_jardin: null, p_piscina: null,
            p_estacionamientos: null, p_ascensor: null, p_amoblado: null,
            p_limite: 20,
        })
        propsFallback = fb || []
    }

    const propsAMostrar = propiedades?.length ? propiedades : propsFallback
    const total = propsAMostrar.length + (proyectos?.length || 0)

    // Sin resultados
    if (total === 0) {
        const donde = [params.sector, params.ciudad].filter(Boolean).join(", ")
        const tipo = params.tipo_propiedad ? `${params.tipo_propiedad}s` : "propiedades"
        const op = params.tipo_operacion === "alquiler" ? "en arriendo"
            : params.tipo_operacion === "venta" ? "en venta" : ""

        await updateSession(session.id, {
            step: "inicio",
            params_busqueda: params,
            propiedades_ids: [],
            propiedad_id: null, proyecto_id: null
        })

        return {
            tipo: "buttons",
            payload: {
                body: `No encontré ${tipo} ${op}${donde ? ` en ${donde}` : ""}. 😕`,
                buttons: [
                    { id: "buscar_nuevo", title: "Cambiar búsqueda" },
                    { id: "hablar_agente", title: "Hablar con asesor" },
                    { id: "btn_menu", title: "Menú principal" },
                ]
            }
        }
    }

    // Guardar estado
    const paramsConIds = { ...params, ciudad_id: ciudadId, sector_id: sectorId }
    await updateSession(session.id, {
        step: "mostrar_resultados",
        params_busqueda: paramsConIds,
        propiedades_ids: propsAMostrar.map((p: any) => p.id),
        pagina: 0,
        propiedad_id: null,
        proyecto_id: null,
        horarios_ids: null,
        esperando: null,
    })

    // 1 resultado único → detalle directo
    if (total === 1 && propsAMostrar.length === 1) {
        await sendWhatsAppMessage(phoneNumberId, from, "Encontré exactamente lo que buscas 🎯")
        return await mostrarDetallePropiedad(propsAMostrar[0].id, session, session.contenido, tenant, phoneNumberId, from)
    }

    // Construir resumen de la búsqueda
    const partesFiltro = [
        params.tipo_propiedad,
        params.tipo_operacion === "alquiler" ? "en arriendo" : params.tipo_operacion === "venta" ? "en venta" : null,
        params.sector ? `en ${params.sector}` : params.ciudad ? `en ${params.ciudad}` : null,
        params.habitaciones_min ? `${params.habitaciones_min}+ hab` : null,
        params.precio_max ? `hasta $${Number(params.precio_max).toLocaleString("es-EC")}` : null,
        params.con_garaje ? "con garaje" : null,
        params.tipo_pago === "biess" ? "BIESS" : null,
        params.con_piscina ? "con piscina" : null,
        params.acepta_mascotas ? "mascotas OK" : null,
        params.nueva_construccion ? "nueva" : null,
    ].filter(Boolean).join(" · ")

    const encabezado = esFallback
        ? `No encontré con todos los filtros en ${params.sector}. Opciones similares en ${params.ciudad}:`
        : `${total} resultado${total > 1 ? "s" : ""} — ${partesFiltro}:`

    // Construir rows
    const POR_PAGINA = 5
    const pagina0 = propsAMostrar.slice(0, POR_PAGINA)

    const rowsProps = pagina0.map((p: any) => {
        // Título: ubicación más específica
        const titulo = (p.sector_nombre || p.ciudad_nombre || p.nombre || "").slice(0, 24)
        // Descripción: nombre + precio + características
        const precio = `$${Number(p.precio).toLocaleString("es-EC")}${params.tipo_operacion === "alquiler" ? "/mes" : ""}`
        const hab = (p.ambientes as any)?.habitaciones
        const m2 = (p.dimensiones as any)?.m2_construccion || (p.dimensiones as any)?.m2_total
        const desc = [
            p.nombre,
            precio,
            hab ? `${hab}h` : null,
            m2 ? `${m2}m²` : null,
        ].filter(Boolean).join(" · ").slice(0, 72)

        return { id: `prop_${p.id}`, title: titulo, description: desc }
    })

    const rowsProyectos = (proyectos || []).slice(0, 2).map((p: any) => ({
        id: `proyecto_${p.id}`,
        title: `🏗 ${(p.nombre || "").slice(0, 20)}`,
        description: `${(p.ciudad as any)?.nombre || ""} · Desde $${Number(p.precio_desde).toLocaleString("es-EC")}`
    }))

    const sections: any[] = []
    if (rowsProps.length) sections.push({ title: "Propiedades", rows: rowsProps })
    if (rowsProyectos.length) sections.push({ title: "Proyectos", rows: rowsProyectos })

    if (propsAMostrar.length > POR_PAGINA) {
        sections[sections.length - 1].rows.push({
            id: "pagina_siguiente",
            title: "Ver más →",
            description: `${propsAMostrar.length - POR_PAGINA} resultado(s) más`
        })
    }

    return {
        tipo: "list",
        payload: {
            header: `${total} resultado${total > 1 ? "s" : ""}`,
            body: encabezado,
            buttonText: "Ver opciones",
            sections
        }
    }
}

// ─────────────────────────────────────────
// HANDLE LINK (entrada externa)
// ─────────────────────────────────────────
export async function handleLink({
    tenant, cliente, session, linkData, phoneNumberId, config
}: any): Promise<Respuesta | null> {

    const { tipo, propiedad_id, proyecto_id } = linkData
    await updateSession(session.id, { step: "detalle_link", tipo, propiedad_id, proyecto_id })

    if (tipo === "propiedad" && propiedad_id) {
        await supabase.from("propiedades")
            .update({ total_consultas: supabase.rpc("increment", { x: 1 }) })
            .eq("id", propiedad_id)
        return await mostrarDetallePropiedad(propiedad_id, session, session.contenido, tenant, phoneNumberId, cliente.celular)
    }
    if (tipo === "proyecto" && proyecto_id) {
        await supabase.from("proyectos")
            .update({ total_consultas: supabase.rpc("increment", { x: 1 }) })
            .eq("id", proyecto_id)
        return await mostrarDetalleProyecto(proyecto_id, session, session.contenido, tenant, phoneNumberId, cliente.celular)
    }
    return null
}

// ─────────────────────────────────────────
// PROCESAR BOTÓN
// ─────────────────────────────────────────
async function procesarBoton(
    btnId: string,
    state: any,
    session: any,
    tenant: any,
    cliente: any,
    config: any,
    phoneNumberId: string,
    from: string
): Promise<Respuesta> {

    // Globales
    if (btnId === "hablar_agente") return ejecutarComando("agente", state, session, tenant, cliente, config, phoneNumberId, from)
    if (btnId === "btn_menu" || btnId === "menu_principal") return menuPrincipal(tenant, cliente, config)
    if (btnId === "buscar_nuevo") {
        await updateSession(session.id, { step: "inicio", params_busqueda: {} })
        return "¿Qué estás buscando?\n\nCuéntame con tus propias palabras:\n\nEj: casa de 3 hab en Urdesa para comprar\nEj: depa hasta $600 en Quito Norte con garaje"
    }
    if (btnId === "btn_propiedades") {
        await updateSession(session.id, { step: "inicio", params_busqueda: {} })
        return "¿Qué propiedad buscas? Cuéntame:\n\nEj: casa grande en Guayaquil para comprar\nEj: depa en Quito hasta 800 dólares\nEj: terreno en Samborondón con BIESS"
    }
    if (btnId === "btn_proyectos") return listarProyectos(tenant.id)
    if (btnId === "btn_citas") return listarCitas(cliente.id, tenant.id)

    // Ciudad ambigua
    if (btnId.startsWith("ciudad_confirm_")) {
        const ciudadId = parseInt(btnId.replace("ciudad_confirm_", ""))
        const { data: c } = await supabase.from("ciudades").select("nombre").eq("id", ciudadId).single()
        if (c) {
            const params = { ...state.params_busqueda, ciudad: c.nombre, ciudad_id: ciudadId, sector_id: null, sector: null }
            return buscarYMostrar(params, session, tenant, cliente, config, phoneNumberId, from)
        }
    }

    // Selección de propiedad/proyecto
    if (btnId.startsWith("prop_")) {
        const id = parseInt(btnId.replace("prop_", ""))
        return mostrarDetallePropiedad(id, session, state, tenant, phoneNumberId, from)
    }
    if (btnId.startsWith("proyecto_") || btnId.startsWith("proy_")) {
        const id = parseInt(btnId.replace("proyecto_", "").replace("proy_", ""))
        return mostrarDetalleProyecto(id, session, state, tenant, phoneNumberId, from)
    }

    // Reservar
    if (btnId.startsWith("reservar_prop_")) {
        const propId = parseInt(btnId.replace("reservar_prop_", ""))
        if (!cliente.verificado) {
            await updateSession(session.id, { ...state, step: "solicitar_cedula", propiedad_id: propId })
            return solicitarCedula()
        }
        return mostrarHorarios("propiedad", propId, config?.dias_max_cita ?? 7, session.id, state)
    }
    if (btnId.startsWith("reservar_proy_")) {
        const proyId = parseInt(btnId.replace("reservar_proy_", ""))
        if (!cliente.verificado) {
            await updateSession(session.id, { ...state, step: "solicitar_cedula", proyecto_id: proyId })
            return solicitarCedula()
        }
        return mostrarHorarios("proyecto", proyId, config?.dias_max_cita ?? 7, session.id, state)
    }

    // Ver unidades
    if (btnId.startsWith("ver_unidades_")) {
        const proyId = parseInt(btnId.replace("ver_unidades_", ""))
        await updateSession(session.id, { ...state, step: "ver_unidades", proyecto_id: proyId })
        return listarUnidades(proyId)
    }

    // Ver en web
    if (btnId.startsWith("ver_web_")) {
        const slug = btnId.replace("ver_web_prop_", "propiedad-").replace("ver_web_proy_", "proyecto-")
        return `Ver detalles y fotos:\n${process.env.NEXT_PUBLIC_APP_URL}/p/${slug}`
    }

    // Horario
    if (btnId.startsWith("horario_")) {
        const horarioId = parseInt(btnId.replace("horario_", ""))
        return confirmarCita(horarioId, state, session, tenant, cliente)
    }

    // Paginación
    if (btnId === "pagina_siguiente") {
        const pagina = (state.pagina || 0) + 1
        const inicio = pagina * 5
        const ids = state.propiedades_ids || []

        if (!ids.length) return buscarYMostrar(state.params_busqueda || {}, session, tenant, cliente, config, phoneNumberId, from)

        const { data: props } = await supabase
            .from("propiedades")
            .select("id, nombre, precio, ciudad:ciudad_id(nombre), sector:sector_id(nombre), ambientes, dimensiones")
            .in("id", ids)

        const pagActual = (props || []).slice(inicio, inicio + 5)
        const hayMas = ids.length > inicio + 5

        await updateSession(session.id, { ...state, pagina })

        const rows = pagActual.map((p: any) => ({
            id: `prop_${p.id}`,
            title: ((p.sector as any)?.nombre || (p.ciudad as any)?.nombre || p.nombre || "").slice(0, 24),
            description: `${p.nombre} · $${Number(p.precio).toLocaleString("es-EC")}`.slice(0, 72)
        }))

        if (hayMas) rows.push({ id: "pagina_siguiente", title: "Ver más →", description: `${ids.length - inicio - 5} más` })
        rows.push({ id: "btn_menu", title: "Menú principal", description: "" })

        return {
            tipo: "list",
            payload: {
                header: `Pág. ${pagina + 1}`,
                body: "Selecciona una propiedad:",
                buttonText: "Ver opciones",
                sections: [{ title: `${inicio + 1}-${Math.min(inicio + 5, ids.length)} de ${ids.length}`, rows }]
            }
        }
    }

    // Volver
    if (btnId === "btn_volver") {
        if (state.params_busqueda && Object.keys(state.params_busqueda).length > 0) {
            return buscarYMostrar(state.params_busqueda, session, tenant, cliente, config, phoneNumberId, from)
        }
        return menuPrincipal(tenant, cliente, config)
    }

    console.log("[Bot] Botón no reconocido:", btnId, "step:", state.step)

    switch (state.step) {
        case "detalle_propiedad":
            if (state.propiedad_id) {
                return mostrarDetallePropiedad(
                    state.propiedad_id, session, state, tenant, phoneNumberId, from
                )
            }
            break

        case "detalle_proyecto":
            if (state.proyecto_id) {
                return mostrarDetalleProyecto(
                    state.proyecto_id, session, state, tenant, phoneNumberId, from
                )
            }
            break

        case "mostrar_resultados":
            if (state.params_busqueda) {
                return buscarYMostrar(
                    state.params_busqueda, session, tenant, cliente, config, phoneNumberId, from
                )
            }
            break

        case "agendar_propiedad":
            if (state.propiedad_id) {
                return mostrarHorarios(
                    "propiedad", state.propiedad_id,
                    config?.dias_max_cita ?? 7, session.id, state
                )
            }
            break

        case "agendar_proyecto":
            if (state.proyecto_id) {
                return mostrarHorarios(
                    "proyecto", state.proyecto_id,
                    config?.dias_max_cita ?? 7, session.id, state
                )
            }
            break

        case "solicitar_cedula":
            return solicitarCedula()

        case "ver_unidades":
            if (state.proyecto_id) return listarUnidades(state.proyecto_id)
            break
    }


    return menuPrincipal(tenant, cliente, config)
}

// ─────────────────────────────────────────
// STEPS DE ACCIÓN CONCRETA
// ─────────────────────────────────────────
async function manejarStepAccion(
    state: any,
    session: any,
    tenant: any,
    cliente: any,
    config: any,
    phoneNumberId: string,
    from: string,
    text: string
): Promise<Respuesta | null> {

    // ── Cédula ──
    if (state.step === "solicitar_cedula") {
        const cedula = text.replace(/\D/g, "")
        const intentos = (state.intentos_cedula || 0) + 1
        const maxIntentos = config?.intentos_cedula_max ?? 2

        if (cedula.length !== 10) {
            await updateSession(session.id, { ...state, intentos_cedula: intentos })
            if (intentos >= maxIntentos) {
                await activarModoManual(session, tenant, cliente)
                return "Superaste el número de intentos. Un agente te contactará. ⏳"
            }
            return `Ingresa los 10 dígitos de tu cédula (intento ${intentos}/${maxIntentos}):`
        }

        const resultado = await validarCedulaAPI(cedula)

        if (!resultado.valida) {
            await updateSession(session.id, { ...state, intentos_cedula: intentos })
            if (intentos >= maxIntentos) {
                await activarModoManual(session, tenant, cliente)
                return "Cédula inválida. Un agente te contactará. ⏳"
            }
            return `${resultado.error || "Cédula inválida"}. Intento ${intentos}/${maxIntentos}:`
        }

        // Cédula duplicada
        const { data: dup } = await supabase
            .from("clientes").select("id").eq("ruc_ci", cedula).neq("id", cliente.id).maybeSingle()
        if (dup) {
            await supabase.from("clientes").update({ celular_alternativo: from }).eq("id", dup.id)
            return "Esta cédula ya está registrada con otro número. Tu número fue registrado como alternativo. Un agente te atenderá."
        }

        const updateData: any = {
            ruc_ci: cedula, verificado: true, verificado_at: new Date().toISOString()
        }
        if (resultado.nombre_completo) updateData.nombres_completos = resultado.nombre_completo
        await supabase.from("clientes").update(updateData).eq("id", cliente.id)

        const paso = state.propiedad_id ? "agendar_propiedad" : "agendar_proyecto"
        const newState = { ...state, step: paso, intentos_cedula: 0 }
        await updateSession(session.id, newState)

        const nombre = resultado.nombre_completo?.split(" ")[0] || ""
        await sendWhatsAppMessage(
            phoneNumberId, from,
            `Identidad verificada ✅${nombre ? ` Bienvenid@ ${nombre}.` : ""}\n\nAhora selecciona el horario:`
        )

        if (state.propiedad_id) return mostrarHorarios("propiedad", state.propiedad_id, config?.dias_max_cita ?? 7, session.id, newState)
        return mostrarHorarios("proyecto", state.proyecto_id, config?.dias_max_cita ?? 7, session.id, newState)
    }

    // ── Fecha libre ──
    if (state.step === "solicitar_fecha_visita") {
        const intentos = (state.intentos_fecha || 0) + 1
        const { fecha, hora } = await extraerFechaHoraLLM(text)

        if (!fecha && !hora) {
            if (intentos >= 3) {
                await activarModoManual(session, tenant, cliente)
                return "No pude entender la fecha. Un agente te contactará para coordinar. ⏳"
            }
            await updateSession(session.id, { ...state, intentos_fecha: intentos })
            return `No entendí la fecha (${intentos}/3). Intenta:\n\nEj: mañana a las 3pm\nEj: el viernes a las 10am\nEj: 25 de mayo`
        }

        const fechaFinal = fecha || new Date(Date.now() + 86400000).toISOString().split("T")[0]
        const horaFinal = hora || "10:00"
        const fechaISO = `${fechaFinal}T${horaFinal}:00`

        const reservaData: any = {
            tenant_id: tenant.id,
            cliente_id: cliente.id,
            fecha: fechaISO,
            estado: "pendiente",
            notas: `Fecha solicitada: "${text}"`
        }
        if (state.propiedad_id) reservaData.propiedad_id = state.propiedad_id
        if (state.proyecto_id) reservaData.proyecto_id = state.proyecto_id

        await Promise.all([
            supabase.from("reservas").insert(reservaData),
            supabase.from("notificaciones").insert({
                tenant_id: tenant.id,
                cliente_id: cliente.id,
                sesion_id: session.id,
                tipo: "cita_nueva",
                mensaje: `${cliente.celular} solicitó visita para ${new Date(fechaISO).toLocaleDateString("es-EC")}`
            })
        ])

        await updateSession(session.id, { step: "inicio" })

        const fechaFormato = new Date(fechaISO).toLocaleDateString("es-EC", {
            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
        })
        const nombre = cliente.nombres_completos?.split(" ")[0] || "estimad@ cliente"
        return `Solicitud recibida ✅\n\nFecha solicitada: ${fechaFormato}\n\nUn asesor confirmará tu cita, ${nombre}.\n\nEscribe "citas" para ver el estado.`
    }

    // ── Selección de horario por número ──
    if (state.step === "agendar_propiedad" || state.step === "agendar_proyecto") {
        const num = parseInt(text)
        if (!isNaN(num) && state.horarios_ids?.[num - 1]) {
            return confirmarCita(state.horarios_ids[num - 1], state, session, tenant, cliente)
        }
        return null
    }

    return null
}

// ─────────────────────────────────────────
// MOSTRAR DETALLE PROPIEDAD
// ─────────────────────────────────────────
async function mostrarDetallePropiedad(
    propiedadId: number,
    session: any,
    state: any,
    tenant: any,
    phoneNumberId: string,
    from: string
): Promise<Respuesta> {

    const { data: prop } = await supabase
        .from("propiedades")
        .select("*, ciudad:ciudad_id(nombre), sector:sector_id(nombre)")
        .eq("id", propiedadId)
        .eq("tenant_id", tenant.id)
        .single()

    if (!prop) return "Propiedad no encontrada."

    await Promise.all([
        supabase.from("propiedades")
            .update({ total_consultas: (prop.total_consultas || 0) + 1 })
            .eq("id", propiedadId),
        updateSession(session.id, { ...state, step: "detalle_propiedad", propiedad_id: propiedadId })
    ])

    // Fotos
    const fotos = (prop.fotos as any[])
        ?.map(f => typeof f === "string" ? f : f?.url)
        .filter(Boolean).slice(0, 3) || []

    if (fotos.length > 0) {
        const ciudadN = (prop.ciudad as any)?.nombre || ""
        const sectorN = (prop.sector as any)?.nombre || ""
        const precio = `$${Number(prop.precio).toLocaleString("es-EC")}${prop.tipo_operacion === "alquiler" ? "/mes" : ""}`
        const hab = (prop.ambientes as any)?.habitaciones
        const m2 = (prop.dimensiones as any)?.m2_construccion || (prop.dimensiones as any)?.m2_total
        const caption = [prop.nombre, [sectorN, ciudadN].filter(Boolean).join(", "), precio, hab ? `${hab} hab` : null, m2 ? `${m2}m²` : null]
            .filter(Boolean).join("  ·  ").slice(0, 1024)

        for (let i = 0; i < fotos.length; i++) {
            await sendWhatsAppImage(phoneNumberId, from, fotos[i], i === fotos.length - 1 ? caption : undefined).catch(() => { })
            if (i < fotos.length - 1) await new Promise(r => setTimeout(r, 300))
        }
    }

    const ciudadNombre = (prop.ciudad as any)?.nombre || ""
    const sectorNombre = (prop.sector as any)?.nombre || ""

    return {
        tipo: "buttons",
        payload: {
            header: prop.nombre.slice(0, 60),
            body: formatearDetallePropiedad(prop),
            buttons: [
                { id: `reservar_prop_${propiedadId}`, title: "Reservar visita" },
                { id: `ver_web_prop_${propiedadId}`, title: "Ver en web" },
                { id: "btn_volver", title: "Volver" },
            ],
            footer: [sectorNombre, ciudadNombre].filter(Boolean).join(", ")
        }
    }
}

// ─────────────────────────────────────────
// MOSTRAR DETALLE PROYECTO
// ─────────────────────────────────────────
async function mostrarDetalleProyecto(
    proyectoId: number,
    session: any,
    state: any,
    tenant: any,
    phoneNumberId: string,
    from: string
): Promise<Respuesta> {

    const { data: proy } = await supabase
        .from("proyectos")
        .select("*, ciudad:ciudad_id(nombre), sector:sector_id(nombre)")
        .eq("id", proyectoId)
        .eq("tenant_id", tenant.id)
        .single()

    if (!proy) return listarProyectos(tenant.id)

    await Promise.all([
        supabase.from("proyectos")
            .update({ total_consultas: (proy.total_consultas || 0) + 1 })
            .eq("id", proyectoId),
        updateSession(session.id, { ...state, step: "detalle_proyecto", proyecto_id: proyectoId })
    ])

    const fotos = (proy.fotos as any[])
        ?.map(f => typeof f === "string" ? f : f?.url)
        .filter(Boolean).slice(0, 3) || []

    if (fotos.length > 0) {
        const precio = proy.precio_desde ? `Desde $${Number(proy.precio_desde).toLocaleString("es-EC")}` : ""
        const caption = [proy.nombre, (proy.ciudad as any)?.nombre, precio].filter(Boolean).join("  ·  ").slice(0, 1024)

        for (let i = 0; i < fotos.length; i++) {
            await sendWhatsAppImage(phoneNumberId, from, fotos[i], i === fotos.length - 1 ? caption : undefined).catch(() => { })
            if (i < fotos.length - 1) await new Promise(r => setTimeout(r, 300))
        }
    }

    return {
        tipo: "buttons",
        payload: {
            header: proy.nombre.slice(0, 60),
            body: formatearDetalleProyecto(proy),
            buttons: [
                { id: `ver_unidades_${proyectoId}`, title: "Ver unidades" },
                { id: `reservar_proy_${proyectoId}`, title: "Reservar visita" },
                { id: "btn_volver", title: "Volver" },
            ],
            footer: (proy.ciudad as any)?.nombre || ""
        }
    }
}

// ─────────────────────────────────────────
// MOSTRAR HORARIOS
// ─────────────────────────────────────────
async function mostrarHorarios(
    tipo: "propiedad" | "proyecto",
    id: number,
    diasMax: number,
    sessionId: number,
    state: any
): Promise<Respuesta> {

    const desde = new Date().toISOString().split("T")[0]
    const hasta = new Date(Date.now() + diasMax * 86400000).toISOString().split("T")[0]
    const campo = tipo === "propiedad" ? "propiedad_id" : "proyecto_id"

    const { data } = await supabase
        .from("horarios_disponibles")
        .select("id, fecha, hora_inicio, hora_fin")
        .eq(campo, id).eq("disponible", true)
        .gte("fecha", desde).lte("fecha", hasta)
        .is("deleted_at", null)
        .order("fecha", { ascending: true }).limit(6)

    const stepNuevo = tipo === "propiedad" ? "agendar_propiedad" : "agendar_proyecto"
    const campoId = tipo === "propiedad" ? "propiedad_id" : "proyecto_id"

    if (!data?.length) {
        await updateSession(sessionId, { ...state, step: "solicitar_fecha_visita", [campoId]: id, intentos_fecha: 0 })
        return "No hay horarios disponibles por ahora.\n\nIndica el día y hora que prefieres y un asesor lo confirmará:\n\nEj: mañana a las 3pm\nEj: el sábado a las 10am"
    }

    const ids = data.map(h => h.id)
    await updateSession(sessionId, { ...state, step: stepNuevo, [campoId]: id, horarios_ids: ids })

    return {
        tipo: "list",
        payload: {
            header: "Horarios disponibles",
            body: "Selecciona el horario para tu visita:",
            buttonText: "Ver horarios",
            sections: [{
                title: "Disponibles",
                rows: data.map(h => ({
                    id: `horario_${h.id}`,
                    title: new Date(h.fecha + "T00:00:00").toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" }),
                    description: `${h.hora_inicio} - ${h.hora_fin}`
                }))
            }]
        }
    }
}

// ─────────────────────────────────────────
// CONFIRMAR CITA
// ─────────────────────────────────────────
async function confirmarCita(
    horarioId: number,
    state: any,
    session: any,
    tenant: any,
    cliente: any
): Promise<Respuesta> {

    const { data: horario } = await supabase
        .from("horarios_disponibles")
        .select("*").eq("id", horarioId).eq("disponible", true).single()

    if (!horario) return "Ese horario ya no está disponible. Elige otro:"

    const reservaData: any = {
        tenant_id: tenant.id,
        cliente_id: cliente.id,
        horario_id: horarioId,
        fecha: `${horario.fecha}T${horario.hora_inicio}`,
        estado: "pendiente",
    }
    if (state.propiedad_id) reservaData.propiedad_id = state.propiedad_id
    if (state.proyecto_id) reservaData.proyecto_id = state.proyecto_id

    await Promise.all([
        supabase.from("reservas").insert(reservaData),
        supabase.from("horarios_disponibles").update({ disponible: false }).eq("id", horarioId),
        supabase.from("notificaciones").insert({
            tenant_id: tenant.id,
            cliente_id: cliente.id,
            sesion_id: session.id,
            tipo: "cita_nueva",
            mensaje: `Nueva cita de ${cliente.celular} para ${horario.fecha} a las ${horario.hora_inicio}`
        })
    ])

    const fechaFormato = new Date(`${horario.fecha}T${horario.hora_inicio}`).toLocaleDateString("es-EC", {
        weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
    })

    await updateSession(session.id, { step: "inicio" })

    const nombre = cliente.nombres_completos?.split(" ")[0] || "estimad@ cliente"
    return `Cita confirmada ✅\n\nFecha: ${fechaFormato}\n\nTe esperamos, ${nombre}.\nEscribe "citas" para gestionar tu cita.`
}

// ─────────────────────────────────────────
// RESOLVER UBICACIÓN
// ─────────────────────────────────────────
async function resolverUbicacion(texto: string, tenantId: number): Promise<{
    ciudad_id: number | null
    ciudad_nombre: string | null
    sector_id: number | null | undefined
    sector_nombre: string | null
    ambiguo?: { sector: string; ciudades: any[] }
}> {
    // Ciudad exacta
    const { data: cExacta } = await supabase
        .from("ciudades").select("id, nombre").ilike("nombre", texto).maybeSingle()
    if (cExacta) return { ciudad_id: cExacta.id, ciudad_nombre: cExacta.nombre, sector_id: null, sector_nombre: null }

    // Ciudad con %
    const { data: cFuzzy } = await supabase
        .from("ciudades").select("id, nombre").ilike("nombre", `%${texto}%`).maybeSingle()
    if (cFuzzy) return { ciudad_id: cFuzzy.id, ciudad_nombre: cFuzzy.nombre, sector_id: null, sector_nombre: null }

    // Sector
    const { data: sectores } = await supabase
        .from("sectores")
        .select("id, nombre, ciudades:ciudad_id(id, nombre)")
        .ilike("nombre", `%${texto}%`).limit(5)

    if (sectores?.length === 1) {
        return {
            ciudad_id: (sectores[0].ciudades as any)?.id,
            ciudad_nombre: (sectores[0].ciudades as any)?.nombre,
            sector_id: sectores[0].id,
            sector_nombre: sectores[0].nombre,
        }
    }
    if (sectores && sectores.length > 1) {
        return {
            ciudad_id: null, ciudad_nombre: null, sector_id: null, sector_nombre: null,
            ambiguo: {
                sector: sectores[0].nombre,
                ciudades: sectores.map((s: any) => ({
                    id: (s.ciudades as any)?.id,
                    nombre: (s.ciudades as any)?.nombre
                })).filter(c => c.id)
            }
        }
    }

    // Fuzzy con fuse.js
    const { data: todas } = await supabase.from("ciudades").select("id, nombre")
    if (todas?.length) {
        const Fuse = (await import("fuse.js")).default
        const fuse = new Fuse(todas, { keys: ["nombre"], threshold: 0.4 })
        const match = fuse.search(texto)[0]
        if (match) return {
            ciudad_id: (match.item as any).id,
            ciudad_nombre: (match.item as any).nombre,
            sector_id: null, sector_nombre: null
        }
    }

    return { ciudad_id: null, ciudad_nombre: null, sector_id: null, sector_nombre: null }
}

// ─────────────────────────────────────────
// RESOLVER FILTROS CON UBICACIÓN
// ─────────────────────────────────────────
async function resolverFiltros(filtros: Filtros, tenantId: number, config: any): Promise<Filtros & { ambiguo?: any }> {
    const params: any = { ...filtros }

    if (filtros.ubicacion) {
        const ctx = await resolverUbicacion(filtros.ubicacion, tenantId)
        if (ctx.ambiguo) {
            params.ambiguo = ctx.ambiguo
        } else {
            params.ciudad = ctx.ciudad_nombre
            params.ciudad_id = ctx.ciudad_id
            params.sector = ctx.sector_nombre
            params.sector_id = ctx.sector_id
        }
        delete params.ubicacion
    }

    if (!params.ciudad_id && config?.ciudad_default_id) {
        params.ciudad_id = config.ciudad_default_id
        if (!params.ciudad) {
            const { data: c } = await supabase.from("ciudades").select("nombre").eq("id", config.ciudad_default_id).single()
            params.ciudad = c?.nombre
        }
    }

    return params
}

// ─────────────────────────────────────────
// RESOLVER SLUG/URL
// ─────────────────────────────────────────
async function resolverSlug(
    slug: string,
    session: any,
    tenant: any,
    phoneNumberId: string,
    from: string
): Promise<Respuesta> {
    const { data: link } = await supabase.rpc("resolver_link", { p_slug: slug })
    if (!link?.valido) return "Ese enlace no existe o ya no está disponible."

    if (link.tipo === "propiedad") return mostrarDetallePropiedad(link.propiedad_id, session, session.contenido, tenant, phoneNumberId, from)
    if (link.tipo === "proyecto") return mostrarDetalleProyecto(link.proyecto_id, session, session.contenido, tenant, phoneNumberId, from)
    return "Enlace no reconocido."
}

// ─────────────────────────────────────────
// RESPONDER INFO
// ─────────────────────────────────────────
async function responderInfo(pregunta: string, propiedadId: number): Promise<Respuesta> {
    const { data: prop } = await supabase
        .from("propiedades")
        .select("precio, precio_negociable, tipo_operacion, tipo_pago, ambientes, estacionamiento, dimensiones, estado")
        .eq("id", propiedadId).single()

    if (!prop) return "No pude obtener la información."

    const p = pregunta.toLowerCase()

    if (/negoci|rebaj|precio|oferta/.test(p)) {
        const precio = `$${Number(prop.precio).toLocaleString("es-EC")}${prop.tipo_operacion === "alquiler" ? "/mes" : ""}`
        return prop.precio_negociable
            ? `El precio de ${precio} es negociable. 💬\n\nHabla con nuestro asesor para hacer una oferta.`
            : `El precio de ${precio} está fijo.`
    }

    if (/biess|financ|crédito|credito|pago|cuota/.test(p)) {
        const pagos = prop.tipo_pago as string[] || []
        const items = [pagos.includes("biess") && "✅ BIESS", pagos.includes("financiamiento") && "✅ Crédito hipotecario", pagos.includes("contado") && "✅ Contado"].filter(Boolean)
        return items.length ? `Formas de pago:\n\n${items.join("\n")}` : "Consulta las formas de pago con nuestro asesor."
    }

    if (/garaje|parqueadero/.test(p)) {
        const est = (prop.estacionamiento as any) || {}
        return est.estacionamientos
            ? `Tiene ${est.estacionamientos} garaje${est.estacionamientos > 1 ? "s" : ""}${est.cubierto ? " cubierto" : ""}.`
            : "No especificado. Consulta con el asesor."
    }

    if (/mascota|perro|gato/.test(p)) {
        return {
            tipo: "buttons",
            payload: {
                body: "La política de mascotas depende del propietario. Un asesor puede confirmarte este detalle.",
                buttons: [
                    { id: "hablar_agente", title: "Preguntar al asesor" },
                    { id: "btn_volver", title: "Volver" },
                ]
            }
        }
    }

    if (/disponib|vendid|arrendad/.test(p)) {
        return prop.estado === "disponible" ? "Sí, está disponible. ✅\n\n¿Quieres agendar una visita?" : "Ya no está disponible. 😔"
    }

    if (/hab|cuarto|dormitorio/.test(p)) {
        const amb = (prop.ambientes as any) || {}
        return amb.habitaciones ? `Tiene ${amb.habitaciones} habitación${amb.habitaciones > 1 ? "es" : ""}.` : "No especificado."
    }

    return {
        tipo: "buttons",
        payload: {
            body: "Esa información no está cargada. Un asesor puede ayudarte.",
            buttons: [
                { id: "hablar_agente", title: "Hablar con asesor" },
                { id: "btn_volver", title: "Volver" },
            ]
        }
    }
}

async function responderInfoProyecto(pregunta: string, proyectoId: number): Promise<Respuesta> {
    const { data: proy } = await supabase
        .from("proyectos")
        .select("precio_desde, precio_hasta, fecha_entrega_estimada, tipo_pago, amenidades")
        .eq("id", proyectoId).single()

    if (!proy) return "No pude obtener la información del proyecto."

    const p = pregunta.toLowerCase()

    if (/entrega|cuándo|cuando|plazo/.test(p)) {
        return proy.fecha_entrega_estimada
            ? `La entrega estimada es ${new Date(proy.fecha_entrega_estimada).toLocaleDateString("es-EC", { month: "long", year: "numeric" })}. 🏗`
            : "La fecha de entrega está por confirmar. Un asesor puede darte más detalles."
    }

    if (/precio|cuánto|cuanto/.test(p)) {
        const desde = `$${Number(proy.precio_desde).toLocaleString("es-EC")}`
        const hasta = proy.precio_hasta ? ` hasta $${Number(proy.precio_hasta).toLocaleString("es-EC")}` : ""
        return `Precios desde ${desde}${hasta}.`
    }

    if (/biess|financ|pago/.test(p)) {
        const pagos = proy.tipo_pago as string[] || []
        const items = [pagos.includes("biess") && "✅ BIESS", pagos.includes("financiamiento") && "✅ Crédito hipotecario", pagos.includes("contado") && "✅ Contado"].filter(Boolean)
        return items.length ? `Formas de pago:\n\n${items.join("\n")}` : "Consulta las formas de pago con nuestro asesor."
    }

    return "Un asesor puede responderte esa consulta con más detalle."
}

async function responderInfoGeneral(texto: string, tenant: any, config: any): Promise<Respuesta> {
    return {
        tipo: "buttons",
        payload: {
            body: "Para esa consulta, nuestro asesor puede ayudarte mejor.",
            buttons: [
                { id: "hablar_agente", title: "Hablar con asesor" },
                { id: "btn_propiedades", title: "Buscar propiedad" },
            ]
        }
    }
}

// ─────────────────────────────────────────
// DETECTAR COMANDO EXACTO
// ─────────────────────────────────────────
function detectarComandoExacto(text: string): string | null {
    const comandos: Record<string, string> = {
        "agente": "agente", "asesor": "agente", "humano": "agente",
        "hablar con agente": "agente", "hablar con asesor": "agente",
        "hola": "saludo", "buenas": "saludo", "buenos dias": "saludo",
        "buenos días": "saludo", "buenas tardes": "saludo",
        "buenas noches": "saludo", "hi": "saludo", "hey": "saludo",
        "menu": "menu", "menú": "menu", "inicio": "menu", "bot": "menu",
        "citas": "citas", "mis citas": "citas", "ver citas": "citas",
    }
    return comandos[text] || null
}

// ─────────────────────────────────────────
// EJECUTAR COMANDO
// ─────────────────────────────────────────
async function ejecutarComando(
    comando: string,
    state: any,
    session: any,
    tenant: any,
    cliente: any,
    config: any,
    phoneNumberId: string,
    from: string
): Promise<Respuesta> {
    switch (comando) {
        case "agente":
            await activarModoManual(session, tenant, cliente)
            return `Un asesor te atenderá en breve. ⏳\n\nEn ${config?.tiempo_manual_min ?? 15} minutos el asistente se reactivará.`
        case "menu":
        case "saludo":
            return menuPrincipal(tenant, cliente, config)
        case "citas":
            return listarCitas(cliente.id, tenant.id)
        default:
            return menuPrincipal(tenant, cliente, config)
    }
}

// ─────────────────────────────────────────
// EXTRAER FECHA/HORA CON LLM
// ─────────────────────────────────────────
async function extraerFechaHoraLLM(texto: string): Promise<{ fecha: string | null; hora: string | null }> {
    const hoy = new Date().toISOString().split("T")[0]
    try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY!,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 100,
                messages: [{
                    role: "user",
                    content: `Hoy es ${hoy} Ecuador. Extrae fecha y hora de: "${texto}". Responde SOLO JSON: {"fecha":"YYYY-MM-DD o null","hora":"HH:MM o null"}`
                }]
            })
        })
        const data = await res.json()
        return JSON.parse(data.content[0].text.replace(/```json|```/g, "").trim())
    } catch {
        return { fecha: null, hora: null }
    }
}

// ─────────────────────────────────────────
// DISPLAY HELPERS
// ─────────────────────────────────────────
async function menuPrincipal(tenant: any, cliente: any, config: any): Promise<Respuesta> {
    const saludo = config?.saludo || `Bienvenido a ${tenant.nombre}`
    const nombre = cliente.nombres_completos && cliente.nombres_completos !== "Cliente WhatsApp"
        ? ` ${cliente.nombres_completos.split(" ")[0]}` : ""

    const { data: cita } = await supabase
        .from("reservas")
        .select("fecha, propiedades:propiedad_id(nombre), proyectos:proyecto_id(nombre)")
        .eq("cliente_id", cliente.id).eq("tenant_id", tenant.id)
        .in("estado", ["pendiente", "confirmada"])
        .gte("fecha", new Date().toISOString())
        .is("deleted_at", null)
        .order("fecha", { ascending: true }).limit(1).maybeSingle()

    let body = saludo.replace("Bienvenido", `Bienvenido${nombre}`)

    if (cita) {
        const prop = (cita.propiedades as any)?.nombre || (cita.proyectos as any)?.nombre || "visita"
        const fecha = new Date(cita.fecha).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
        body += `\n\nTienes una cita para *${prop}* el ${fecha}.`
    }

    body += "\n\n¿En qué puedo ayudarte?"

    return {
        tipo: "buttons",
        payload: {
            body,
            buttons: [
                { id: "btn_propiedades", title: "Buscar propiedad" },
                { id: "btn_proyectos", title: "Ver proyectos" },
                { id: "hablar_agente", title: "Hablar con asesor" },
            ],
            footer: cita ? "Escribe 'citas' para gestionar tu cita" : undefined
        }
    }
}

async function listarProyectos(tenantId: number): Promise<Respuesta> {
    const { data } = await supabase
        .from("proyectos")
        .select("id, nombre, precio_desde, ciudad:ciudad_id(nombre)")
        .eq("tenant_id", tenantId).eq("estado", "activo")
        .is("deleted_at", null).limit(10)

    if (!data?.length) return {
        tipo: "buttons",
        payload: {
            body: "No hay proyectos disponibles por ahora.",
            buttons: [{ id: "btn_propiedades", title: "Ver propiedades" }, { id: "btn_menu", title: "Menú principal" }]
        }
    }

    return {
        tipo: "list",
        payload: {
            header: "Proyectos disponibles",
            body: "Selecciona el proyecto que te interesa:",
            buttonText: "Ver proyectos",
            sections: [{
                title: "Disponibles",
                rows: data.map((p: any) => ({
                    id: `proy_${p.id}`,
                    title: p.nombre.slice(0, 24),
                    description: `${(p.ciudad as any)?.nombre || ""} · Desde $${Number(p.precio_desde).toLocaleString("es-EC")}`
                }))
            }]
        }
    }
}

async function listarUnidades(proyectoId: number): Promise<Respuesta> {
    const { data } = await supabase
        .from("propiedades")
        .select("id, nombre, precio, ambientes, dimensiones")
        .eq("proyecto_id", proyectoId).eq("estado", "disponible")
        .is("deleted_at", null).limit(8)

    if (!data?.length) return "No hay unidades disponibles.\n\nEscribe 'agente' para más información."

    return {
        tipo: "list",
        payload: {
            header: "Unidades disponibles",
            body: "Selecciona una unidad:",
            buttonText: "Ver unidades",
            sections: [{
                title: "Disponibles",
                rows: data.map(p => {
                    const hab = (p.ambientes as any)?.habitaciones
                    const m2 = (p.dimensiones as any)?.m2_construccion || (p.dimensiones as any)?.m2_total
                    return {
                        id: `prop_${p.id}`,
                        title: p.nombre.slice(0, 24),
                        description: [`$${Number(p.precio).toLocaleString("es-EC")}`, hab ? `${hab} hab` : null, m2 ? `${m2}m²` : null].filter(Boolean).join(" · ")
                    }
                })
            }]
        }
    }
}

async function listarCitas(clienteId: number, tenantId: number): Promise<Respuesta> {
    const { data } = await supabase
        .from("reservas")
        .select("id, fecha, estado, propiedades:propiedad_id(nombre), proyectos:proyecto_id(nombre)")
        .eq("cliente_id", clienteId).eq("tenant_id", tenantId)
        .gte("fecha", new Date().toISOString())
        .is("deleted_at", null).order("fecha", { ascending: true }).limit(5)

    if (!data?.length) return {
        tipo: "buttons",
        payload: {
            body: "No tienes citas programadas.",
            buttons: [{ id: "btn_propiedades", title: "Buscar propiedades" }, { id: "btn_menu", title: "Menú principal" }]
        }
    }

    const lineas = data.map(r => {
        const nombre = (r.propiedades as any)?.nombre || (r.proyectos as any)?.nombre || "Visita"
        const fecha = new Date(r.fecha).toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        return `${r.estado === "confirmada" ? "✅" : "⏳"} ${nombre}\n   ${fecha}`
    })

    return {
        tipo: "buttons",
        payload: {
            header: `Tus citas (${data.length})`,
            body: lineas.join("\n\n"),
            buttons: [
                { id: "hablar_agente", title: "Modificar cita" },
                { id: "btn_propiedades", title: "Ver propiedades" },
                { id: "btn_menu", title: "Menú principal" },
            ],
            footer: "Escribe 'agente' para cancelar o reprogramar"
        }
    }
}

function construirPreguntaAmbigua(sector: string, ciudades: any[]): Respuesta {
    if (ciudades.length <= 3) {
        return {
            tipo: "buttons",
            payload: {
                body: `El sector ${sector} existe en varias ciudades. ¿En cuál buscas?`,
                buttons: ciudades.slice(0, 3).map(c => ({ id: `ciudad_confirm_${c.id}`, title: c.nombre }))
            }
        }
    }
    return {
        tipo: "list",
        payload: {
            body: `El sector ${sector} existe en varias ciudades. ¿En cuál buscas?`,
            buttonText: "Ver ciudades",
            sections: [{ title: "Ciudades", rows: ciudades.slice(0, 9).map(c => ({ id: `ciudad_confirm_${c.id}`, title: c.nombre })) }]
        }
    }
}

function solicitarCedula(): Respuesta {
    return "Para agendar necesitamos verificar tu identidad.\n\nIngresa tu cédula (10 dígitos):"
}

// ─────────────────────────────────────────
// FORMATEAR CONTENIDO
// ─────────────────────────────────────────
function formatearDetallePropiedad(p: any): string {
    const dim = p.dimensiones || {}, amb = p.ambientes || {}
    const ext = p.exteriores || {}, est = p.estacionamiento || {}
    const extra = p.extras || {}, seg = p.seguridad || {}
    const pago = Array.isArray(p.tipo_pago) ? p.tipo_pago.join(", ") : ""
    const lineas: string[] = []

    if (p.precio) lineas.push(`Precio: $${Number(p.precio).toLocaleString("es-EC")}${p.tipo_operacion === "alquiler" ? "/mes" : ""}${p.precio_negociable ? " (negociable)" : ""}`)
    if (dim.m2_construccion) lineas.push(`Construcción: ${dim.m2_construccion}m²`)
    if (dim.m2_terreno) lineas.push(`Terreno: ${dim.m2_terreno}m²`)
    if (dim.m2_total && !dim.m2_construccion) lineas.push(`Total: ${dim.m2_total}m²`)
    if (dim.pisos && dim.pisos > 1) lineas.push(`Pisos: ${dim.pisos}`)
    if (amb.habitaciones) lineas.push(`Habitaciones: ${amb.habitaciones}`)
    if (amb.banos) lineas.push(`Baños: ${amb.banos}`)
    if (amb.medios_banos) lineas.push(`Medios baños: ${amb.medios_banos}`)
    if (est.estacionamientos) lineas.push(`Garaje: ${est.estacionamientos}${est.cubierto ? " cubierto" : ""}`)
    if (est.bodega) lineas.push(`Bodega incluida`)

    const extItems = [ext.patio && "Patio", ext.jardin && "Jardín", ext.terraza && "Terraza", ext.balcon && "Balcón", ext.piscina && "Piscina", ext.bbq && "BBQ"].filter(Boolean)
    if (extItems.length) lineas.push(`Exteriores: ${extItems.join(", ")}`)

    const segItems = [seg.conjunto_cerrado && "Conjunto cerrado", seg.guardianía && "Guardianía", seg.camara_seguridad && "Cámaras", seg.alarma && "Alarma"].filter(Boolean)
    if (segItems.length) lineas.push(`Seguridad: ${segItems.join(", ")}`)

    const extraItems = [extra.amoblado && "Amoblado", extra.ascensor && "Ascensor", extra.generador && "Generador", extra.panel_solar && "Panel solar"].filter(Boolean)
    if (extraItems.length) lineas.push(`Extras: ${extraItems.join(", ")}`)

    if (pago) lineas.push(`Forma de pago: ${pago}`)
    if (p.descripcion) lineas.push(`\n${p.descripcion.slice(0, 200)}`)

    return lineas.map((l, i) => l.startsWith("\n") ? l : `${i + 1}. ${l}`).join("\n")
}

function formatearDetalleProyecto(p: any): string {
    const amenidades = Array.isArray(p.amenidades) ? p.amenidades.join(", ") : ""
    const pago = Array.isArray(p.tipo_pago) ? p.tipo_pago.join(", ") : ""
    const lineas: string[] = []

    if (p.precio_desde) lineas.push(`Precio: desde $${Number(p.precio_desde).toLocaleString("es-EC")}${p.precio_hasta ? ` hasta $${Number(p.precio_hasta).toLocaleString("es-EC")}` : ""}`)
    if (p.fecha_entrega_estimada) lineas.push(`Entrega estimada: ${new Date(p.fecha_entrega_estimada).toLocaleDateString("es-EC", { month: "long", year: "numeric" })}`)
    if (amenidades) lineas.push(`Amenidades: ${amenidades}`)
    if (pago) lineas.push(`Forma de pago: ${pago}`)
    if (p.descripcion) lineas.push(`\n${p.descripcion}`)
    if (p.slogan) lineas.push(`"${p.slogan}"`)

    return lineas.map((l, i) => l.startsWith("\n") || l.startsWith('"') ? l : `${i + 1}. ${l}`).join("\n")
}

// ─────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────
async function activarModoManual(session: any, tenant: any, cliente: any) {
    await Promise.all([
        supabase.from("chat_sesiones").update({ modo: "manual" }).eq("id", session.id),
        supabase.from("notificaciones").insert({
            tenant_id: tenant.id,
            cliente_id: cliente.id,
            sesion_id: session.id,
            tipo: "modo_manual",
            mensaje: `${cliente.celular} solicitó un agente`
        })
    ])
}

async function updateSession(id: number, contenido: any) {
    await supabase.from("chat_sesiones")
        .update({ contenido, updated_at: new Date().toISOString() })
        .eq("id", id)
}