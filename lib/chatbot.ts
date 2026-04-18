import { supabase } from "./supabase"
import { validarCedulaAPI } from "./cedula"
import {
    sendWhatsAppButtons,
    sendWhatsAppList,
    sendWhatsAppMessage,
    sendWhatsAppImage,
} from "./whatsapp"
import { extraerParametros, extraerFechaHora, parametrosFaltantes, preguntarParametro } from "./nlp"

type Respuesta = string | { tipo: "buttons" | "list" | "image"; payload: any }

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
            .select(`
                *,
                ciudad:ciudad_id(nombre),
                sector:sector_id(nombre)
            `)
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
                footer: [ciudadNombre, sectorNombre].filter(Boolean).join(", ")
            }
        }
    }

    if (tipo === "proyecto" && proyecto_id) {
        const { data: proy } = await supabase
            .from("proyectos")
            .select(`
                *,
                ciudad:ciudad_id(nombre),
                sector:sector_id(nombre)
            `)
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

async function buscarYMostrar(
    params: any,
    session: any,
    tenant: any,
    config: any
): Promise<Respuesta> {
    const tenantId = tenant.id

    // ── 1. Buscar propiedades con todos los parámetros del NLP ──
    const { data: propiedades } = await supabase.rpc("buscar_propiedades", {
        p_tenant_id: tenantId,
        p_tipo_propiedad: params.tipo_propiedad || null,
        p_tipo_operacion: params.tipo_operacion || null,
        p_ciudad_id: null, // se resuelve por nombre abajo
        p_sector_id: null,
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
        p_limite: 20,
        // Búsqueda por nombre de ciudad y sector
        p_ciudad: params.ciudad || null,
        p_sector: params.sector || null,
    })

    // ── 2. Buscar proyectos coincidentes ──
    let queryProyectos = supabase
        .from("proyectos")
        .select(`
            id, nombre, precio_desde, precio_hasta, tipo_pago,
            ciudad:ciudad_id(nombre), sector:sector_id(nombre)
        `)
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
    if (params.precio_max) {
        queryProyectos = queryProyectos.lte("precio_desde", params.precio_max)
    }
    if (params.tipo_pago === "biess") {
        queryProyectos = queryProyectos.contains("tipo_pago", ["biess"])
    }

    const { data: proyectos } = await queryProyectos.limit(3)

    // ── 3. Fallback — misma ciudad + mismo tipo + misma operación sin filtros extras ──
    let propsFallback: any[] = []
    let esFallback = false

    if (!propiedades?.length && !proyectos?.length) {
        esFallback = true
        const { data: fallback } = await supabase.rpc("buscar_propiedades", {
            p_tenant_id: tenantId,
            p_tipo_propiedad: params.tipo_propiedad || null,
            p_tipo_operacion: params.tipo_operacion || null,
            p_ciudad: params.ciudad || null,
            p_sector: null,
            p_ciudad_id: null, p_sector_id: null,
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

    // ── 4. Sin resultados en absoluto ──
    if (totalResultados === 0) {
        await updateSession(session.id, {
            ...session.contenido,
            step: "sin_resultados",
            params_busqueda: params
        })
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

    // En buscarYMostrar — paso 5, cambiar resultado_ids por propiedades_ids
    await updateSession(session.id, {
        ...session.contenido,
        step: "mostrar_resultados",
        params_busqueda: params,
        propiedades_ids: propsAMostrar.map((p: any) => p.id), // ← antes era resultado_ids
        pagina: 0,
        es_fallback: esFallback
    })

    // ── 6. Construir encabezado ──
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

    // ── 7. Rows ──
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

    // Paginación
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

    // LOG TEMPORAL
    console.log("[Chatbot] step:", state.step)
    console.log("[Chatbot] btnId:", btnId)
    console.log("[Chatbot] text:", text)
    console.log("[Chatbot] propiedad_id:", state.propiedad_id)
    console.log("[Chatbot] horarios_ids:", state.horarios_ids)
    // COMANDOS GLOBALES
    if (text === "agente" || text === "hablar con agente" || text === "humano" || btnId === "hablar_agente") {
        await activarModoManual(session, tenant, cliente)
        const tiempoManual = config?.tiempo_manual_min ?? 15
        return `Un agente te atendera en breve. ⏳\n\nEn ${tiempoManual} minutos el asistente se reactivara automaticamente.`
    }

    if (text === "bot" || text === "menu" || btnId === "menu_principal") {
        await updateSession(session.id, { step: "menu_principal" })
        return await menuPrincipal(tenant, cliente, config)
    }

    if (text === "citas" || text === "mis citas" || btnId === "btn_citas") {
        return await listarCitasCliente(cliente.id, tenant.id)
    }

    // DETALLE LINK
    if (state.step === "detalle_link") {
        if (btnId.startsWith("reservar_prop_")) {
            const propId = parseInt(btnId.replace("reservar_prop_", ""))
            if (!cliente.verificado) {
                await updateSession(session.id, { step: "solicitar_cedula", propiedad_id: propId })
                return solicitarCedula()
            }
            await updateSession(session.id, { step: "agendar_propiedad", propiedad_id: propId })
            return await mostrarHorariosPropiedad(propId, config?.dias_max_cita ?? 7, session.id, state)
        }

        if (btnId.startsWith("reservar_proy_")) {
            const proyId = parseInt(btnId.replace("reservar_proy_", ""))
            if (!cliente.verificado) {
                await updateSession(session.id, { step: "solicitar_cedula", proyecto_id: proyId })
                return solicitarCedula()
            }
            await updateSession(session.id, { step: "agendar_proyecto", proyecto_id: proyId })
            return await mostrarHorariosProyecto(proyId, config?.dias_max_cita ?? 7, session.id, state)
        }

        if (btnId.startsWith("ver_unidades_")) {
            const proyId = parseInt(btnId.replace("ver_unidades_", ""))
            await updateSession(session.id, { step: "ver_unidades_proyecto", proyecto_id: proyId })
            return await listarUnidadesProyecto(proyId)
        }

        if (btnId.startsWith("ver_web_")) {
            const slug = btnId
                .replace("ver_web_prop_", "propiedad-")
                .replace("ver_web_proy_", "proyecto-")
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
            return `Ver detalles, fotos y ubicacion:\n${appUrl}/p/${slug}`
        }
    }

    // INICIO
    // INICIO
    if (!state.step || state.step === "inicio") {
        // Si el mensaje tiene contenido — intentar NLP primero
        if (text.length > 3) {
            const params = await extraerParametros(text)

            // Si extrajo al menos un parámetro útil → ir directo a búsqueda
            const tieneParametros = params.tipo_propiedad || params.tipo_operacion ||
                params.ciudad || params.sector || params.habitaciones_min ||
                params.precio_max || params.precio_min || params.con_estacionamiento ||
                params.tipo_pago || params.con_piscina || params.con_jardin ||
                params.conjunto_cerrado || params.nueva_construccion || params.amoblado

            if (tieneParametros && params.confianza >= 0.3) {
                const faltantes = parametrosFaltantes(params)

                if (faltantes.length === 0) {
                    // Tiene todo — buscar directo
                    await updateSession(session.id, {
                        step: "busqueda_texto",
                        params_busqueda: params
                    })
                    return await buscarYMostrar(params, session, tenant, config)
                } else {
                    // Tiene algo pero le falta — guardar y preguntar
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

        // Sin parámetros detectados o mensaje muy corto → menú normal
        await updateSession(session.id, { step: "menu_principal" })
        return await menuPrincipal(tenant, cliente, config)
    }

    // MENU PRINCIPAL
    if (state.step === "menu_principal" || btnId === "menu_principal") {
        if (state.step !== "menu_principal") {
            await updateSession(session.id, { step: "menu_principal" })
            state = { step: "menu_principal" }
        }

        if (btnId === "btn_propiedades" || text === "1" || text.includes("propiedad")) {
            await updateSession(session.id, { step: "busqueda_texto", params_busqueda: {} })
            return "Que estas buscando?\n\nPuedes describirlo directamente:\n\nEj: casa grande en Guayaquil para comprar\nEj: depa en Quito hasta 800 dolares\nEj: terreno en Samborondon con financiamiento BIESS"
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

        return await menuPrincipal(tenant, cliente, config)
    }

    // BUSQUEDA POR TEXTO — entrada libre con NLP
    if (state.step === "busqueda_texto") {
        // Extraer parámetros con Gemini
        const params = await extraerParametros(text)

        // Acumular con lo que ya teníamos
        const acumulado = { ...state.params_busqueda }
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && k !== "confianza") {
                (acumulado as any)[k] = v
            }
        })

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

        return await buscarYMostrar(acumulado, session, tenant, config)
    }

    // RECOLECTANDO PARÁMETROS — respuestas a preguntas
    if (state.step === "recolectando_params") {
        const paramActual = state.param_preguntando
        const acumulado = { ...state.params_busqueda }

        if (btnId === "op_comprar") {
            acumulado.tipo_operacion = "venta"
        } else if (btnId === "op_arrendar") {
            acumulado.tipo_operacion = "alquiler"
        } else if (btnId.startsWith("tipo_")) {
            acumulado.tipo_propiedad = btnId.replace("tipo_", "")
        } else {
            // Texto libre — extraer con NLP
            const params = await extraerParametros(text)

            if (paramActual === "ciudad" && params.ciudad) {
                acumulado.ciudad = params.ciudad
            } else if (paramActual === "ciudad") {
                // Intentar fuzzy match directo
                const resultado = await buscarCiudadFuzzy(text, tenant.id)
                if (resultado) {
                    acumulado.ciudad = resultado.nombre
                } else {
                    return "No reconoci esa ciudad. Escribe el nombre completo (ej: Guayaquil, Quito, Cuenca):"
                }
            } else if (paramActual === "tipo_propiedad" && params.tipo_propiedad) {
                acumulado.tipo_propiedad = params.tipo_propiedad
            } else if (paramActual === "tipo_propiedad") {
                // Mostrar botones de tipo
                return await listaTipoPropiedad()
            } else if (paramActual === "tipo_operacion" && params.tipo_operacion) {
                acumulado.tipo_operacion = params.tipo_operacion
            } else if (paramActual === "tipo_operacion") {
                // Primero intentar NLP
                const params = await extraerParametros(text)
                if (params.tipo_operacion) {
                    acumulado.tipo_operacion = params.tipo_operacion
                } else {
                    // Fallback regex ampliado
                    const t = text.toLowerCase()
                    if (/comprar|compra|comprarla|comprarlo|adquirir|venta|quiero comprar/.test(t)) {
                        acumulado.tipo_operacion = "venta"
                    } else if (/arrendar|arriendo|alquil|rentar|renta|arrendarlo|arrendarla/.test(t)) {
                        acumulado.tipo_operacion = "alquiler"
                    } else {
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
                }
            }

            // Aprovechar otros parámetros extraídos aunque no sean el faltante
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && k !== "confianza" && !(k in acumulado)) {
                    (acumulado as any)[k] = v
                }
            })
        }

        // Recalcular faltantes después de actualizar
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

        return await buscarYMostrar(acumulado, session, tenant, config)
    }

    // FILTRO TIPO
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

    // FILTRO OPERACION
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

        // En filtro_operacion — después de definir operacion:
        await updateSession(session.id, { ...state, step: "filtro_ciudad", operacion })
        return await listaCiudades(tenant.id, operacion, state.tipo)

        // En filtro_tipo — si quisieras pre-filtrar desde el tipo (opcional):
        // No es necesario aquí porque aún no saben la operación
    }

    // FILTRO CIUDAD
    if (state.step === "filtro_ciudad") {
        if (btnId === "ciudad_otra") {
            await updateSession(session.id, { ...state, step: "filtro_ciudad_texto" })
            return "Escribe el nombre de la ciudad que buscas:"
        }

        let ciudadId: number | null = null
        let ciudadNombre = ""

        if (btnId.startsWith("ciudad_")) {
            ciudadId = parseInt(btnId.replace("ciudad_", ""))
            const { data: c } = await supabase
                .from("ciudades").select("nombre").eq("id", ciudadId).single()
            ciudadNombre = c?.nombre || ""
        } else if (text) {
            const resultado = await buscarCiudadFuzzy(text, tenant.id, state.operacion, state.tipo)
            if (resultado) { ciudadId = resultado.id; ciudadNombre = resultado.nombre }
        }

        if (!ciudadId) return "No encontre esa ciudad. Escribe el nombre nuevamente:"

        await updateSession(session.id, {
            ...state, step: "filtro_sector",
            ciudad_id: ciudadId, ciudad_nombre: ciudadNombre
        })
        return await listaSectores(ciudadId, ciudadNombre)
    }

    // FILTRO CIUDAD TEXTO (Otra ciudad)
    if (state.step === "filtro_ciudad_texto") {
        const resultado = await buscarCiudadFuzzy(text, tenant.id, state.operacion, state.tipo)

        if (!resultado) return "No encontre esa ciudad. Intenta de nuevo:"

        await updateSession(session.id, {
            ...state, step: "filtro_sector",
            ciudad_id: resultado.id, ciudad_nombre: resultado.nombre
        })
        return await listaSectores(resultado.id, resultado.nombre)
    }

    // FILTRO SECTOR
    if (state.step === "filtro_sector") {
        let sectorId: number | null = null
        let sectorNombre = "todos los sectores"

        if (btnId === "sector_todos") {
            sectorId = null
        } else if (btnId.startsWith("sector_")) {
            sectorId = parseInt(btnId.replace("sector_", ""))
            const { data: s } = await supabase
                .from("sectores").select("nombre").eq("id", sectorId).single()
            sectorNombre = s?.nombre || ""
        } else if (text) {
            const { data: s } = await supabase
                .from("sectores")
                .select("id, nombre")
                .eq("ciudad_id", state.ciudad_id)
                .ilike("nombre", `%${text}%`)
                .limit(1)
                .maybeSingle()
            if (s) { sectorId = s.id; sectorNombre = s.nombre }
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

    if (state.step === "mostrar_resultados") {
        // Manejar selección de proyecto desde la lista
        if (btnId.startsWith("proyecto_")) {
            const proyId = parseInt(btnId.replace("proyecto_", ""))
            return await mostrarDetalleProyecto(
                proyId, session, state, tenant, phoneNumberId, from
            )
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
            return await mostrarDetallePropiedad(
                propiedadId, session, state, tenant, phoneNumberId, from
            )
        }

        return "Selecciona una propiedad de la lista."
    }
    // MOSTRAR RESULTADOS
    if (state.step === "mostrar_resultados") {
        if (btnId === "btn_volver" || text === "0") {
            await updateSession(session.id, { step: "menu_principal" })
            return await menuPrincipal(tenant, cliente, config)
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
            return await mostrarDetallePropiedad(
                propiedadId, session, state, tenant, phoneNumberId, from
            )
        }

        return "Selecciona una propiedad de la lista."
    }

    // DETALLE PROPIEDAD
    if (state.step === "detalle_propiedad") {
        if (btnId.startsWith("reservar_prop_") || text.includes("reservar") || text === "1") {
            const propId = state.propiedad_id
            if (!cliente.verificado) {
                await updateSession(session.id, { ...state, step: "solicitar_cedula" })
                return solicitarCedula()
            }
            await updateSession(session.id, { ...state, step: "agendar_propiedad" })
            return await mostrarHorariosPropiedad(propId, config?.dias_max_cita ?? 7, session.id, state)
        }

        if (btnId === "btn_volver" || text === "0") {
            await updateSession(session.id, { ...state, step: "mostrar_resultados" })
            return "Que otra propiedad te interesa?"
        }
    }

    // PROYECTOS
    if (state.step === "ver_proyectos") {
        let proyId: number | null = null

        if (btnId.startsWith("proy_")) {
            proyId = parseInt(btnId.replace("proy_", ""))
        } else {
            const num = parseInt(text)
            if (!isNaN(num) && state.proyectos_ids?.[num - 1]) {
                proyId = state.proyectos_ids[num - 1]
            }
        }

        if (proyId) {
            return await mostrarDetalleProyecto(proyId, session, state, tenant, phoneNumberId, from)
        }

        return await listarProyectos(tenant.id)
    }

    // DETALLE PROYECTO
    if (state.step === "detalle_proyecto") {
        if (btnId.startsWith("ver_unidades_")) {
            const proyId = parseInt(btnId.replace("ver_unidades_", ""))
            await updateSession(session.id, {
                ...state, step: "ver_unidades_proyecto", proyecto_id: proyId
            })
            return await listarUnidadesProyecto(proyId)
        }

        if (btnId.startsWith("reservar_proy_")) {
            const proyId = parseInt(btnId.replace("reservar_proy_", ""))
            if (!cliente.verificado) {
                await updateSession(session.id, { step: "solicitar_cedula", proyecto_id: proyId })
                return solicitarCedula()
            }
            await updateSession(session.id, { step: "agendar_proyecto", proyecto_id: proyId })
            return await mostrarHorariosProyecto(proyId, config?.dias_max_cita ?? 7, session.id, state)
        }

        if (btnId === "btn_volver" || text === "0") {
            await updateSession(session.id, { step: "ver_proyectos" })
            return await listarProyectos(tenant.id)
        }
    }

    // VER UNIDADES PROYECTO
    if (state.step === "ver_unidades_proyecto") {
        if (btnId.startsWith("prop_")) {
            const propiedadId = parseInt(btnId.replace("prop_", ""))
            return await mostrarDetallePropiedad(
                propiedadId, session, state, tenant, phoneNumberId, from
            )
        }

        if (btnId === "btn_volver" || text === "0") {
            return await mostrarDetalleProyecto(
                state.proyecto_id, session, state, tenant, phoneNumberId, from
            )
        }

        return await listarUnidadesProyecto(state.proyecto_id)
    }
    // SOLICITAR FECHA VISITA LIBRE — cuando no hay horarios disponibles
    if (state.step === "solicitar_fecha_visita") {
        const intentos = (state.intentos_fecha || 0) + 1
        const maxIntentos = 3

        // Extraer fecha y hora con NLP
        const fechaRef = new Date().toISOString().split("T")[0]
        const { fecha, hora, confianza } = await extraerFechaHora(text, fechaRef)

        // No entendió la fecha
        if (!fecha && !hora) {
            if (intentos >= maxIntentos) {
                await activarModoManual(session, tenant, cliente)
                return "No pude entender la fecha. Un agente te contactara para coordinar la visita. ⏳"
            }

            await updateSession(session.id, { ...state, intentos_fecha: intentos })
            return `No entendi la fecha. Intentalo de nuevo (${intentos}/${maxIntentos}):\n\nEj: manana a las 3pm\nEj: el viernes a las 10am\nEj: 25 de abril en la tarde`
        }

        // Validar que la fecha no sea pasada
        if (fecha) {
            const fechaVisita = new Date(fecha)
            const hoy = new Date()
            hoy.setHours(0, 0, 0, 0)

            if (fechaVisita < hoy) {
                await updateSession(session.id, { ...state, intentos_fecha: intentos })
                return "Esa fecha ya paso. Indica una fecha futura:"
            }
        }

        // Construir la reserva en estado pendiente_confirmacion
        const fechaFinal = fecha || new Date(Date.now() + 86400000).toISOString().split("T")[0]
        const horaFinal = hora || "10:00"
        const fechaISO = `${fechaFinal}T${horaFinal}:00`

        const reservaData: any = {
            tenant_id: tenant.id,
            cliente_id: cliente.id,
            fecha: fechaISO,
            estado: "pendiente",
            notas: `Solicitud libre del cliente: "${text}". Pendiente confirmacion del agente.`
        }

        if (state.propiedad_id) reservaData.propiedad_id = state.propiedad_id
        if (state.proyecto_id) reservaData.proyecto_id = state.proyecto_id

        await supabase.from("reservas").insert(reservaData)

        // Notificar al agente
        const fechaFormato = new Date(fechaISO).toLocaleDateString("es-EC", {
            weekday: "long", day: "numeric", month: "long",
            hour: "2-digit", minute: "2-digit"
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

        return `Solicitud recibida. ✅\n\nFecha solicitada: ${fechaFormato}\n\nUn agente confirmara tu cita en breve, ${nombre}.\n\nEscribe 'citas' para ver el estado de tu reserva.`
    }
    // AGENDAMIENTO
    if (state.step === "agendar_propiedad" || state.step === "agendar_proyecto") {
        let horarioId: number | null = null

        if (btnId.startsWith("horario_")) {
            horarioId = parseInt(btnId.replace("horario_", ""))
        } else {
            const num = parseInt(text)
            if (!isNaN(num) && state.horarios_ids?.[num - 1]) {
                horarioId = state.horarios_ids[num - 1]
            }
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
            weekday: "long", day: "numeric", month: "long",
            hour: "2-digit", minute: "2-digit"
        })

        await updateSession(session.id, { step: "menu_principal" })

        const nombre = cliente.nombres_completos !== "Cliente WhatsApp"
            ? cliente.nombres_completos : "estimad@ cliente"

        return `Cita confirmada. ✅\n\nFecha: ${fechaFormato}\n\nTe esperamos, ${nombre}.\nSi necesitas cambiar tu cita escribe 'citas' o 'agente'.`
    }

    // VERIFICACION DE CEDULA
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
                return "Cedula invalida. Has superado el limite de intentos. Un agente te contactara. ⏳"
            }
            return `${resultado.error || "Cedula invalida"}. Intento ${intentos}/${maxIntentos}. Intenta de nuevo:`
        }

        const { data: cedulaExistente } = await supabase
            .from("clientes")
            .select("id, celular")
            .eq("ruc_ci", cedula)
            .neq("id", cliente.id)
            .maybeSingle()

        if (cedulaExistente) {
            await supabase
                .from("clientes")
                .update({ celular_alternativo: from })
                .eq("id", cedulaExistente.id)
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

        if (phoneNumberId && from) {
            await sendWhatsAppMessage(phoneNumberId, from, saludoMsg)
        }

        if (state.propiedad_id) {
            return await mostrarHorariosPropiedad(state.propiedad_id, config?.dias_max_cita ?? 7, session.id, newState)
        } else {
            return await mostrarHorariosProyecto(state.proyecto_id, config?.dias_max_cita ?? 7, session.id, newState)
        }
    }

    // SIN RESULTADOS
    if (state.step === "sin_resultados") {
        if (btnId === "buscar_otro_sector" || btnId === "btn_filtros" || text === "1") {
            await updateSession(session.id, { ...state, step: "filtro_tipo" })
            return await listaTipoPropiedad()
        }
        if (btnId === "ver_proyectos" || text === "2") {
            await updateSession(session.id, { ...state, step: "ver_proyectos" })
            return await listarProyectos(tenant.id, state.ciudad_id)
        }
        if (btnId === "btn_volver" || text === "0") {
            await updateSession(session.id, { step: "menu_principal" })
            return await menuPrincipal(tenant, cliente, config)
        }
        return {
            tipo: "buttons",
            payload: {
                body: "Que deseas hacer?",
                buttons: [
                    { id: "buscar_otro_sector", title: "Cambiar busqueda" },
                    { id: "ver_proyectos", title: "Ver proyectos" },
                    { id: "btn_volver", title: "Menu principal" },
                ]
            }
        }
    }

    // FALLBACK
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

// Helper central — muestra detalle de propiedad con join en una sola query
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
        .select(`
            *,
            ciudad:ciudad_id(nombre),
            sector:sector_id(nombre)
        `)
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

    const fotos = prop.fotos as any[]
    if (fotos?.length > 0) {
        const url = typeof fotos[0] === "string" ? fotos[0] : fotos[0]?.url
        if (url && phoneNumberId && from) {
            await sendWhatsAppImage(phoneNumberId, from, url, prop.nombre).catch(() => { })
        }
    }

    const ciudadNombre = (prop.ciudad as any)?.nombre || ""
    const sectorNombre = (prop.sector as any)?.nombre || ""
    const ubicacion = [
        sectorNombre,
        ciudadNombre,
    ].filter(Boolean).join(", ")
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
            footer: ubicacion || ciudadNombre  // ← sector + ciudad
        }
    }
}

// Helper central — muestra detalle de proyecto con join en una sola query
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
        .select(`
            *,
            ciudad:ciudad_id(nombre),
            sector:sector_id(nombre)
        `)
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

    const fotos = proy.fotos as any[]
    if (fotos?.length > 0) {
        const url = typeof fotos[0] === "string" ? fotos[0] : fotos[0]?.url
        if (url && phoneNumberId && from) {
            await sendWhatsAppImage(phoneNumberId, from, url, proy.nombre).catch(() => { })
        }
    }

    const ciudadNombre = (proy.ciudad as any)?.nombre || ""

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
    texto: string,
    tenantId?: number,
    tipoOperacion?: string,
    tipoPropiedad?: string
): Promise<{ id: number; nombre: string } | null> {

    let ciudades: any[] = []

    if (tenantId) {
        // Buscar solo entre ciudades con propiedades del tenant
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
        // Fallback: todas las ciudades
        const { data } = await supabase
            .from("ciudades")
            .select("id, nombre")
            .is("deleted_at", null)
            .order("nombre")
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
        .select(`
            fecha, estado,
            propiedades:propiedad_id(nombre),
            proyectos:proyecto_id(nombre)
        `)
        .eq("cliente_id", cliente.id)
        .eq("tenant_id", tenant.id)
        .in("estado", ["pendiente", "confirmada"])
        .gte("fecha", new Date().toISOString())
        .is("deleted_at", null)
        .order("fecha", { ascending: true })
        .limit(1)
        .maybeSingle()

    let bodyText = saludo

    if (reservaVigente) {
        const prop = reservaVigente.propiedades as any
        const proy = reservaVigente.proyectos as any
        const nombre = prop?.nombre || proy?.nombre || "visita"
        const fecha = new Date(reservaVigente.fecha).toLocaleDateString("es-EC", {
            weekday: "long", day: "numeric", month: "long",
            hour: "2-digit", minute: "2-digit"
        })
        bodyText += `\n\nTienes una cita para ${nombre} el ${fecha}.`
    }

    bodyText += "\n\nEn que puedo ayudarte?"

    const buttons: { id: string; title: string }[] = [
        { id: "btn_propiedades", title: "Ver propiedades" },
    ]
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
        .select(`
            id, nombre, precio_desde,
            ciudad:ciudad_id(nombre)
        `)
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
                    const precio = p.precio_desde
                        ? `Desde $${Number(p.precio_desde).toLocaleString("es-EC")}`
                        : ""
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
                    const extra = [
                        hab ? `${hab} hab` : null,
                        m2 ? `${m2}m2` : null,
                        `$${Number(p.precio).toLocaleString("es-EC")}`
                    ].filter(Boolean).join(" · ")
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
    // Solo ciudades con propiedades disponibles del tenant
    let query = supabase
        .from("propiedades")
        .select("ciudad_id, ciudades:ciudad_id(id, nombre, provincia:provincia_id(nombre))")
        .eq("tenant_id", tenantId)
        .eq("estado", "disponible")
        .is("deleted_at", null)
        .is("proyecto_id", null) // solo independientes

    if (tipoOperacion) query = query.eq("tipo_operacion", tipoOperacion)
    if (tipoPropiedad) query = query.eq("tipo_propiedad", tipoPropiedad)

    const { data } = await query

    if (!data?.length) {
        return "Escribe el nombre de la ciudad donde buscas:"
    }

    // Deduplicar ciudades
    const ciudadesVistas = new Set<number>()
    const ciudadesUnicas: any[] = []

    data.forEach((p: any) => {
        const ciudad = p.ciudades
        if (ciudad && !ciudadesVistas.has(ciudad.id)) {
            ciudadesVistas.add(ciudad.id)
            ciudadesUnicas.push(ciudad)
        }
    })

    // Ordenar alfabéticamente
    ciudadesUnicas.sort((a, b) => a.nombre.localeCompare(b.nombre))

    if (!ciudadesUnicas.length) {
        return "Escribe el nombre de la ciudad donde buscas:"
    }

    // Si caben en la lista (máx 9 + "Otra")
    const rows: any[] = ciudadesUnicas.slice(0, 9).map(c => ({
        id: `ciudad_${c.id}`,
        title: c.nombre,
        description: c.provincia?.nombre || ""
    }))

    // Solo agregar "Otra ciudad" si hay más de 9
    if (ciudadesUnicas.length > 9) {
        rows.push({
            id: "ciudad_otra",
            title: "Otra ciudad",
            description: "Escribe el nombre a continuacion"
        })
    }

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
        .from("sectores")
        .select("id, nombre")
        .eq("ciudad_id", ciudadId)
        .is("deleted_at", null)
        .order("nombre")
        .limit(9)

    const rows: any[] = [{ id: "sector_todos", title: "Todos los sectores" }]
    if (data?.length) {
        rows.push(...data.map(s => ({ id: `sector_${s.id}`, title: s.nombre })))
    }

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
        p_ciudad_id: params.ciudad_id || null,
        p_sector_id: params.sector_id || null,
        p_precio_min: params.precio_min || null,
        p_precio_max: params.precio_max || null,
        p_habitaciones: params.habitaciones || null,
        p_banos: null, p_m2_min: null, p_m2_max: null,
        p_patio: null, p_jardin: null, p_piscina: null,
        p_estacionamientos: null, p_ascensor: null, p_amoblado: null,
        p_limite: 20
    })
    return data || []
}

