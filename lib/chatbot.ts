import { supabase } from "./supabase"
import { validarCedulaAPI } from "./cedula"
import {
    sendWhatsAppButtons,
    sendWhatsAppList,
    sendWhatsAppMessage,
    sendWhatsAppImage,
} from "./whatsapp"
import {
    extraerParametros,
    extraerFechaHora,
    parametrosFaltantes,
    preguntarParametro,
    type ParametrosExtraidos
} from "./nlp"

type Respuesta = string | { tipo: "buttons" | "list" | "image"; payload: any }

// =========================
// VALIDAR Y ENRIQUECER
// =========================
async function validarYEnriquecerParametros(
    params: ParametrosExtraidos,
    tenantId: number
): Promise<ParametrosExtraidos & { ambiguo?: any }> {
    const enriquecido: any = { ...params }

    if (params.ciudad) {
        // Paso 1 — verificar si es ciudad válida (match exacto primero)
        const { data: ciudadExacta } = await supabase
            .from("ciudades")
            .select("id, nombre")
            .ilike("nombre", params.ciudad)  // ← exacto, sin %
            .maybeSingle()

        // Si no coincide exacto, intentar con %
        const { data: ciudadDB } = ciudadExacta ? { data: ciudadExacta } : await supabase
            .from("ciudades")
            .select("id, nombre")
            .ilike("nombre", `%${params.ciudad}%`)
            .maybeSingle()

        if (!ciudadDB) {
            // Paso 2 — buscar como sector, ordenar por similitud
            // Usar match exacto primero para evitar falsos positivos
            const { data: sectorExacto } = await supabase
                .from("sectores")
                .select("id, nombre, ciudades:ciudad_id(id, nombre)")
                .ilike("nombre", params.ciudad)  // exacto primero
                .limit(5)

            const { data: sectorFuzzy } = (!sectorExacto?.length) ? await supabase
                .from("sectores")
                .select("id, nombre, ciudades:ciudad_id(id, nombre)")
                .ilike("nombre", `%${params.ciudad}%`)
                .limit(5) : { data: null }

            const sectoresDB = sectorExacto?.length ? sectorExacto : (sectorFuzzy || [])

            if (sectoresDB.length === 1) {
                enriquecido.sector = sectoresDB[0].nombre
                enriquecido.ciudad = (sectoresDB[0].ciudades as any)?.nombre || undefined
                console.log(`[NLP] "${params.ciudad}" → sector único: ${enriquecido.sector}, ciudad: ${enriquecido.ciudad}`)

            } else if (sectoresDB.length > 1) {
                // Ambiguo — múltiples ciudades
                enriquecido.sector = sectoresDB[0].nombre
                enriquecido.ciudad = undefined
                enriquecido.ambiguo = {
                    tipo: "sector_multiciudad",
                    sector: sectoresDB[0].nombre,
                    ciudades: sectoresDB.map((s: any) => ({
                        id: (s.ciudades as any)?.id,
                        nombre: (s.ciudades as any)?.nombre
                    })).filter(c => c.id)
                }
                console.log(`[NLP] "${params.ciudad}" ambiguo en ${sectoresDB.length} ciudades`)

            } else {
                // No existe como sector — NO limpiar ciudad, marcar como desconocido
                // para que se pregunte al usuario
                console.log(`[NLP] "${params.ciudad}" no reconocido como ciudad ni sector`)
                enriquecido.ciudad_desconocida = params.ciudad
                enriquecido.ciudad = undefined
            }
        }
    }

    // Si tiene sector pero no ciudad — derivar ciudad
    if (enriquecido.sector && !enriquecido.ciudad && !enriquecido.ambiguo) {
        const { data: sectoresDB } = await supabase
            .from("sectores")
            .select("id, nombre, ciudades:ciudad_id(id, nombre)")
            .ilike("nombre", enriquecido.sector)  // exacto
            .limit(5)

        if (sectoresDB?.length === 1) {
            enriquecido.ciudad = (sectoresDB[0].ciudades as any)?.nombre || undefined
        } else if (sectoresDB && sectoresDB.length > 1) {
            enriquecido.ambiguo = {
                tipo: "sector_multiciudad",
                sector: enriquecido.sector,
                ciudades: sectoresDB.map((s: any) => ({
                    id: (s.ciudades as any)?.id,
                    nombre: (s.ciudades as any)?.nombre
                })).filter(c => c.id)
            }
        }
    }

    return enriquecido
}

// =========================
// INTERPRETAR TEXTO LIBRE
// =========================
async function interpretarTextoLibre(
    texto: string,
    parametro: "ciudad" | "tipo_operacion" | "tipo_propiedad" | "sector",
    tenantId: number,
    contexto?: any
): Promise<{ valor: string | null; ciudad?: string; sector?: string; ambiguo?: any }> {

    const t = texto.toLowerCase().trim()

    if (parametro === "tipo_operacion") {
        // Exacto
        if (/^(comprar|compra|venta)$/.test(t)) return { valor: "venta" }
        if (/^(arrendar|arriendo|alquilar|alquiler|rentar|renta)$/.test(t)) return { valor: "alquiler" }
        // NLP
        const params = await extraerParametros(texto)
        if (params.tipo_operacion) return { valor: params.tipo_operacion }
        // Regex amplio
        if (/comprar|comprarla|comprarlo|adquirir/.test(t)) return { valor: "venta" }
        if (/arrendar|arrendarlo|arrendarla|alquil|rentar/.test(t)) return { valor: "alquiler" }
        return { valor: null }
    }

    if (parametro === "tipo_propiedad") {
        // Exacto
        const exacto = resolverTipo(t)
        if (exacto) return { valor: exacto }
        // NLP
        const params = await extraerParametros(texto)
        if (params.tipo_propiedad) return { valor: params.tipo_propiedad }
        return { valor: null }
    }

    if (parametro === "ciudad") {
        // 1. NLP primero
        const params = await extraerParametros(texto)
        if (params.ciudad || params.sector) {
            const enriquecido = await validarYEnriquecerParametros(params, tenantId)
            if ((enriquecido as any).ambiguo) return {
                valor: null,
                ambiguo: (enriquecido as any).ambiguo
            }
            if (enriquecido.ciudad) return {
                valor: enriquecido.ciudad,
                ciudad: enriquecido.ciudad,
                sector: enriquecido.sector,
            }
        }

        // 2. Fuzzy match contra ciudades
        const resultado = await buscarCiudadFuzzy(texto, tenantId,
            contexto?.tipo_operacion, contexto?.tipo_propiedad)
        if (resultado) return { valor: resultado.nombre, ciudad: resultado.nombre }

        // 3. Buscar como sector
        const { data: sectoresDB } = await supabase
            .from("sectores")
            .select("id, nombre, ciudades:ciudad_id(id, nombre)")
            .ilike("nombre", `%${texto}%`)

        if (sectoresDB?.length === 1) {
            const ciudadNombre = (sectoresDB[0].ciudades as any)?.nombre
            return { valor: ciudadNombre, ciudad: ciudadNombre, sector: sectoresDB[0].nombre }
        }

        if (sectoresDB && sectoresDB.length > 1) {
            return {
                valor: null,
                ambiguo: {
                    tipo: "sector_multiciudad",
                    sector: sectoresDB[0].nombre,
                    ciudades: sectoresDB.map((s: any) => ({
                        id: (s.ciudades as any)?.id,
                        nombre: (s.ciudades as any)?.nombre
                    })).filter(c => c.id)
                }
            }
        }

        return { valor: null }
    }

    if (parametro === "sector") {
        const params = await extraerParametros(texto)
        if (params.sector) return { valor: params.sector, sector: params.sector }

        if (contexto?.ciudad_id) {
            const { data } = await supabase
                .from("sectores")
                .select("id, nombre")
                .eq("ciudad_id", contexto.ciudad_id)
                .ilike("nombre", `%${texto}%`)
                .limit(1)
                .maybeSingle()
            if (data) return { valor: data.nombre, sector: data.nombre }
        }

        return { valor: null }
    }

    return { valor: null }
}

// =========================
// CONFIRMAR Y BUSCAR
// =========================
async function confirmarYBuscar(
    params: any,
    session: any,
    tenant: any,
    cliente: any,
    config: any,
    phoneNumberId: string,
    from: string
): Promise<Respuesta> {

    // Si hay ambigüedad — preguntar primero
    if (params.ambiguo?.tipo === "sector_multiciudad") {
        await updateSession(session.id, {
            step: "confirmar_busqueda",
            params_busqueda: params,
            ambiguo_ciudades: params.ambiguo.ciudades
        })
        return await construirPreguntaCiudadAmbigua(
            params.ambiguo.sector,
            params.ambiguo.ciudades
        )
    }

    // Nombre del cliente
    const nombreCliente = cliente.nombres_completos &&
        cliente.nombres_completos !== "Cliente WhatsApp"
        ? cliente.nombres_completos.split(" ")[0]
        : null

    // Construir resumen
    const partes: string[] = []
    if (params.tipo_propiedad) partes.push(params.tipo_propiedad)
    if (params.tipo_operacion === "alquiler") partes.push("en arriendo")
    else if (params.tipo_operacion === "venta") partes.push("para comprar")
    if (params.sector) partes.push(`en ${params.sector}`)
    if (params.ciudad) partes.push(params.ciudad)
    if (params.habitaciones_min) partes.push(`${params.habitaciones_min}+ hab`)
    if (params.precio_max) partes.push(`hasta $${Number(params.precio_max).toLocaleString("es-EC")}`)
    if (params.con_estacionamiento) partes.push("con garaje")
    if (params.tipo_pago === "biess") partes.push("BIESS")

    const resumen = partes.join(", ")
    const saludo = nombreCliente ? `Hola ${nombreCliente}! 👋\n\n` : ""

    // Enviar confirmación primero
    if (phoneNumberId && from) {
        await sendWhatsAppMessage(
            phoneNumberId,
            from,
            `${saludo}Perfecto, buscando: ${resumen}... 🔍\n\nDame un momento.`
        )
    }

    return await buscarYMostrar(params, session, tenant, config)
}