async function formatearResultados(
    propiedades: any[],
    sessionId: number,
    state: any
): Promise<Respuesta> {
    if (!propiedades.length) {
        await updateSession(sessionId, { ...state, step: "sin_resultados" })
        return {
            tipo: "buttons",
            payload: {
                body: "No encontre propiedades con esos criterios.\n\nQue deseas hacer?",
                buttons: [
                    { id: "buscar_otro_sector", title: "Cambiar busqueda" },
                    { id: "ver_proyectos", title: "Ver proyectos" },
                    { id: "btn_volver", title: "Menu principal" },
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

    await updateSession(sessionId, {
        ...state,
        step: "mostrar_resultados",
        propiedades_ids: propiedades.map(p => p.id),
        pagina,
    })

    const rows = pagActual.map(p =>
        rowPropiedad(
            p.nombre,
            p.ciudad_nombre || "",
            p.sector_nombre || "",
            `$${Number(p.precio).toLocaleString("es-EC")}`,
            `prop_${p.id}`
        )
    )

    const navRows: any[] = []
    if (hayAnterior) navRows.push({
        id: "pagina_anterior",
        title: "Pagina anterior",
        description: `Pagina ${pagina} de ${totalPaginas}`
    })
    if (hayMas) navRows.push({
        id: "pagina_siguiente",
        title: "Siguiente pagina",
        description: `Pagina ${pagina + 2} de ${totalPaginas}`
    })
    navRows.push({ id: "btn_volver", title: "Volver al menu" })

    const sections: any[] = [{
        title: `${inicio + 1}-${Math.min(inicio + ITEMS_POR_PAGINA, total)} de ${total}`,
        rows
    }]

    if (navRows.length > 0) {
        sections.push({ title: "Navegacion", rows: navRows })
    }

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

async function mostrarHorariosPropiedad(
    propiedadId: number,
    diasMax: number,
    sessionId: number,
    state: any
): Promise<Respuesta> {
    const desde = new Date().toISOString().split("T")[0]
    const hasta = new Date(Date.now() + diasMax * 86400000).toISOString().split("T")[0]

    const { data } = await supabase
        .from("horarios_disponibles")
        .select("id, fecha, hora_inicio, hora_fin")
        .eq("propiedad_id", propiedadId)
        .eq("disponible", true)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .is("deleted_at", null)
        .order("fecha", { ascending: true })
        .limit(6)

    if (!data?.length) {
        // Sin horarios — activar flujo de solicitud libre
        await updateSession(sessionId, {
            ...state,
            step: "solicitar_fecha_visita",
            propiedad_id: propiedadId,
            intentos_fecha: 0
        })

        return "No hay horarios disponibles en este momento.\n\nIndica el dia y hora que prefieres para tu visita y un agente confirmara:\n\nEj: manana a las 3pm\nEj: el viernes en la tarde\nEj: 25 de abril a las 10am"
    }

    const ids = data.map(h => h.id)
    await updateSession(sessionId, {
        ...state,
        step: "agendar_propiedad",
        propiedad_id: propiedadId,
        horarios_ids: ids
    })

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
                    title: new Date(h.fecha + "T00:00:00").toLocaleDateString("es-EC", {
                        weekday: "short", day: "numeric", month: "short"
                    }),
                    description: `${h.hora_inicio} - ${h.hora_fin}`
                }))
            }]
        }
    }
}

async function mostrarHorariosProyecto(
    proyectoId: number,
    diasMax: number,
    sessionId: number,
    state: any
): Promise<Respuesta> {
    const desde = new Date().toISOString().split("T")[0]
    const hasta = new Date(Date.now() + diasMax * 86400000).toISOString().split("T")[0]

    const { data } = await supabase
        .from("horarios_disponibles")
        .select("id, fecha, hora_inicio, hora_fin")
        .eq("proyecto_id", proyectoId)
        .eq("disponible", true)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .is("deleted_at", null)
        .order("fecha", { ascending: true })
        .limit(6)

    if (!data?.length) {
        // Sin horarios — activar flujo de solicitud libre
        await updateSession(sessionId, {
            ...state,
            step: "solicitar_fecha_visita",
            proyecto_id: proyectoId,
            intentos_fecha: 0
        })

        return "No hay horarios disponibles para este proyecto.\n\nIndica el dia y hora que prefieres para tu visita y un agente confirmara:\n\nEj: manana a las 3pm\nEj: el sabado en la manana\nEj: 25 de abril a las 10am"
    }

    const ids = data.map(h => h.id)
    await updateSession(sessionId, {
        ...state,
        step: "agendar_proyecto",
        proyecto_id: proyectoId,
        horarios_ids: ids
    })

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
                    title: new Date(h.fecha + "T00:00:00").toLocaleDateString("es-EC", {
                        weekday: "short", day: "numeric", month: "short"
                    }),
                    description: `${h.hora_inicio} - ${h.hora_fin}`
                }))
            }]
        }
    }
}
async function listarCitasCliente(
    clienteId: number,
    tenantId: number
): Promise<Respuesta> {
    const { data } = await supabase
        .from("reservas")
        .select(`
            id, fecha, estado,
            propiedades:propiedad_id(nombre),
            proyectos:proyecto_id(nombre)
        `)
        .eq("cliente_id", clienteId)
        .eq("tenant_id", tenantId)
        .gte("fecha", new Date().toISOString())
        .is("deleted_at", null)
        .order("fecha", { ascending: true })
        .limit(5) // ← mostrar hasta 5 citas

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

    // Agrupar por estado
    const confirmadas = data.filter(r => r.estado === "confirmada")
    const pendientes = data.filter(r => r.estado === "pendiente")

    const formatCita = (r: any, i: number) => {
        const prop = r.propiedades as any
        const proy = r.proyectos as any
        const nombre = prop?.nombre || proy?.nombre || "Visita"
        const fecha = new Date(r.fecha).toLocaleDateString("es-EC", {
            weekday: "short", day: "numeric", month: "short",
            hour: "2-digit", minute: "2-digit"
        })
        const estadoIcon = r.estado === "confirmada" ? "✅" : "⏳"
        return `${estadoIcon} ${nombre}\n   ${fecha}`
    }

    const lineas: string[] = []

    if (confirmadas.length) {
        lineas.push("*Confirmadas:*")
        confirmadas.forEach((r, i) => lineas.push(formatCita(r, i)))
    }

    if (pendientes.length) {
        if (lineas.length) lineas.push("")
        lineas.push("*Pendientes de confirmar:*")
        pendientes.forEach((r, i) => lineas.push(formatCita(r, i)))
    }

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

// rowPropiedad — ubicacion arriba como titulo, nombre+precio abajo como descripcion
function rowPropiedad(
    nombre: string,
    ciudad: string,
    sector: string,
    precio: string,
    id: string
): { id: string; title: string; description: string } {
    const ubicacion = [sector, ciudad].filter(Boolean).join(", ").slice(0, 24)
    const detalle = [nombre, precio].filter(Boolean).join(" · ").slice(0, 72)
    return {
        id,
        title: ubicacion || nombre.slice(0, 24),
        description: detalle
    }
}

function formatearDetallePropiedad(p: any): string {
    const dim = p.dimensiones || {}
    const amb = p.ambientes || {}
    const ext = p.exteriores || {}
    const est = p.estacionamiento || {}
    const extra = p.extras || {}
    const seg = p.seguridad || {}
    const pago = Array.isArray(p.tipo_pago) ? p.tipo_pago.join(", ") : ""

    const lineas: string[] = []

    // Precio primero
    if (p.precio) {
        const precioFmt = `$${Number(p.precio).toLocaleString("es-EC")}`
        const sufijo = p.tipo_operacion === "alquiler" ? "/mes" : ""
        const neg = p.precio_negociable ? " (negociable)" : ""
        lineas.push(`Precio: ${precioFmt}${sufijo}${neg}`)
    }

    // Dimensiones
    if (dim.m2_construccion) lineas.push(`Construccion: ${dim.m2_construccion}m²`)
    if (dim.m2_terreno) lineas.push(`Terreno: ${dim.m2_terreno}m²`)
    if (dim.m2_total && !dim.m2_construccion) lineas.push(`Total: ${dim.m2_total}m²`)
    if (dim.pisos && dim.pisos > 1) lineas.push(`Pisos: ${dim.pisos}`)

    // Ambientes
    if (amb.habitaciones) lineas.push(`Habitaciones: ${amb.habitaciones}`)
    if (amb.banos) lineas.push(`Baños: ${amb.banos}`)
    if (amb.medios_banos) lineas.push(`Medios baños: ${amb.medios_banos}`)

    // Estacionamiento
    if (est.estacionamientos) {
        const cub = est.cubierto ? " cubierto" : ""
        lineas.push(`Garaje: ${est.estacionamientos}${cub}`)
    }
    if (est.bodega) lineas.push(`Bodega incluida`)

    // Exteriores relevantes
    const extItems = [
        ext.patio && "Patio",
        ext.jardin && "Jardín",
        ext.terraza && "Terraza",
        ext.balcon && "Balcón",
        ext.piscina && "Piscina",
        ext.bbq && "BBQ",
    ].filter(Boolean)
    if (extItems.length) lineas.push(`Exteriores: ${extItems.join(", ")}`)

    // Seguridad
    const segItems = [
        seg.conjunto_cerrado && "Conjunto cerrado",
        seg.guardianía && "Guardianía",
        seg.camara_seguridad && "Cámaras",
        seg.alarma && "Alarma",
    ].filter(Boolean)
    if (segItems.length) lineas.push(`Seguridad: ${segItems.join(", ")}`)

    // Extras
    const extraItems = [
        extra.amoblado && "Amoblado",
        extra.ascensor && "Ascensor",
        extra.generador && "Generador",
        extra.cisterna && "Cisterna",
        extra.panel_solar && "Panel solar",
    ].filter(Boolean)
    if (extraItems.length) lineas.push(`Extras: ${extraItems.join(", ")}`)

    // Pago
    if (pago) lineas.push(`Forma de pago: ${pago}`)

    // Descripción al final
    if (p.descripcion) lineas.push(`\n${p.descripcion.slice(0, 200)}`)

    return lineas.map((l, i) =>
        l.startsWith("\n") ? l : `${i + 1}. ${l}`
    ).join("\n")
}

function formatearDetalleProyecto(p: any): string {
    const amenidades = Array.isArray(p.amenidades) ? p.amenidades.join(", ") : ""
    const pago = Array.isArray(p.tipo_pago) ? p.tipo_pago.join(", ") : ""

    const lineas: string[] = []

    if (p.precio_desde) {
        const precio = `Precio: desde $${Number(p.precio_desde).toLocaleString("es-EC")}` +
            (p.precio_hasta ? ` hasta $${Number(p.precio_hasta).toLocaleString("es-EC")}` : "")
        lineas.push(precio)
    }
    if (p.fecha_entrega_estimada) {
        lineas.push(`Entrega estimada: ${new Date(p.fecha_entrega_estimada).toLocaleDateString("es-EC")}`)
    }
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

function interpretarTexto(text: string): {
    tipo_propiedad?: string
    tipo_operacion?: string
    habitaciones?: number
    precio_max?: number
} {
    const resultado: any = {}

    if (/\bcasa\b/.test(text)) resultado.tipo_propiedad = "casa"
    else if (/\bdepa\b|\bdepartamento\b|\bapto\b/.test(text)) resultado.tipo_propiedad = "departamento"
    else if (/\bterreno\b|\blote\b/.test(text)) resultado.tipo_propiedad = "terreno"
    else if (/\blocal\b|\bcomercial\b/.test(text)) resultado.tipo_propiedad = "comercial"
    else if (/\boficina\b/.test(text)) resultado.tipo_propiedad = "oficina"

    if (/\bcomprar\b|\bventa\b|\bvender\b/.test(text)) resultado.tipo_operacion = "venta"
    else if (/\balquil\b|\barriend\b|\brentar\b/.test(text)) resultado.tipo_operacion = "alquiler"

    const habMatch = text.match(/(\d+)\s*habitaci/)
    if (habMatch) resultado.habitaciones = parseInt(habMatch[1])

    const precioMatch = text.match(/\$?\s*(\d[\d.,]*)\s*(?:mil|k|m)/i)
    if (precioMatch) {
        const valor = parseFloat(precioMatch[1].replace(",", ""))
        resultado.precio_max = valor * 1000
    }

    return resultado
}