// =========================
// CONSTRUIR PREGUNTA CIUDAD AMBIGUA
// =========================
async function construirPreguntaCiudadAmbigua(
    sector: string,
    ciudades: { id: number; nombre: string }[]
): Promise<Respuesta> {
    if (ciudades.length <= 3) {
        return {
            tipo: "buttons",
            payload: {
                body: `El sector ${sector} existe en varias ciudades. En cuál buscas?`,
                buttons: ciudades.slice(0, 3).map(c => ({
                    id: `ciudad_confirm_${c.id}`,
                    title: c.nombre
                }))
            }
        }
    }

    return {
        tipo: "list",
        payload: {
            body: `El sector ${sector} existe en varias ciudades. En cuál buscas?`,
            buttonText: "Ver ciudades",
            sections: [{
                title: "Ciudades",
                rows: ciudades.slice(0, 9).map(c => ({
                    id: `ciudad_confirm_${c.id}`,
                    title: c.nombre
                }))
            }]
        }
    }
}

// =========================
// HANDLE LINK
// =========================
export async function handleLink({
    tenant, cliente, session, linkData, phoneNumberId, config,
}: any): Promise<Respuesta | null> {

    const { tipo, propiedad_id, proyecto_id } = linkData

    await supabase
        .from("chat_sesiones")
        .update({
            contenido: { step: "detalle_link", tipo, propiedad_id, proyecto_id },
            updated_at: new Date().toISOString(),
        })
        .eq("id", session.id)

    if (tipo === "propiedad" && propiedad_id) {
        const { data: prop } = await supabase
            .from("propiedades")
            .select(`*, ciudad:ciudad_id(nombre), sector:sector_id(nombre)`)
            .eq("id", propiedad_id)
            .eq("tenant_id", tenant.id)
            .eq("estado", "disponible")
            .is("deleted_at", null)
            .single()

        if (!prop) return "Esta propiedad ya no esta disponible."

        await supabase
            .from("propiedades")
            .update({ total_consultas: (prop.total_consultas || 0) + 1 })
            .eq("id", propiedad_id)

        const ciudadNombre = (prop.ciudad as any)?.nombre || ""
        const sectorNombre = (prop.sector as any)?.nombre || ""

        const fotos = prop.fotos as any[]
        if (fotos?.length > 0) {
            const url = typeof fotos[0] === "string" ? fotos[0] : fotos[0]?.url
            if (url) await sendWhatsAppImage(phoneNumberId, cliente.celular, url, prop.nombre).catch(() => { })
        }

        return {
            tipo: "buttons",
            payload: {
                header: prop.nombre.slice(0, 60),
                body: formatearDetallePropiedad(prop),
                buttons: [
                    { id: `reservar_prop_${propiedad_id}`, title: "Reservar visita" },
                    { id: `ver_web_prop_${propiedad_id}`, title: "Ver en web" },
                    { id: "menu_principal", title: "Ver mas opciones" },
                ],
                footer: [sectorNombre, ciudadNombre].filter(Boolean).join(", ")
            }
        }
    }

    if (tipo === "proyecto" && proyecto_id) {
        const { data: proy } = await supabase
            .from("proyectos")
            .select(`*, ciudad:ciudad_id(nombre), sector:sector_id(nombre)`)
            .eq("id", proyecto_id)
            .eq("tenant_id", tenant.id)
            .eq("estado", "activo")
            .is("deleted_at", null)
            .single()

        if (!proy) return "Este proyecto ya no esta disponible."

        await supabase
            .from("proyectos")
            .update({ total_consultas: (proy.total_consultas || 0) + 1 })
            .eq("id", proyecto_id)

        const ciudadNombre = (proy.ciudad as any)?.nombre || ""

        const fotos = proy.fotos as any[]
        if (fotos?.length > 0) {
            const url = typeof fotos[0] === "string" ? fotos[0] : fotos[0]?.url
            if (url) await sendWhatsAppImage(phoneNumberId, cliente.celular, url, proy.nombre).catch(() => { })
        }

        return {
            tipo: "buttons",
            payload: {
                header: proy.nombre.slice(0, 60),
                body: formatearDetalleProyecto(proy),
                buttons: [
                    { id: `ver_unidades_${proyecto_id}`, title: "Ver unidades" },
                    { id: `reservar_proy_${proyecto_id}`, title: "Reservar visita" },
                    { id: `ver_web_proy_${proyecto_id}`, title: "Ver en web" },
                ],
                footer: ciudadNombre
            }
        }
    }

    return null
}

// =========================
// BUSCAR Y MOSTRAR
// =========================
async function buscarYMostrar(
    params: any,
    session: any,
    tenant: any,
    config: any
): Promise<Respuesta> {
    const tenantId = tenant.id
    let ciudadId: number | null = null
    let sectorId: number | null = null

    if (params.ciudad) {
        const { data: c } = await supabase
            .from("ciudades")
            .select("id")
            .ilike("nombre", `%${params.ciudad}%`)
            .maybeSingle()
        ciudadId = c?.id || null
        console.log("[Búsqueda] ciudad:", params.ciudad, "→ id:", ciudadId)
    }

    if (params.sector && ciudadId) {
        const { data: s } = await supabase
            .from("sectores")
            .select("id")
            .eq("ciudad_id", ciudadId)
            .ilike("nombre", `%${params.sector}%`)
            .maybeSingle()
        sectorId = s?.id || null
        console.log("[Búsqueda] sector:", params.sector, "→ id:", sectorId)
    }
    const { data: propiedades } = await supabase.rpc("buscar_propiedades", {
        p_tenant_id: tenantId,
        p_tipo_propiedad: params.tipo_propiedad || null,
        p_tipo_operacion: params.tipo_operacion || null,
        p_ciudad_id: ciudadId,        // ← ID resuelto
        p_sector_id: sectorId,        // ← ID resuelto
        p_precio_min: params.precio_min || null,
        p_precio_max: params.precio_max || null,
        p_habitaciones: params.habitaciones_min || null,
        p_banos: params.banos_min || null,
        p_m2_min: params.m2_min || null,
        p_m2_max: null,
        p_patio: null,
        p_jardin: params.con_jardin || null,
        p_piscina: params.con_piscina || null,
        p_estacionamientos: params.con_estacionamiento ? 1 : null,
        p_ascensor: params.ascensor || null,
        p_amoblado: params.amoblado || null,
        p_limite: 20
    })

    let queryProyectos = supabase
        .from("proyectos")
        .select(`id, nombre, precio_desde, precio_hasta, tipo_pago, ciudad:ciudad_id(nombre), sector:sector_id(nombre)`)
        .eq("tenant_id", tenantId)
        .eq("estado", "activo")
        .is("deleted_at", null)

    if (params.ciudad) {
        const { data: ciudad } = await supabase
            .from("ciudades")
            .select("id")
            .ilike("nombre", `%${params.ciudad}%`)
            .single()
        if (ciudad) queryProyectos = queryProyectos.eq("ciudad_id", ciudad.id)
    }
    if (params.precio_max) queryProyectos = queryProyectos.lte("precio_desde", params.precio_max)
    if (params.tipo_pago === "biess") queryProyectos = queryProyectos.contains("tipo_pago", ["biess"])

    const { data: proyectos } = await queryProyectos.limit(3)

    let propsFallback: any[] = []
    let esFallback = false

    if (!propiedades?.length && !proyectos?.length) {
        esFallback = true
        const { data: fallback } = await supabase.rpc("buscar_propiedades", {
            p_tenant_id: tenantId,
            p_tipo_propiedad: params.tipo_propiedad || null,
            p_tipo_operacion: params.tipo_operacion || null,
            p_ciudad_id: ciudadId,        // ← ID resuelto
            p_sector_id: sectorId,        // ← ID resuelto
            p_precio_min: null, p_precio_max: null,
            p_habitaciones: null, p_banos: null,
            p_m2_min: null, p_m2_max: null,
            p_patio: null, p_jardin: null, p_piscina: null,
            p_estacionamientos: null, p_ascensor: null, p_amoblado: null,
            p_limite: 20,
        })
        propsFallback = fallback || []
    }

    const propsAMostrar = propiedades?.length ? propiedades : propsFallback
    const totalResultados = propsAMostrar.length + (proyectos?.length || 0)

    if (totalResultados === 0) {
        await updateSession(session.id, { step: "sin_resultados", params_busqueda: params })
        return {
            tipo: "buttons",
            payload: {
                body: `No encontre propiedades en ${params.ciudad || "esa zona"} para ${params.tipo_operacion === "alquiler" ? "arrendar" : "comprar"}.`,
                buttons: [
                    { id: "buscar_nuevo", title: "Buscar diferente" },
                    { id: "hablar_agente", title: "Hablar con asesor" },
                    { id: "btn_menu", title: "Menu principal" },
                ]
            }
        }
    }

    await updateSession(session.id, {
        step: "mostrar_resultados",
        params_busqueda: params,
        propiedades_ids: propsAMostrar.map((p: any) => p.id),
        pagina: 0,
        es_fallback: esFallback,
        propiedad_id: null,
        proyecto_id: null,
        horarios_ids: null,
    })

    const resumen = [
        params.tipo_propiedad,
        params.tipo_operacion === "alquiler" ? "en arriendo" : params.tipo_operacion === "venta" ? "en venta" : null,
        params.ciudad ? `en ${params.ciudad}` : null,
        params.sector ? `sector ${params.sector}` : null,
        params.habitaciones_min ? `${params.habitaciones_min}+ hab` : null,
        params.precio_max ? `hasta $${Number(params.precio_max).toLocaleString("es-EC")}` : null,
        params.con_estacionamiento ? "con garaje" : null,
        params.tipo_pago === "biess" ? "BIESS" : null,
    ].filter(Boolean).join(" · ")

    const encabezado = esFallback
        ? `No encontre con esas caracteristicas exactas. Te muestro opciones similares en ${params.ciudad}:`
        : `${totalResultados} resultado(s) — ${resumen}:`

    const POR_PAGINA = 5
    const pagina0 = propsAMostrar.slice(0, POR_PAGINA)

    const rowsProps = pagina0.map((p: any) => rowPropiedad(
        p.nombre,
        p.ciudad_nombre || params.ciudad || "",
        p.sector_nombre || "",
        `$${Number(p.precio).toLocaleString("es-EC")}${params.tipo_operacion === "alquiler" ? "/mes" : ""}`,
        `prop_${p.id}`
    ))

    const rowsProyectos = (proyectos || []).slice(0, 2).map((p: any) => ({
        id: `proyecto_${p.id}`,
        title: `🏗 ${p.nombre?.slice(0, 20) || "Proyecto"}`,
        description: `${(p.ciudad as any)?.nombre || ""} · Desde $${Number(p.precio_desde).toLocaleString("es-EC")}`
    }))

    const sections: any[] = []
    if (rowsProps.length > 0) sections.push({ title: "Propiedades", rows: rowsProps })
    if (rowsProyectos.length > 0) sections.push({ title: "Proyectos", rows: rowsProyectos })

    if (propsAMostrar.length > POR_PAGINA) {
        sections[sections.length - 1].rows.push({
            id: "pagina_siguiente",
            title: "Ver mas →",
            description: `${propsAMostrar.length - POR_PAGINA} resultado(s) mas`
        })
    }

    return {
        tipo: "list",
        payload: {
            header: `Resultados (${totalResultados})`,
            body: encabezado,
            buttonText: "Ver opciones",
            sections
        }
    }
}

// =========================
// HANDLE MESSAGE
// =========================
export async function handleMessage({
    tenant, cliente, session, message,
    textoMensaje, buttonId, phoneNumberId, from, config,
}: any): Promise<Respuesta | null> {

    const text = (textoMensaje || "").toLowerCase().trim()
    const btnId = buttonId || ""
    let state = session.contenido || {}

    console.log("[Chatbot] step:", state.step, "btnId:", btnId, "text:", text)

    // ── COMANDOS GLOBALES ──
    if (text === "agente" || text === "hablar con agente" || text === "humano" || btnId === "hablar_agente") {
        await activarModoManual(session, tenant, cliente)
        const tiempoManual = config?.tiempo_manual_min ?? 15
        return `Un agente te atendera en breve. ⏳\n\nEn ${tiempoManual} minutos el asistente se reactivara automaticamente.`
    }

    if (text === "bot" || text === "menu" || btnId === "menu_principal" || btnId === "btn_menu") {
        await updateSession(session.id, { step: "menu_principal" })
        return await menuPrincipal(tenant, cliente, config)
    }

    if (text === "citas" || text === "mis citas" || btnId === "btn_citas") {
        return await listarCitasCliente(cliente.id, tenant.id)
    }

    if (btnId === "buscar_nuevo" || text === "buscar diferente" || text === "nueva busqueda") {
        await updateSession(session.id, { step: "busqueda_texto", params_busqueda: {} })
        return "Que estas buscando?\n\nDescribelo directamente:\n\nEj: casa grande en Guayaquil para comprar\nEj: depa en Quito hasta 800 dolares\nEj: terreno en Samborondon con BIESS"
    }

    // ── DETALLE LINK ──
    if (state.step === "detalle_link") {
        if (btnId.startsWith("reservar_prop_")) {
            const propId = parseInt(btnId.replace("reservar_prop_", ""))
            if (!cliente.verificado) {
                await updateSession(session.id, { step: "solicitar_cedula", propiedad_id: propId })
                return solicitarCedula()
            }
            return await mostrarHorariosPropiedad(propId, config?.dias_max_cita ?? 7, session.id, state)
        }
        if (btnId.startsWith("reservar_proy_")) {
            const proyId = parseInt(btnId.replace("reservar_proy_", ""))
            if (!cliente.verificado) {
                await updateSession(session.id, { step: "solicitar_cedula", proyecto_id: proyId })
                return solicitarCedula()
            }
            return await mostrarHorariosProyecto(proyId, config?.dias_max_cita ?? 7, session.id, state)
        }
        if (btnId.startsWith("ver_unidades_")) {
            const proyId = parseInt(btnId.replace("ver_unidades_", ""))
            await updateSession(session.id, { step: "ver_unidades_proyecto", proyecto_id: proyId })
            return await listarUnidadesProyecto(proyId)
        }
        if (btnId.startsWith("ver_web_")) {
            const slug = btnId.replace("ver_web_prop_", "propiedad-").replace("ver_web_proy_", "proyecto-")
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
            return `Ver detalles, fotos y ubicacion:\n${appUrl}/p/${slug}`
        }
    }

    // ── INICIO ──
    if (!state.step || state.step === "inicio") {
        if (text.length > 3) {
            const rawParams = await extraerParametros(text)
            const params = await validarYEnriquecerParametros(rawParams, tenant.id)

            const tieneParametros = params.tipo_propiedad || params.tipo_operacion ||
                params.ciudad || params.sector || params.habitaciones_min ||
                params.precio_max || params.precio_min || params.con_estacionamiento ||
                params.tipo_pago || params.con_piscina || params.con_jardin ||
                params.conjunto_cerrado || params.nueva_construccion || params.amoblado

            if (tieneParametros && params.confianza >= 0.3) {
                const faltantes = parametrosFaltantes(params)

                if (faltantes.length === 0) {
                    await updateSession(session.id, { step: "busqueda_texto", params_busqueda: params })
                    return await confirmarYBuscar(params, session, tenant, cliente, config, phoneNumberId, from)
                } else {
                    // Si hay ambigüedad — resolver antes de preguntar por faltantes
                    if ((params as any).ambiguo) {
                        await updateSession(session.id, {
                            step: "confirmar_busqueda",
                            params_busqueda: params,
                            ambiguo_ciudades: (params as any).ambiguo.ciudades
                        })
                        return await construirPreguntaCiudadAmbigua(
                            (params as any).ambiguo.sector,
                            (params as any).ambiguo.ciudades
                        )
                    }
                    await updateSession(session.id, {
                        step: "recolectando_params",
                        params_busqueda: params,
                        params_pendientes: faltantes,
                        param_preguntando: faltantes[0]
                    })
                    return preguntarParametro(faltantes[0], params)
                }
            }
        }

        await updateSession(session.id, { step: "menu_principal" })
        return await menuPrincipal(tenant, cliente, config)
    }

    // ── MENU PRINCIPAL ──
    if (state.step === "menu_principal" || btnId === "menu_principal") {
        if (state.step !== "menu_principal") {
            await updateSession(session.id, { step: "menu_principal" })
            state = { step: "menu_principal" }
        }

        if (btnId === "btn_propiedades" || text === "1" || text.includes("propiedad")) {
            await updateSession(session.id, { step: "busqueda_texto", params_busqueda: {} })
            return "Que estas buscando?\n\nDescribelo directamente:\n\nEj: casa grande en Guayaquil para comprar\nEj: depa en Quito hasta 800 dolares\nEj: terreno con BIESS en Samborondon"
        }
        if (btnId === "btn_proyectos" || text === "2" || text.includes("proyecto")) {
            await updateSession(session.id, { step: "ver_proyectos" })
            return await listarProyectos(tenant.id)
        }
        if (btnId === "btn_asesor" || text === "4" || text.includes("asesor")) {
            await activarModoManual(session, tenant, cliente)
            const tiempoManual = config?.tiempo_manual_min ?? 15
            return `Un agente te atendera en breve. ⏳\n\nEn ${tiempoManual} minutos el asistente se reactivara automaticamente.`
        }

        // Texto libre en menú — intentar NLP
        if (text.length > 3) {
            const rawParams = await extraerParametros(text)
            const params = await validarYEnriquecerParametros(rawParams, tenant.id)
            const tieneParametros = params.tipo_propiedad || params.ciudad || params.tipo_operacion ||
                params.sector || params.habitaciones_min

            if (tieneParametros && params.confianza >= 0.3) {
                const faltantes = parametrosFaltantes(params)
                if (faltantes.length === 0) {
                    await updateSession(session.id, { step: "busqueda_texto", params_busqueda: params })
                    return await confirmarYBuscar(params, session, tenant, cliente, config, phoneNumberId, from)
                } else {
                    if ((params as any).ambiguo) {
                        await updateSession(session.id, {
                            step: "confirmar_busqueda",
                            params_busqueda: params,
                            ambiguo_ciudades: (params as any).ambiguo.ciudades
                        })
                        return await construirPreguntaCiudadAmbigua(
                            (params as any).ambiguo.sector,
                            (params as any).ambiguo.ciudades
                        )
                    }
                    await updateSession(session.id, {
                        step: "recolectando_params",
                        params_busqueda: params,
                        params_pendientes: faltantes,
                        param_preguntando: faltantes[0]
                    })
                    return preguntarParametro(faltantes[0], params)
                }
            }
        }

        return await menuPrincipal(tenant, cliente, config)
    }

    // ── CONFIRMAR BUSQUEDA — resolver ambigüedad de ciudad ──
    if (state.step === "confirmar_busqueda") {
        if (btnId.startsWith("ciudad_confirm_")) {
            const ciudadId = parseInt(btnId.replace("ciudad_confirm_", ""))
            const { data: ciudadDB } = await supabase
                .from("ciudades").select("nombre").eq("id", ciudadId).single()

            if (ciudadDB) {
                const newParams = { ...state.params_busqueda, ciudad: ciudadDB.nombre }
                await updateSession(session.id, { step: "busqueda_texto", params_busqueda: newParams })
                return await confirmarYBuscar(newParams, session, tenant, cliente, config, phoneNumberId, from)
            }
        }

        if (text) {
            const resultado = await interpretarTextoLibre(text, "ciudad", tenant.id)
            if (resultado.ambiguo) {
                return await construirPreguntaCiudadAmbigua(resultado.ambiguo.sector, resultado.ambiguo.ciudades)
            }
            if (resultado.valor) {
                const newParams = { ...state.params_busqueda, ciudad: resultado.valor, sector: resultado.sector }
                await updateSession(session.id, { step: "busqueda_texto", params_busqueda: newParams })
                return await confirmarYBuscar(newParams, session, tenant, cliente, config, phoneNumberId, from)
            }
        }

        return await construirPreguntaCiudadAmbigua(
            state.params_busqueda?.sector || "ese sector",
            state.ambiguo_ciudades || []
        )
    }

    // ── BUSQUEDA POR TEXTO ──
    if (state.step === "busqueda_texto") {
        const rawParams = await extraerParametros(text)
        const params = await validarYEnriquecerParametros(rawParams, tenant.id)

        const acumulado = { ...state.params_busqueda }
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && k !== "confianza") {
                (acumulado as any)[k] = v
            }
        })

        // Manejar ambigüedad
        if ((params as any).ambiguo && !acumulado.ciudad) {
            await updateSession(session.id, {
                step: "confirmar_busqueda",
                params_busqueda: acumulado,
                ambiguo_ciudades: (params as any).ambiguo.ciudades
            })
            return await construirPreguntaCiudadAmbigua(
                (params as any).ambiguo.sector,
                (params as any).ambiguo.ciudades
            )
        }

        const faltantes = parametrosFaltantes(acumulado)

        if (faltantes.length > 0) {
            await updateSession(session.id, {
                ...state,
                step: "recolectando_params",
                params_busqueda: acumulado,
                params_pendientes: faltantes,
                param_preguntando: faltantes[0]
            })
            return preguntarParametro(faltantes[0], acumulado)
        }

        return await confirmarYBuscar(acumulado, session, tenant, cliente, config, phoneNumberId, from)
    }

    // ── RECOLECTANDO PARÁMETROS ──
    if (state.step === "recolectando_params") {
        const paramActual = state.param_preguntando
        const acumulado = { ...state.params_busqueda }

        if (btnId === "op_comprar") {
            acumulado.tipo_operacion = "venta"
        } else if (btnId === "op_arrendar") {
            acumulado.tipo_operacion = "alquiler"
        } else if (btnId.startsWith("tipo_")) {
            acumulado.tipo_propiedad = btnId.replace("tipo_", "")
        } else if (btnId.startsWith("ciudad_confirm_")) {
            const ciudadId = parseInt(btnId.replace("ciudad_confirm_", ""))
            const { data: c } = await supabase.from("ciudades").select("nombre").eq("id", ciudadId).single()
            if (c) acumulado.ciudad = c.nombre
        } else {
            const resultado = await interpretarTextoLibre(text, paramActual, tenant.id, acumulado)

            if (resultado.ambiguo) {
                await updateSession(session.id, {
                    step: "confirmar_busqueda",
                    params_busqueda: { ...acumulado, sector: resultado.ambiguo.sector },
                    ambiguo_ciudades: resultado.ambiguo.ciudades
                })
                return await construirPreguntaCiudadAmbigua(
                    resultado.ambiguo.sector,
                    resultado.ambiguo.ciudades
                )
            }

            if (resultado.valor) {
                acumulado[paramActual] = resultado.valor
                if (resultado.sector) acumulado.sector = resultado.sector
                if (resultado.ciudad && paramActual === "ciudad") acumulado.ciudad = resultado.ciudad
            } else {
                // ── FIX 2 — respuesta específica según parámetro y contexto ──
                if (paramActual === "tipo_propiedad") return await listaTipoPropiedad()

                if (paramActual === "tipo_operacion") {
                    await updateSession(session.id, { ...state, params_busqueda: acumulado })
                    return {
                        tipo: "buttons",
                        payload: {
                            body: "Buscas comprar o arrendar?",
                            buttons: [
                                { id: "op_comprar", title: "Comprar" },
                                { id: "op_arrendar", title: "Arrendar" },
                            ]
                        }
                    }
                }

                if (paramActual === "ciudad") {
                    // Saber si el texto era un lugar desconocido o simplemente no se entendió
                    const lugarEscrito = text.trim()
                    await updateSession(session.id, { ...state, params_busqueda: acumulado })
                    return `No encontré "${lugarEscrito}" como ciudad ni sector en Ecuador.\n\nEscribe la ciudad donde buscas:\n\nEj: Guayaquil, Quito, Cuenca, Samborondón, Manta`
                }

                await updateSession(session.id, { ...state, params_busqueda: acumulado })
                return `No entendi. Puedes ser más específico?`
            }

            // Aprovechar otros params del NLP
            try {
                const extraParams = await extraerParametros(text)
                Object.entries(extraParams).forEach(([k, v]) => {
                    if (v !== undefined && k !== "confianza" && !(k in acumulado)) {
                        (acumulado as any)[k] = v
                    }
                })
            } catch { }
        }

        const pendientes = parametrosFaltantes(acumulado)
        const siguienteFaltante = pendientes[0]

        if (siguienteFaltante) {
            await updateSession(session.id, {
                ...state,
                params_busqueda: acumulado,
                params_pendientes: pendientes,
                param_preguntando: siguienteFaltante
            })
            return preguntarParametro(siguienteFaltante, acumulado)
        }

        return await confirmarYBuscar(acumulado, session, tenant, cliente, config, phoneNumberId, from)
    }

    // ── FILTRO TIPO (legacy) ──
    if (state.step === "filtro_tipo") {
        const tipo = resolverTipo(btnId || text)
        if (!tipo) return await listaTipoPropiedad()
        await updateSession(session.id, { ...state, step: "filtro_operacion", tipo })
        return {
            tipo: "buttons",
            payload: {
                body: `${tipo.charAt(0).toUpperCase() + tipo.slice(1)}\n\nPara que operacion buscas?`,
                buttons: [
                    { id: "op_venta", title: "Comprar" },
                    { id: "op_alquiler", title: "Alquilar" },
                ]
            }
        }
    }

    // ── FILTRO OPERACION ──
    if (state.step === "filtro_operacion") {
        const operacion = btnId === "op_venta" ? "venta"
            : btnId === "op_alquiler" ? "alquiler"
                : text.includes("comprar") || text.includes("venta") ? "venta"
                    : text.includes("alquil") || text.includes("arrend") ? "alquiler"
                        : null

        if (!operacion) {
            return {
                tipo: "buttons",
                payload: {
                    body: "Para que operacion buscas?",
                    buttons: [
                        { id: "op_venta", title: "Comprar" },
                        { id: "op_alquiler", title: "Alquilar" },
                    ]
                }
            }
        }

        await updateSession(session.id, { ...state, step: "filtro_ciudad", operacion })
        return await listaCiudades(tenant.id, operacion, state.tipo)
    }

    // ── FILTRO CIUDAD ──
    if (state.step === "filtro_ciudad") {
        if (btnId === "ciudad_otra") {
            await updateSession(session.id, { ...state, step: "filtro_ciudad_texto" })
            return "Escribe el nombre de la ciudad que buscas:"
        }

        let ciudadId: number | null = null
        let ciudadNombre = ""

        if (btnId.startsWith("ciudad_")) {
            ciudadId = parseInt(btnId.replace("ciudad_", ""))
            const { data: c } = await supabase.from("ciudades").select("nombre").eq("id", ciudadId).single()
            ciudadNombre = c?.nombre || ""
        } else if (text) {
            const resultado = await interpretarTextoLibre(text, "ciudad", tenant.id, {
                tipo_operacion: state.operacion,
                tipo_propiedad: state.tipo
            })

            if (resultado.ambiguo) {
                await updateSession(session.id, {
                    ...state,
                    step: "confirmar_busqueda",
                    params_busqueda: state,
                    ambiguo_ciudades: resultado.ambiguo.ciudades
                })
                return await construirPreguntaCiudadAmbigua(resultado.ambiguo.sector, resultado.ambiguo.ciudades)
            }

            if (resultado.ciudad) {
                const { data: c } = await supabase
                    .from("ciudades").select("id, nombre").ilike("nombre", resultado.ciudad).single()
                if (c) { ciudadId = c.id; ciudadNombre = c.nombre }
            }
        }

        if (!ciudadId) return "No encontre esa ciudad o sector. Escribe el nombre completo:"

        await updateSession(session.id, { ...state, step: "filtro_sector", ciudad_id: ciudadId, ciudad_nombre: ciudadNombre })
        return await listaSectores(ciudadId, ciudadNombre)
    }

    // ── FILTRO CIUDAD TEXTO ──
    if (state.step === "filtro_ciudad_texto") {
        const resultado = await interpretarTextoLibre(text, "ciudad", tenant.id, {
            tipo_operacion: state.operacion,
            tipo_propiedad: state.tipo
        })

        if (resultado.ambiguo) {
            await updateSession(session.id, {
                ...state,
                step: "confirmar_busqueda",
                ambiguo_ciudades: resultado.ambiguo.ciudades
            })
            return await construirPreguntaCiudadAmbigua(resultado.ambiguo.sector, resultado.ambiguo.ciudades)
        }

        if (resultado.ciudad) {
            const { data: c } = await supabase
                .from("ciudades").select("id, nombre").ilike("nombre", resultado.ciudad).single()
            if (c) {
                await updateSession(session.id, { ...state, step: "filtro_sector", ciudad_id: c.id, ciudad_nombre: c.nombre })
                return await listaSectores(c.id, c.nombre)
            }
        }

        return "No encontre esa ciudad. Intenta de nuevo:"
    }

    // ── FILTRO SECTOR ──
    if (state.step === "filtro_sector") {
        let sectorId: number | null = null
        let sectorNombre = "todos los sectores"

        if (btnId === "sector_todos") {
            sectorId = null
        } else if (btnId.startsWith("sector_")) {
            sectorId = parseInt(btnId.replace("sector_", ""))
            const { data: s } = await supabase.from("sectores").select("nombre").eq("id", sectorId).single()
            sectorNombre = s?.nombre || ""
        } else if (text) {
            const resultado = await interpretarTextoLibre(text, "sector", tenant.id, {
                ciudad_id: state.ciudad_id
            })
            if (resultado.sector) {
                const { data: s } = await supabase
                    .from("sectores")
                    .select("id, nombre")
                    .eq("ciudad_id", state.ciudad_id)
                    .ilike("nombre", `%${resultado.sector}%`)
                    .limit(1).maybeSingle()
                if (s) { sectorId = s.id; sectorNombre = s.nombre }
            }
        }

        const params = {
            tenantId: tenant.id,
            tipo_operacion: state.operacion || undefined,
            tipo_propiedad: state.tipo || undefined,
            ciudad_id: state.ciudad_id || undefined,
            sector_id: sectorId || undefined,
        }

        const resultados = await buscarPropiedades(params)
        return await formatearResultados(resultados, session.id, {
            ...state, sector_id: sectorId, sector_nombre: sectorNombre
        })
    }

    // ── MOSTRAR RESULTADOS ──
    if (state.step === "mostrar_resultados") {
        if (btnId === "btn_volver" || btnId === "btn_menu" || text === "0") {
            await updateSession(session.id, { step: "menu_principal" })
            return await menuPrincipal(tenant, cliente, config)
        }

        if (btnId === "pagina_siguiente") {
            const pagina = (state.pagina || 0) + 1
            const params = {
                tenantId: tenant.id,
                tipo_operacion: state.params_busqueda?.tipo_operacion,
                tipo_propiedad: state.params_busqueda?.tipo_propiedad,
                ciudad_id: state.ciudad_id,
                sector_id: state.sector_id,
            }
            const resultados = await buscarPropiedades(params)
            return await formatearResultados(resultados, session.id, { ...state, pagina })
        }

        if (btnId.startsWith("proyecto_")) {
            const proyId = parseInt(btnId.replace("proyecto_", ""))
            return await mostrarDetalleProyecto(proyId, session, state, tenant, phoneNumberId, from)
        }

        let propiedadId: number | null = null
        if (btnId.startsWith("prop_")) {
            propiedadId = parseInt(btnId.replace("prop_", ""))
        } else {
            const num = parseInt(text)
            if (!isNaN(num) && state.propiedades_ids?.[num - 1]) {
                propiedadId = state.propiedades_ids[num - 1]
            }
        }
        if (propiedadId) {
            return await mostrarDetallePropiedad(propiedadId, session, state, tenant, phoneNumberId, from)
        }

        //if (propiedadId) return await mostrarDetallePropiedad(propiedadId, session, state, tenant, phoneNumberId, from)
        //return "Selecciona una propiedad de la lista."

        // ── NUEVO — texto libre en resultados → NLP interpreta ──
        if (text.length > 2) {
            const rawParams = await extraerParametros(text)
            const params = await validarYEnriquecerParametros(rawParams, tenant.id)

            const tieneParametros = params.tipo_propiedad || params.tipo_operacion ||
                params.ciudad || params.sector || params.habitaciones_min ||
                params.precio_max || params.precio_min

            if (tieneParametros && params.confianza >= 0.3) {
                // Acumular sobre búsqueda actual — mantener ciudad/operación si no cambió
                const acumulado = {
                    ...state.params_busqueda,
                    ...Object.fromEntries(
                        Object.entries(params).filter(([k, v]) => v !== undefined && k !== "confianza")
                    )
                }

                const faltantes = parametrosFaltantes(acumulado)

                if (faltantes.length === 0) {
                    await updateSession(session.id, { step: "busqueda_texto", params_busqueda: acumulado })
                    return await confirmarYBuscar(acumulado, session, tenant, cliente, config, phoneNumberId, from)
                } else {
                    await updateSession(session.id, {
                        step: "recolectando_params",
                        params_busqueda: acumulado,
                        params_pendientes: faltantes,
                        param_preguntando: faltantes[0]
                    })
                    return preguntarParametro(faltantes[0], acumulado)
                }
            }
        }
        return "Selecciona una propiedad de la lista, o describe lo que buscas."

    }

    // ── DETALLE PROPIEDAD ──
    if (state.step === "detalle_propiedad") {
        if (btnId.startsWith("reservar_prop_") || text.includes("reservar") || text === "1") {
            const propId = state.propiedad_id
            if (!cliente.verificado) {
                await updateSession(session.id, { ...state, step: "solicitar_cedula" })
                return solicitarCedula()
            }
            return await mostrarHorariosPropiedad(propId, config?.dias_max_cita ?? 7, session.id, state)
        }
        if (btnId === "btn_volver" || text === "0") {
            await updateSession(session.id, { ...state, step: "mostrar_resultados" })
            return "Que otra propiedad te interesa?"
        }
    }

    // ── VER PROYECTOS ──
    if (state.step === "ver_proyectos") {
        let proyId: number | null = null
        if (btnId.startsWith("proy_")) {
            proyId = parseInt(btnId.replace("proy_", ""))
        } else {
            const num = parseInt(text)
            if (!isNaN(num) && state.proyectos_ids?.[num - 1]) proyId = state.proyectos_ids[num - 1]
        }
        if (proyId) return await mostrarDetalleProyecto(proyId, session, state, tenant, phoneNumberId, from)
        return await listarProyectos(tenant.id)
    }

    // ── DETALLE PROYECTO ──
    if (state.step === "detalle_proyecto") {
        if (btnId.startsWith("ver_unidades_")) {
            const proyId = parseInt(btnId.replace("ver_unidades_", ""))
            await updateSession(session.id, { ...state, step: "ver_unidades_proyecto", proyecto_id: proyId })
            return await listarUnidadesProyecto(proyId)
        }
        if (btnId.startsWith("reservar_proy_")) {
            const proyId = parseInt(btnId.replace("reservar_proy_", ""))
            if (!cliente.verificado) {
                await updateSession(session.id, { step: "solicitar_cedula", proyecto_id: proyId })
                return solicitarCedula()
            }
            return await mostrarHorariosProyecto(proyId, config?.dias_max_cita ?? 7, session.id, state)
        }
        if (btnId === "btn_volver" || text === "0") {
            await updateSession(session.id, { step: "ver_proyectos" })
            return await listarProyectos(tenant.id)
        }
    }

    // ── VER UNIDADES PROYECTO ──
    if (state.step === "ver_unidades_proyecto") {
        if (btnId.startsWith("prop_")) {
            const propiedadId = parseInt(btnId.replace("prop_", ""))
            return await mostrarDetallePropiedad(propiedadId, session, state, tenant, phoneNumberId, from)
        }
        if (btnId === "btn_volver" || text === "0") {
            return await mostrarDetalleProyecto(state.proyecto_id, session, state, tenant, phoneNumberId, from)
        }
        return await listarUnidadesProyecto(state.proyecto_id)
    }

    // ── SOLICITAR FECHA VISITA LIBRE ──
    if (state.step === "solicitar_fecha_visita") {
        const intentos = (state.intentos_fecha || 0) + 1
        const maxIntentos = 3
        const fechaRef = new Date().toISOString().split("T")[0]
        const { fecha, hora } = await extraerFechaHora(text, fechaRef)

        if (!fecha && !hora) {
            if (intentos >= maxIntentos) {
                await activarModoManual(session, tenant, cliente)
                return "No pude entender la fecha. Un agente te contactara para coordinar la visita. ⏳"
            }
            await updateSession(session.id, { ...state, intentos_fecha: intentos })
            return `No entendi la fecha. Intentalo de nuevo (${intentos}/${maxIntentos}):\n\nEj: manana a las 3pm\nEj: el viernes a las 10am\nEj: 25 de abril en la tarde`
        }

        if (fecha) {
            const fechaVisita = new Date(fecha)
            const hoy = new Date()
            hoy.setHours(0, 0, 0, 0)
            if (fechaVisita < hoy) {
                await updateSession(session.id, { ...state, intentos_fecha: intentos })
                return "Esa fecha ya paso. Indica una fecha futura:"
            }
        }

        const fechaFinal = fecha || new Date(Date.now() + 86400000).toISOString().split("T")[0]
        const horaFinal = hora || "10:00"
        const fechaISO = `${fechaFinal}T${horaFinal}:00`

        const reservaData: any = {
            tenant_id: tenant.id,
            cliente_id: cliente.id,
            fecha: fechaISO,
            estado: "pendiente",
            notas: `Solicitud libre: "${text}". Pendiente confirmacion.`
        }
        if (state.propiedad_id) reservaData.propiedad_id = state.propiedad_id
        if (state.proyecto_id) reservaData.proyecto_id = state.proyecto_id

        await supabase.from("reservas").insert(reservaData)

        const fechaFormato = new Date(fechaISO).toLocaleDateString("es-EC", {
            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
        })

        await supabase.from("notificaciones").insert({
            tenant_id: tenant.id,
            cliente_id: cliente.id,
            sesion_id: session.id,
            tipo: "cita_nueva",
            mensaje: `${cliente.celular} solicito visita para ${fechaFormato} — pendiente confirmacion`
        })

        await updateSession(session.id, { step: "menu_principal" })

        const nombre = cliente.nombres_completos !== "Cliente WhatsApp"
            ? cliente.nombres_completos : "estimad@ cliente"

        return `Solicitud recibida. ✅\n\nFecha solicitada: ${fechaFormato}\n\nUn agente confirmara tu cita en breve, ${nombre}.\n\nEscribe 'citas' para ver el estado.`
    }

    // ── AGENDAMIENTO ──
    if (state.step === "agendar_propiedad" || state.step === "agendar_proyecto") {
        let horarioId: number | null = null

        if (btnId.startsWith("horario_")) {
            horarioId = parseInt(btnId.replace("horario_", ""))
        } else {
            const num = parseInt(text)
            if (!isNaN(num) && state.horarios_ids?.[num - 1]) horarioId = state.horarios_ids[num - 1]
        }

        if (!horarioId) {
            return state.step === "agendar_propiedad"
                ? await mostrarHorariosPropiedad(state.propiedad_id, config?.dias_max_cita ?? 7, session.id, state)
                : await mostrarHorariosProyecto(state.proyecto_id, config?.dias_max_cita ?? 7, session.id, state)
        }

        const { data: horario } = await supabase
            .from("horarios_disponibles")
            .select("*")
            .eq("id", horarioId)
            .eq("disponible", true)
            .single()

        if (!horario) return "Ese horario ya no esta disponible. Elige otro:"

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
                mensaje: `Nueva cita de ${cliente.celular} para ${horario.fecha} a las ${horario.hora_inicio}`,
            })
        ])

        const fechaFormato = new Date(`${horario.fecha}T${horario.hora_inicio}`).toLocaleDateString("es-EC", {
            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
        })

        await updateSession(session.id, { step: "menu_principal" })

        const nombre = cliente.nombres_completos !== "Cliente WhatsApp"
            ? cliente.nombres_completos : "estimad@ cliente"

        return `Cita confirmada. ✅\n\nFecha: ${fechaFormato}\n\nTe esperamos, ${nombre}.\nSi necesitas cambiar tu cita escribe 'citas' o 'agente'.`
    }

    // ── VERIFICACION CEDULA ──
    if (state.step === "solicitar_cedula") {
        const cedula = text.replace(/\D/g, "")
        const intentos = (state.intentos_cedula || 0) + 1
        const maxIntentos = config?.intentos_cedula_max ?? 2

        if (cedula.length !== 10) {
            await updateSession(session.id, { ...state, intentos_cedula: intentos })
            if (intentos >= maxIntentos) {
                await activarModoManual(session, tenant, cliente)
                return "Has superado el numero de intentos. Un agente te contactara. ⏳"
            }
            return `Ingresa los 10 digitos de tu cedula (intento ${intentos}/${maxIntentos}):`
        }

        const resultado = await validarCedulaAPI(cedula)

        if (!resultado.valida) {
            await updateSession(session.id, { ...state, intentos_cedula: intentos })
            if (intentos >= maxIntentos) {
                await activarModoManual(session, tenant, cliente)
                return "Cedula invalida. Has superado el limite. Un agente te contactara. ⏳"
            }
            return `${resultado.error || "Cedula invalida"}. Intento ${intentos}/${maxIntentos}. Intenta de nuevo:`
        }

        const { data: cedulaExistente } = await supabase
            .from("clientes").select("id, celular").eq("ruc_ci", cedula).neq("id", cliente.id).maybeSingle()

        if (cedulaExistente) {
            await supabase.from("clientes").update({ celular_alternativo: from }).eq("id", cedulaExistente.id)
            return "Esta cedula ya esta registrada con otro numero. Tu numero ha sido registrado como contacto alternativo. Un agente te atendera."
        }

        const updateData: any = {
            ruc_ci: cedula,
            verificado: true,
            verificado_at: new Date().toISOString(),
        }
        if (resultado.nombre_completo) updateData.nombres_completos = resultado.nombre_completo

        await supabase.from("clientes").update(updateData).eq("id", cliente.id)

        const saludoMsg = resultado.nombre_completo
            ? `Identidad verificada. Bienvenid@ ${resultado.nombre_completo}.\n\nAhora selecciona el horario:`
            : `Cedula verificada.\n\nAhora selecciona el horario:`

        const paso = state.propiedad_id ? "agendar_propiedad" : "agendar_proyecto"
        const newState = { ...state, step: paso, intentos_cedula: 0 }
        await updateSession(session.id, newState)

        if (phoneNumberId && from) await sendWhatsAppMessage(phoneNumberId, from, saludoMsg)

        if (state.propiedad_id) {
            return await mostrarHorariosPropiedad(state.propiedad_id, config?.dias_max_cita ?? 7, session.id, newState)
        } else {
            return await mostrarHorariosProyecto(state.proyecto_id, config?.dias_max_cita ?? 7, session.id, newState)
        }
    }

    // ── SIN RESULTADOS ──
    if (state.step === "sin_resultados") {
        if (btnId === "buscar_otro_sector" || btnId === "buscar_nuevo" || text === "1") {
            await updateSession(session.id, { step: "busqueda_texto", params_busqueda: {} })
            return "Que estas buscando? Describelo nuevamente:"
        }
        if (btnId === "ver_proyectos" || text === "2") {
            await updateSession(session.id, { step: "ver_proyectos" })
            return await listarProyectos(tenant.id, state.ciudad_id)
        }
        if (btnId === "btn_volver" || btnId === "btn_menu" || text === "0") {
            await updateSession(session.id, { step: "menu_principal" })
            return await menuPrincipal(tenant, cliente, config)
        }
        return {
            tipo: "buttons",
            payload: {
                body: "Que deseas hacer?",
                buttons: [
                    { id: "buscar_nuevo", title: "Cambiar busqueda" },
                    { id: "ver_proyectos", title: "Ver proyectos" },
                    { id: "btn_menu", title: "Menu principal" },
                ]
            }
        }
    }

    // ── FALLBACK ──
    await supabase.from("notificaciones").insert({
        tenant_id: tenant.id,
        cliente_id: cliente.id,
        sesion_id: session.id,
        tipo: "bot_no_entendio",
        mensaje: `No entendio: "${text}"`,
    })

    return {
        tipo: "buttons",
        payload: {
            body: "No entendi tu mensaje.\n\nQue deseas hacer?",
            buttons: [
                { id: "menu_principal", title: "Menu principal" },
                { id: "hablar_agente", title: "Hablar con agente" },
            ]
        }
    }
}

// =========================
// HELPERS
// =========================

async function updateSession(id: number, contenido: any) {
    await supabase
        .from("chat_sesiones")
        .update({ contenido, updated_at: new Date().toISOString() })
        .eq("id", id)
}

async function activarModoManual(session: any, tenant: any, cliente: any) {
    await Promise.all([
        supabase.from("chat_sesiones").update({ modo: "manual" }).eq("id", session.id),
        supabase.from("notificaciones").insert({
            tenant_id: tenant.id,
            cliente_id: cliente.id,
            sesion_id: session.id,
            tipo: "modo_manual",
            mensaje: `${cliente.celular} solicito un agente`,
        })
    ])
}

async function mostrarDetallePropiedad(
    propiedadId: number, session: any, state: any,
    tenant: any, phoneNumberId: string, from: string
): Promise<Respuesta> {
    const { data: prop } = await supabase
        .from("propiedades")
        .select(`*, ciudad:ciudad_id(nombre), sector:sector_id(nombre)`)
        .eq("id", propiedadId)
        .eq("tenant_id", tenant.id)
        .single()

    if (!prop) return "Propiedad no encontrada."

    await Promise.all([
        supabase.from("propiedades")
            .update({ total_consultas: (prop.total_consultas || 0) + 1 })
            .eq("id", propiedadId),
        updateSession(session.id, {
            ...state, step: "detalle_propiedad", propiedad_id: propiedadId
        })
    ])

    const ciudadNombre = (prop.ciudad as any)?.nombre || ""
    const sectorNombre = (prop.sector as any)?.nombre || ""
    const ubicacion = [sectorNombre, ciudadNombre].filter(Boolean).join(", ")

    // Construir caption con info básica para la foto
    const precio = prop.precio
        ? `$${Number(prop.precio).toLocaleString("es-EC")}${prop.tipo_operacion === "alquiler" ? "/mes" : ""}`
        : ""
    const hab = (prop.ambientes as any)?.habitaciones
    const m2 = (prop.dimensiones as any)?.m2_construccion || (prop.dimensiones as any)?.m2_total
    const captionPartes = [prop.nombre, ubicacion, precio, hab ? `${hab} hab` : null, m2 ? `${m2}m²` : null].filter(Boolean)
    const caption = captionPartes.join(" · ").slice(0, 1024)

    // Enviar TODAS las fotos disponibles (máx 3 para no saturar)
    const fotos = prop.fotos as any[]
    if (fotos?.length > 0) {
        const fotosAEnviar = fotos.slice(0, 3)
        for (let i = 0; i < fotosAEnviar.length; i++) {
            const url = typeof fotosAEnviar[i] === "string" ? fotosAEnviar[i] : fotosAEnviar[i]?.url
            if (url && phoneNumberId && from) {
                // Caption solo en la última foto para que llegue junto con los botones
                const captionFoto = i === fotosAEnviar.length - 1 ? caption : undefined
                await sendWhatsAppImage(phoneNumberId, from, url, captionFoto).catch(() => { })
            }
        }
    }

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
            footer: ubicacion || ciudadNombre
        }
    }
}

async function mostrarDetalleProyecto(
    proyectoId: number, session: any, state: any,
    tenant: any, phoneNumberId: string, from: string
): Promise<Respuesta> {
    const { data: proy } = await supabase
        .from("proyectos")
        .select(`*, ciudad:ciudad_id(nombre), sector:sector_id(nombre)`)
        .eq("id", proyectoId)
        .eq("tenant_id", tenant.id)
        .single()

    if (!proy) return await listarProyectos(tenant.id) as Respuesta

    await Promise.all([
        supabase.from("proyectos")
            .update({ total_consultas: (proy.total_consultas || 0) + 1 })
            .eq("id", proyectoId),
        updateSession(session.id, {
            ...state, step: "detalle_proyecto", proyecto_id: proyectoId
        })
    ])

    const ciudadNombre = (proy.ciudad as any)?.nombre || ""
    const precio = proy.precio_desde
        ? `Desde $${Number(proy.precio_desde).toLocaleString("es-EC")}`
        : ""
    const caption = [proy.nombre, ciudadNombre, precio].filter(Boolean).join(" · ").slice(0, 1024)

    // Enviar fotos del proyecto (máx 3)
    const fotos = proy.fotos as any[]
    if (fotos?.length > 0) {
        const fotosAEnviar = fotos.slice(0, 3)
        for (let i = 0; i < fotosAEnviar.length; i++) {
            const url = typeof fotosAEnviar[i] === "string" ? fotosAEnviar[i] : fotosAEnviar[i]?.url
            if (url && phoneNumberId && from) {
                const captionFoto = i === fotosAEnviar.length - 1 ? caption : undefined
                await sendWhatsAppImage(phoneNumberId, from, url, captionFoto).catch(() => { })
            }
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
            footer: ciudadNombre
        }
    }
}

async function buscarCiudadFuzzy(
    texto: string, tenantId?: number,
    tipoOperacion?: string, tipoPropiedad?: string
): Promise<{ id: number; nombre: string } | null> {
    let ciudades: any[] = []

    if (tenantId) {
        let query = supabase
            .from("propiedades")
            .select("ciudad_id, ciudades:ciudad_id(id, nombre)")
            .eq("tenant_id", tenantId)
            .eq("estado", "disponible")
            .is("deleted_at", null)
            .is("proyecto_id", null)

        if (tipoOperacion) query = query.eq("tipo_operacion", tipoOperacion)
        if (tipoPropiedad) query = query.eq("tipo_propiedad", tipoPropiedad)

        const { data } = await query
        const vistas = new Set<number>()
        data?.forEach((p: any) => {
            if (p.ciudades && !vistas.has(p.ciudades.id)) {
                vistas.add(p.ciudades.id)
                ciudades.push(p.ciudades)
            }
        })
    } else {
        const { data } = await supabase.from("ciudades").select("id, nombre").is("deleted_at", null).order("nombre")
        ciudades = data || []
    }

    if (!ciudades.length) return null

    const Fuse = (await import("fuse.js")).default
    const fuse = new Fuse(ciudades, { keys: ["nombre"], threshold: 0.4 })
    const resultados = fuse.search(texto)
    return resultados.length > 0 ? (resultados[0].item as any) : null
}

async function menuPrincipal(tenant: any, cliente: any, config: any): Promise<Respuesta> {
    const saludo = config?.saludo || `Bienvenido a ${tenant.nombre}`
    const permiteProyectos = config?.permite_proyectos !== false
    const permiteAsesor = config?.permite_asesor !== false

    const { data: reservaVigente } = await supabase
        .from("reservas")
        .select(`fecha, estado, propiedades:propiedad_id(nombre), proyectos:proyecto_id(nombre)`)
        .eq("cliente_id", cliente.id)
        .eq("tenant_id", tenant.id)
        .in("estado", ["pendiente", "confirmada"])
        .gte("fecha", new Date().toISOString())
        .is("deleted_at", null)
        .order("fecha", { ascending: true })
        .limit(1)
        .maybeSingle()

    // Saludo personalizado
    const nombreCliente = cliente.nombres_completos &&
        cliente.nombres_completos !== "Cliente WhatsApp"
        ? ` ${cliente.nombres_completos.split(" ")[0]}` : ""

    let bodyText = saludo.replace("Bienvenido", `Bienvenido${nombreCliente}`)

    if (reservaVigente) {
        const prop = reservaVigente.propiedades as any
        const proy = reservaVigente.proyectos as any
        const nombre = prop?.nombre || proy?.nombre || "visita"
        const fecha = new Date(reservaVigente.fecha).toLocaleDateString("es-EC", {
            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
        })
        bodyText += `\n\nTienes una cita para ${nombre} el ${fecha}.`
    }

    bodyText += "\n\nEn que puedo ayudarte?"

    const buttons: { id: string; title: string }[] = [{ id: "btn_propiedades", title: "Ver propiedades" }]
    if (permiteProyectos) buttons.push({ id: "btn_proyectos", title: "Ver proyectos" })
    if (permiteAsesor) buttons.push({ id: "btn_asesor", title: "Hablar con asesor" })

    return {
        tipo: "buttons",
        payload: {
            body: bodyText,
            buttons: buttons.slice(0, 3),
            footer: reservaVigente ? "Escribe 'citas' para gestionar tu cita" : undefined
        }
    }
}

async function listarProyectos(tenantId: number, ciudadId?: number): Promise<Respuesta> {
    let query = supabase
        .from("proyectos")
        .select(`id, nombre, precio_desde, ciudad:ciudad_id(nombre)`)
        .eq("tenant_id", tenantId)
        .eq("estado", "activo")
        .is("deleted_at", null)
        .limit(10)

    if (ciudadId) query = query.eq("ciudad_id", ciudadId)
    const { data } = await query

    if (!data?.length) {
        return {
            tipo: "buttons",
            payload: {
                body: "No tenemos proyectos disponibles en este momento.",
                buttons: [
                    { id: "btn_propiedades", title: "Ver propiedades" },
                    { id: "menu_principal", title: "Menu principal" },
                ]
            }
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
                rows: data.map((p: any) => {
                    const ciudad = p.ciudad?.nombre || ""
                    const precio = p.precio_desde ? `Desde $${Number(p.precio_desde).toLocaleString("es-EC")}` : ""
                    return rowPropiedad(p.nombre, ciudad, "", precio, `proy_${p.id}`)
                })
            }]
        }
    }
}

async function listarUnidadesProyecto(proyectoId: number): Promise<Respuesta> {
    const { data } = await supabase
        .from("propiedades")
        .select("id, nombre, precio, ambientes, dimensiones")
        .eq("proyecto_id", proyectoId)
        .eq("estado", "disponible")
        .is("deleted_at", null)
        .limit(8)

    if (!data?.length) return "No hay unidades disponibles en este proyecto.\n\nEscribe 'agente' para mas informacion."

    return {
        tipo: "list",
        payload: {
            header: "Unidades disponibles",
            body: "Selecciona una unidad para ver detalles:",
            buttonText: "Ver unidades",
            sections: [{
                title: "Disponibles",
                rows: data.map(p => {
                    const hab = (p.ambientes as any)?.habitaciones
                    const m2 = (p.dimensiones as any)?.m2_construccion || (p.dimensiones as any)?.m2_total
                    const extra = [hab ? `${hab} hab` : null, m2 ? `${m2}m2` : null, `$${Number(p.precio).toLocaleString("es-EC")}`].filter(Boolean).join(" · ")
                    return rowPropiedad(p.nombre, "", "", extra, `prop_${p.id}`)
                })
            }]
        }
    }
}

async function listaTipoPropiedad(): Promise<Respuesta> {
    return {
        tipo: "list",
        payload: {
            body: "Selecciona el tipo de propiedad:",
            buttonText: "Ver tipos",
            sections: [{
                title: "Tipos",
                rows: [
                    { id: "tipo_casa", title: "Casa" },
                    { id: "tipo_departamento", title: "Departamento" },
                    { id: "tipo_terreno", title: "Terreno" },
                    { id: "tipo_comercial", title: "Local comercial" },
                    { id: "tipo_oficina", title: "Oficina" },
                ]
            }]
        }
    }
}

async function listaCiudades(tenantId: number, tipoOperacion?: string, tipoPropiedad?: string): Promise<Respuesta> {
    let query = supabase
        .from("propiedades")
        .select("ciudad_id, ciudades:ciudad_id(id, nombre, provincia:provincia_id(nombre))")
        .eq("tenant_id", tenantId)
        .eq("estado", "disponible")
        .is("deleted_at", null)
        .is("proyecto_id", null)

    if (tipoOperacion) query = query.eq("tipo_operacion", tipoOperacion)
    if (tipoPropiedad) query = query.eq("tipo_propiedad", tipoPropiedad)

    const { data } = await query
    if (!data?.length) return "Escribe el nombre de la ciudad donde buscas:"

    const ciudadesVistas = new Set<number>()
    const ciudadesUnicas: any[] = []

    data.forEach((p: any) => {
        const ciudad = p.ciudades
        if (ciudad && !ciudadesVistas.has(ciudad.id)) {
            ciudadesVistas.add(ciudad.id)
            ciudadesUnicas.push(ciudad)
        }
    })

    ciudadesUnicas.sort((a, b) => a.nombre.localeCompare(b.nombre))
    if (!ciudadesUnicas.length) return "Escribe el nombre de la ciudad donde buscas:"

    const rows: any[] = ciudadesUnicas.slice(0, 9).map(c => ({
        id: `ciudad_${c.id}`, title: c.nombre, description: c.provincia?.nombre || ""
    }))
    if (ciudadesUnicas.length > 9) rows.push({ id: "ciudad_otra", title: "Otra ciudad", description: "Escribe el nombre a continuacion" })

    return {
        tipo: "list",
        payload: {
            body: "Selecciona la ciudad donde buscas:",
            buttonText: "Ver ciudades",
            sections: [{ title: "Ciudades disponibles", rows }]
        }
    }
}

async function listaSectores(ciudadId: number, ciudadNombre: string): Promise<Respuesta> {
    const { data } = await supabase
        .from("sectores").select("id, nombre").eq("ciudad_id", ciudadId)
        .is("deleted_at", null).order("nombre").limit(9)

    const rows: any[] = [{ id: "sector_todos", title: "Todos los sectores" }]
    if (data?.length) rows.push(...data.map(s => ({ id: `sector_${s.id}`, title: s.nombre })))

    return {
        tipo: "list",
        payload: {
            body: `Sector de ${ciudadNombre}:`,
            buttonText: "Ver sectores",
            sections: [{ title: "Sectores", rows }]
        }
    }
}

async function buscarPropiedades(params: {
    tenantId: number
    tipo_operacion?: string
    tipo_propiedad?: string
    ciudad_id?: number
    sector_id?: number
    precio_min?: number
    precio_max?: number
    habitaciones?: number
}): Promise<any[]> {
    const { data } = await supabase.rpc("buscar_propiedades", {
        p_tenant_id: params.tenantId,
        p_tipo_operacion: params.tipo_operacion || null,
        p_tipo_propiedad: params.tipo_propiedad || null,
        p_provincia_id: null,
        p_ciudad_id: params.ciudad_id || null,
        p_sector_id: params.sector_id || null,
        p_precio_min: params.precio_min || null,
        p_precio_max: params.precio_max || null,
        p_tipo_pago: null,
        p_habitaciones: params.habitaciones || null,
        p_banos: null, p_m2_min: null, p_m2_max: null,
        p_patio: null, p_jardin: null, p_piscina: null,
        p_estacionamientos: null, p_ascensor: null, p_amoblado: null,
        p_limite: 20
    })
    return data || []
}

async function formatearResultados(propiedades: any[], sessionId: number, state: any): Promise<Respuesta> {
    if (!propiedades.length) {
        await updateSession(sessionId, { ...state, step: "sin_resultados" })
        return {
            tipo: "buttons",
            payload: {
                body: "No encontre propiedades con esos criterios.\n\nQue deseas hacer?",
                buttons: [
                    { id: "buscar_nuevo", title: "Cambiar busqueda" },
                    { id: "ver_proyectos", title: "Ver proyectos" },
                    { id: "btn_menu", title: "Menu principal" },
                ]
            }
        }
    }

    const ITEMS_POR_PAGINA = 5
    const pagina = state.pagina || 0
    const inicio = pagina * ITEMS_POR_PAGINA
    const pagActual = propiedades.slice(inicio, inicio + ITEMS_POR_PAGINA)
    const hayMas = propiedades.length > inicio + ITEMS_POR_PAGINA
    const hayAnterior = pagina > 0
    const total = propiedades.length
    const totalPaginas = Math.ceil(total / ITEMS_POR_PAGINA)

    await updateSession(sessionId, { ...state, step: "mostrar_resultados", propiedades_ids: propiedades.map(p => p.id), pagina })

    const rows = pagActual.map(p => rowPropiedad(p.nombre, p.ciudad_nombre || "", p.sector_nombre || "", `$${Number(p.precio).toLocaleString("es-EC")}`, `prop_${p.id}`))

    const navRows: any[] = []
    if (hayAnterior) navRows.push({ id: "pagina_anterior", title: "Pagina anterior", description: `Pagina ${pagina} de ${totalPaginas}` })
    if (hayMas) navRows.push({ id: "pagina_siguiente", title: "Siguiente pagina", description: `Pagina ${pagina + 2} de ${totalPaginas}` })
    navRows.push({ id: "btn_menu", title: "Volver al menu" })

    const sections: any[] = [{ title: `${inicio + 1}-${Math.min(inicio + ITEMS_POR_PAGINA, total)} de ${total}`, rows }]
    if (navRows.length > 0) sections.push({ title: "Navegacion", rows: navRows })

    return {
        tipo: "list",
        payload: {
            header: `${total} resultado(s)`,
            body: `Pagina ${pagina + 1} de ${totalPaginas}. Selecciona una propiedad:`,
            buttonText: "Ver propiedades",
            sections
        }
    }
}

async function mostrarHorariosPropiedad(propiedadId: number, diasMax: number, sessionId: number, state: any): Promise<Respuesta> {
    const desde = new Date().toISOString().split("T")[0]
    const hasta = new Date(Date.now() + diasMax * 86400000).toISOString().split("T")[0]

    const { data } = await supabase
        .from("horarios_disponibles").select("id, fecha, hora_inicio, hora_fin")
        .eq("propiedad_id", propiedadId).eq("disponible", true)
        .gte("fecha", desde).lte("fecha", hasta).is("deleted_at", null)
        .order("fecha", { ascending: true }).limit(6)

    if (!data?.length) {
        await updateSession(sessionId, { ...state, step: "solicitar_fecha_visita", propiedad_id: propiedadId, intentos_fecha: 0 })
        return "No hay horarios disponibles en este momento.\n\nIndica el dia y hora que prefieres para tu visita y un agente confirmara:\n\nEj: manana a las 3pm\nEj: el viernes en la tarde\nEj: 25 de abril a las 10am"
    }

    const ids = data.map(h => h.id)
    await updateSession(sessionId, { ...state, step: "agendar_propiedad", propiedad_id: propiedadId, horarios_ids: ids })

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

async function mostrarHorariosProyecto(proyectoId: number, diasMax: number, sessionId: number, state: any): Promise<Respuesta> {
    const desde = new Date().toISOString().split("T")[0]
    const hasta = new Date(Date.now() + diasMax * 86400000).toISOString().split("T")[0]

    const { data } = await supabase
        .from("horarios_disponibles").select("id, fecha, hora_inicio, hora_fin")
        .eq("proyecto_id", proyectoId).eq("disponible", true)
        .gte("fecha", desde).lte("fecha", hasta).is("deleted_at", null)
        .order("fecha", { ascending: true }).limit(6)

    if (!data?.length) {
        await updateSession(sessionId, { ...state, step: "solicitar_fecha_visita", proyecto_id: proyectoId, intentos_fecha: 0 })
        return "No hay horarios disponibles para este proyecto.\n\nIndica el dia y hora que prefieres y un agente confirmara:\n\nEj: manana a las 3pm\nEj: el sabado en la manana"
    }

    const ids = data.map(h => h.id)
    await updateSession(sessionId, { ...state, step: "agendar_proyecto", proyecto_id: proyectoId, horarios_ids: ids })

    return {
        tipo: "list",
        payload: {
            header: "Horarios de visita",
            body: "Selecciona el horario que prefieres:",
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

async function listarCitasCliente(clienteId: number, tenantId: number): Promise<Respuesta> {
    const { data } = await supabase
        .from("reservas")
        .select(`id, fecha, estado, propiedades:propiedad_id(nombre), proyectos:proyecto_id(nombre)`)
        .eq("cliente_id", clienteId).eq("tenant_id", tenantId)
        .gte("fecha", new Date().toISOString()).is("deleted_at", null)
        .order("fecha", { ascending: true }).limit(5)

    if (!data?.length) {
        return {
            tipo: "buttons",
            payload: {
                body: "No tienes citas programadas.",
                buttons: [
                    { id: "btn_propiedades", title: "Buscar propiedades" },
                    { id: "menu_principal", title: "Menu principal" },
                ]
            }
        }
    }

    const confirmadas = data.filter(r => r.estado === "confirmada")
    const pendientes = data.filter(r => r.estado === "pendiente")

    const formatCita = (r: any) => {
        const prop = r.propiedades as any
        const proy = r.proyectos as any
        const nombre = prop?.nombre || proy?.nombre || "Visita"
        const fecha = new Date(r.fecha).toLocaleDateString("es-EC", {
            weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
        })
        return `${r.estado === "confirmada" ? "✅" : "⏳"} ${nombre}\n   ${fecha}`
    }

    const lineas: string[] = []
    if (confirmadas.length) { lineas.push("*Confirmadas:*"); confirmadas.forEach(r => lineas.push(formatCita(r))) }
    if (pendientes.length) { if (lineas.length) lineas.push(""); lineas.push("*Pendientes:*"); pendientes.forEach(r => lineas.push(formatCita(r))) }

    return {
        tipo: "buttons",
        payload: {
            header: `Tus citas (${data.length})`,
            body: lineas.join("\n"),
            buttons: [
                { id: "hablar_agente", title: "Modificar cita" },
                { id: "btn_propiedades", title: "Ver propiedades" },
                { id: "menu_principal", title: "Menu principal" },
            ],
            footer: "Escribe 'agente' para cancelar o reprogramar"
        }
    }
}

function solicitarCedula(): Respuesta {
    return "Para agendar tu visita necesitamos verificar tu identidad.\n\nIngresa tu numero de cedula (10 digitos):"
}

function rowPropiedad(nombre: string, ciudad: string, sector: string, precio: string, id: string) {
    const ubicacion = [sector, ciudad].filter(Boolean).join(", ").slice(0, 24)
    const detalle = [nombre, precio].filter(Boolean).join(" · ").slice(0, 72)
    return { id, title: ubicacion || nombre.slice(0, 24), description: detalle }
}

function formatearDetallePropiedad(p: any): string {
    const dim = p.dimensiones || {}, amb = p.ambientes || {}, ext = p.exteriores || {}
    const est = p.estacionamiento || {}, extra = p.extras || {}, seg = p.seguridad || {}
    const pago = Array.isArray(p.tipo_pago) ? p.tipo_pago.join(", ") : ""
    const lineas: string[] = []

    if (p.precio) {
        lineas.push(`Precio: $${Number(p.precio).toLocaleString("es-EC")}${p.tipo_operacion === "alquiler" ? "/mes" : ""}${p.precio_negociable ? " (negociable)" : ""}`)
    }
    if (dim.m2_construccion) lineas.push(`Construccion: ${dim.m2_construccion}m²`)
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

    const extraItems = [extra.amoblado && "Amoblado", extra.ascensor && "Ascensor", extra.generador && "Generador", extra.cisterna && "Cisterna", extra.panel_solar && "Panel solar"].filter(Boolean)
    if (extraItems.length) lineas.push(`Extras: ${extraItems.join(", ")}`)

    if (pago) lineas.push(`Forma de pago: ${pago}`)
    if (p.descripcion) lineas.push(`\n${p.descripcion.slice(0, 200)}`)

    return lineas.map((l, i) => l.startsWith("\n") ? l : `${i + 1}. ${l}`).join("\n")
}

function formatearDetalleProyecto(p: any): string {
    const amenidades = Array.isArray(p.amenidades) ? p.amenidades.join(", ") : ""
    const pago = Array.isArray(p.tipo_pago) ? p.tipo_pago.join(", ") : ""
    const lineas: string[] = []

    if (p.precio_desde) {
        lineas.push(`Precio: desde $${Number(p.precio_desde).toLocaleString("es-EC")}${p.precio_hasta ? ` hasta $${Number(p.precio_hasta).toLocaleString("es-EC")}` : ""}`)
    }
    if (p.fecha_entrega_estimada) lineas.push(`Entrega estimada: ${new Date(p.fecha_entrega_estimada).toLocaleDateString("es-EC")}`)
    if (amenidades) lineas.push(`Amenidades: ${amenidades}`)
    if (pago) lineas.push(`Forma de pago: ${pago}`)
    if (p.descripcion) lineas.push(`\n${p.descripcion}`)
    if (p.slogan) lineas.push(`"${p.slogan}"`)

    return lineas.map((l, i) => l.startsWith("\n") || l.startsWith('"') ? l : `${i + 1}. ${l}`).join("\n")
}

function resolverTipo(input: string): string | null {
    const mapa: Record<string, string> = {
        "tipo_casa": "casa", "casa": "casa", "1": "casa",
        "tipo_departamento": "departamento", "departamento": "departamento",
        "depa": "departamento", "apto": "departamento", "2": "departamento",
        "tipo_terreno": "terreno", "terreno": "terreno", "lote": "terreno", "3": "terreno",
        "tipo_comercial": "comercial", "local": "comercial", "comercial": "comercial", "4": "comercial",
        "tipo_oficina": "oficina", "oficina": "oficina", "5": "oficina",
    }
    return mapa[input.toLowerCase()] || null
}