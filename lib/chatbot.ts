import { supabase } from "./supabase"
import { validarCedulaAPI } from "./cedula"
import {
    sendWhatsAppButtons,
    sendWhatsAppList,
    sendWhatsAppMessage,
    sendWhatsAppImage,
} from "./whatsapp"

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
            .select("*, ciudad_id, sector_id")
            .eq("id", propiedad_id)
            .eq("tenant_id", tenant.id)
            .eq("estado", "disponible")
            .is("deleted_at", null)
            .single()

        if (!prop) return "Esta propiedad ya no está disponible. ¿Deseas ver otras opciones?"

        await supabase
            .from("propiedades")
            .update({ total_consultas: (prop.total_consultas || 0) + 1 })
            .eq("id", propiedad_id)

        const { ciudadNombre, sectorNombre } = await obtenerUbicacion(prop.ciudad_id, prop.sector_id)

        // Enviar foto si existe
        const fotos = prop.fotos as any[]
        if (fotos?.length > 0) {
            const url = typeof fotos[0] === "string" ? fotos[0] : fotos[0]?.url
            if (url) await sendWhatsAppImage(phoneNumberId, cliente.celular, url, prop.nombre)
        }

        return {
            tipo: "buttons",
            payload: {
                header: prop.nombre,
                body: formatearDetallePropiedad(prop),
                buttons: [
                    { id: `reservar_prop_${propiedad_id}`, title: "📅 Reservar visita" },
                    { id: `ver_web_prop_${propiedad_id}`, title: "🌐 Ver en web" },
                    { id: "menu_principal", title: "🏠 Ver más opciones" },
                ],
                footer: `${ciudadNombre} · ${sectorNombre}`
            }
        }
    }

    if (tipo === "proyecto" && proyecto_id) {
        const { data: proy } = await supabase
            .from("proyectos")
            .select("*, ciudad_id, sector_id")
            .eq("id", proyecto_id)
            .eq("tenant_id", tenant.id)
            .eq("estado", "activo")
            .is("deleted_at", null)
            .single()

        if (!proy) return "Este proyecto ya no está disponible. ¿Deseas ver otras opciones?"

        await supabase
            .from("proyectos")
            .update({ total_consultas: (proy.total_consultas || 0) + 1 })
            .eq("id", proyecto_id)

        const { ciudadNombre } = await obtenerUbicacion(proy.ciudad_id, proy.sector_id)

        // Enviar foto si existe
        const fotos = proy.fotos as any[]
        if (fotos?.length > 0) {
            const url = typeof fotos[0] === "string" ? fotos[0] : fotos[0]?.url
            if (url) await sendWhatsAppImage(phoneNumberId, cliente.celular, url, proy.nombre)
        }

        return {
            tipo: "buttons",
            payload: {
                header: proy.nombre,
                body: formatearDetalleProyecto(proy),
                buttons: [
                    { id: `ver_unidades_${proyecto_id}`, title: "🏠 Ver unidades" },
                    { id: `reservar_proy_${proyecto_id}`, title: "📅 Reservar visita" },
                    { id: `ver_web_proy_${proyecto_id}`, title: "🌐 Ver en web" },
                ],
                footer: ciudadNombre
            }
        }
    }

    return null
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

    // COMANDOS GLOBALES
    if (text === "agente" || text === "hablar con agente" || text === "humano" || btnId === "hablar_agente") {
        await activarModoManual(session, tenant, cliente)
        const tiempoManual = config?.tiempo_manual_min ?? 15
        return `Un agente te atenderá en breve. ⏳\n\nEn ${tiempoManual} minutos el asistente se reactivará automáticamente.`
    }

    if (text === "bot" || text === "menu" || btnId === "menu_principal") {
        await updateSession(session.id, { step: "inicio" })
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
            return await mostrarHorariosPropiedad(propId, config?.dias_max_cita ?? 7, session.id)
        }

        if (btnId.startsWith("reservar_proy_")) {
            const proyId = parseInt(btnId.replace("reservar_proy_", ""))
            if (!cliente.verificado) {
                await updateSession(session.id, { step: "solicitar_cedula", proyecto_id: proyId })
                return solicitarCedula()
            }
            await updateSession(session.id, { step: "agendar_proyecto", proyecto_id: proyId })
            return await mostrarHorariosProyecto(proyId, config?.dias_max_cita ?? 7, session.id)
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
            return `🌐 Ver detalles, fotos y ubicación:\n${appUrl}/p/${slug}`
        }
    }

    // INICIO
    if (!state.step || state.step === "inicio") {
        await updateSession(session.id, { step: "menu_principal" })
        return await menuPrincipal(tenant, cliente, config)
    }

    // MENÚ PRINCIPAL
    if (state.step === "menu_principal") {
        if (btnId === "btn_propiedades" || text === "1" || text.includes("propiedad")) {
            await updateSession(session.id, { step: "busqueda_texto" })
            return "¿Qué estás buscando? Puedes describirlo directamente:\n\n_Ej: \"casa con 3 habitaciones en el norte de Guayaquil\"_\n_Ej: \"departamento para alquilar en Quito\"_\n\nO escribe *filtros* para buscar paso a paso."
        }

        if (btnId === "btn_proyectos" || text === "2" || text.includes("proyecto")) {
            await updateSession(session.id, { step: "ver_proyectos" })
            return await listarProyectos(tenant.id)
        }

        if (btnId === "btn_asesor" || text === "4" || text.includes("asesor")) {
            await activarModoManual(session, tenant, cliente)
            const tiempoManual = config?.tiempo_manual_min ?? 15
            return `Un agente te atenderá en breve. ⏳\n\nEn ${tiempoManual} minutos el asistente se reactivará automáticamente.`
        }

        return await menuPrincipal(tenant, cliente, config)
    }

    // BÚSQUEDA POR TEXTO
    if (state.step === "busqueda_texto") {
        if (text === "filtros") {
            await updateSession(session.id, { ...state, step: "filtro_tipo" })
            return await listaTipoPropiedad()
        }

        if (text === "todas" || text === "ver todas") {
            const resultados = await buscarPropiedades({ tenantId: tenant.id })
            return await formatearResultados(resultados, session.id, state)
        }

        const params = interpretarTexto(text)
        const tieneParametros = Object.keys(params).length > 0

        if (tieneParametros) {
            const resultados = await buscarPropiedades({ tenantId: tenant.id, ...params })
            if (resultados.length > 0) {
                return await formatearResultados(resultados, session.id, { ...state, ...params })
            }
            await updateSession(session.id, { ...state, step: "sin_resultados", ...params })
            return {
                tipo: "buttons",
                payload: {
                    body: `No encontré ${params.tipo_propiedad || "propiedades"} con esos criterios.\n\n¿Qué deseas hacer?`,
                    buttons: [
                        { id: "buscar_otro_sector", title: "🔍 Cambiar búsqueda" },
                        { id: "ver_proyectos", title: "🏗️ Ver proyectos" },
                        { id: "btn_filtros", title: "🔧 Usar filtros" },
                    ]
                }
            }
        }

        // No entendió — pasar a filtros automáticamente
        await updateSession(session.id, { ...state, step: "filtro_tipo" })
        return await listaTipoPropiedad()
    }

    // FLUJO FILTROS
    if (state.step === "filtro_tipo") {
        const tipo = resolverTipo(btnId || text)
        if (!tipo) return await listaTipoPropiedad()

        await updateSession(session.id, { ...state, step: "filtro_operacion", tipo })
        return {
            tipo: "buttons",
            payload: {
                body: `${emojiTipo(tipo)} *${tipo.charAt(0).toUpperCase() + tipo.slice(1)}*\n\n¿Para qué operación?`,
                buttons: [
                    { id: "op_venta", title: "🏷️ Comprar" },
                    { id: "op_alquiler", title: "🔑 Alquilar" },
                ]
            }
        }
    }

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
                    body: "¿Para qué operación?",
                    buttons: [
                        { id: "op_venta", title: "🏷️ Comprar" },
                        { id: "op_alquiler", title: "🔑 Alquilar" },
                    ]
                }
            }
        }

        await updateSession(session.id, { ...state, step: "filtro_ciudad", operacion })
        return await listaCiudades()
    }

    if (state.step === "filtro_ciudad") {
        let ciudadId: number | null = null
        let ciudadNombre = ""

        if (btnId.startsWith("ciudad_")) {
            ciudadId = parseInt(btnId.replace("ciudad_", ""))
            const { data: c } = await supabase
                .from("ciudades").select("nombre").eq("id", ciudadId).single()
            ciudadNombre = c?.nombre || ""
        } else {
            const { data: c } = await supabase
                .from("ciudades")
                .select("id, nombre")
                .ilike("nombre", `%${text}%`)
                .limit(1)
                .maybeSingle()
            if (c) { ciudadId = c.id; ciudadNombre = c.nombre }
        }

        if (!ciudadId) return "No encontré esa ciudad. Escribe el nombre de la ciudad:"

        await updateSession(session.id, {
            ...state, step: "filtro_sector",
            ciudad_id: ciudadId, ciudad_nombre: ciudadNombre
        })
        return await listaSectores(ciudadId, ciudadNombre)
    }

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

    // PAGINACIÓN
    if (state.step === "mostrar_resultados" &&
        (btnId === "pagina_siguiente" || btnId === "pagina_anterior")) {
        const pagina = state.pagina || 0
        const nuevaPagina = btnId === "pagina_siguiente" ? pagina + 1 : Math.max(0, pagina - 1)

        const params = {
            tenantId: tenant.id,
            tipo_operacion: state.operacion || undefined,
            tipo_propiedad: state.tipo || undefined,
            ciudad_id: state.ciudad_id || undefined,
            sector_id: state.sector_id || undefined,
        }

        const resultados = await buscarPropiedades(params)
        return await formatearResultados(resultados, session.id, { ...state, pagina: nuevaPagina })
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
            const { data: prop } = await supabase
                .from("propiedades")
                .select("*, ciudad_id, sector_id")
                .eq("id", propiedadId)
                .single()

            if (!prop) return "Propiedad no encontrada."

            await supabase
                .from("propiedades")
                .update({ total_consultas: (prop.total_consultas || 0) + 1 })
                .eq("id", propiedadId)

            await updateSession(session.id, {
                ...state, step: "detalle_propiedad", propiedad_id: propiedadId
            })

            // Enviar foto si existe
            const fotos = prop.fotos as any[]
            if (fotos?.length > 0) {
                const url = typeof fotos[0] === "string" ? fotos[0] : fotos[0]?.url
                if (url && phoneNumberId && from) {
                    await sendWhatsAppImage(phoneNumberId, from, url, prop.nombre)
                        .catch(() => {}) // No bloquear si falla la foto
                }
            }

            const { ciudadNombre, sectorNombre } = await obtenerUbicacion(prop.ciudad_id, prop.sector_id)
            const slug = await supabase.rpc("obtener_o_crear_link", {
                p_tipo: "propiedad",
                p_tenant_id: tenant.id,
                p_propiedad_id: propiedadId
            })

            return {
                tipo: "buttons",
                payload: {
                    header: prop.nombre,
                    body: formatearDetallePropiedad(prop),
                    buttons: [
                        { id: `reservar_prop_${propiedadId}`, title: "📅 Reservar visita" },
                        { id: `ver_web_prop_${propiedadId}`, title: "🌐 Ver en web" },
                        { id: "btn_volver", title: "↩️ Volver" },
                    ],
                    footer: `${ciudadNombre} · ${sectorNombre}`
                }
            }
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
            return await mostrarHorariosPropiedad(propId, config?.dias_max_cita ?? 7, session.id)
        }

        if (btnId === "btn_volver" || text === "0") {
            await updateSession(session.id, { ...state, step: "mostrar_resultados" })
            return "¿Qué otra propiedad te interesa?"
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
            const { data: proy } = await supabase
                .from("proyectos")
                .select("*, ciudad_id, sector_id")
                .eq("id", proyId)
                .single()

            if (!proy) return "Proyecto no encontrado."

            await updateSession(session.id, { ...state, step: "detalle_proyecto", proyecto_id: proyId })

            const { ciudadNombre } = await obtenerUbicacion(proy.ciudad_id, proy.sector_id)

            // Foto del proyecto
            const fotos = proy.fotos as any[]
            if (fotos?.length > 0) {
                const url = typeof fotos[0] === "string" ? fotos[0] : fotos[0]?.url
                if (url && phoneNumberId && from) {
                    await sendWhatsAppImage(phoneNumberId, from, url, proy.nombre)
                        .catch(() => {})
                }
            }

            return {
                tipo: "buttons",
                payload: {
                    header: proy.nombre,
                    body: formatearDetalleProyecto(proy),
                    buttons: [
                        { id: `ver_unidades_${proyId}`, title: "🏠 Ver unidades" },
                        { id: `reservar_proy_${proyId}`, title: "📅 Reservar visita" },
                        { id: "btn_volver", title: "↩️ Volver" },
                    ],
                    footer: ciudadNombre
                }
            }
        }

        return await listarProyectos(tenant.id)
    }

    if (state.step === "ver_unidades_proyecto") {
        return await listarUnidadesProyecto(state.proyecto_id)
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
                ? await mostrarHorariosPropiedad(state.propiedad_id, config?.dias_max_cita ?? 7, session.id)
                : await mostrarHorariosProyecto(state.proyecto_id, config?.dias_max_cita ?? 7, session.id)
        }

        const { data: horario } = await supabase
            .from("horarios_disponibles")
            .select("*")
            .eq("id", horarioId)
            .eq("disponible", true)
            .single()

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

        await supabase.from("reservas").insert(reservaData)
        await supabase
            .from("horarios_disponibles")
            .update({ disponible: false })
            .eq("id", horarioId)

        await supabase.from("notificaciones").insert({
            tenant_id: tenant.id,
            cliente_id: cliente.id,
            sesion_id: session.id,
            tipo: "cita_nueva",
            mensaje: `Nueva cita de ${cliente.celular} para ${horario.fecha} a las ${horario.hora_inicio}`,
        })

        const fechaFormato = new Date(`${horario.fecha}T${horario.hora_inicio}`).toLocaleDateString("es-EC", {
            weekday: "long", day: "numeric", month: "long",
            hour: "2-digit", minute: "2-digit"
        })

        await updateSession(session.id, { step: "menu_principal" })

        const nombre = cliente.nombres_completos !== "Cliente WhatsApp"
            ? cliente.nombres_completos : "estimad@ cliente"

        return `✅ *¡Cita confirmada!*\n\n📅 ${fechaFormato}\n\nTe esperamos, ${nombre}. Si necesitas cambiar tu cita escribe *citas* o *agente*.\n\n¡Que tengas un excelente día! 🌟`
    }

    // VERIFICACIÓN DE CÉDULA
    if (state.step === "solicitar_cedula") {
        const cedula = text.replace(/\D/g, "")
        const intentos = (state.intentos_cedula || 0) + 1
        const maxIntentos = config?.intentos_cedula_max ?? 2

        if (cedula.length !== 10) {
            await updateSession(session.id, { ...state, intentos_cedula: intentos })
            if (intentos >= maxIntentos) {
                await activarModoManual(session, tenant, cliente)
                return "Has superado el número de intentos. Un agente te contactará. ⏳"
            }
            return `Por favor ingresa los 10 dígitos de tu cédula (intento ${intentos}/${maxIntentos}):`
        }

        const resultado = await validarCedulaAPI(cedula)

        if (!resultado.valida) {
            await updateSession(session.id, { ...state, intentos_cedula: intentos })
            if (intentos >= maxIntentos) {
                await activarModoManual(session, tenant, cliente)
                return "Cédula inválida. Has superado el límite de intentos. Un agente te contactará. ⏳"
            }
            return `❌ ${resultado.error || "Cédula inválida"}.\n\nIntento ${intentos}/${maxIntentos}. Intenta de nuevo:`
        }

        // Cédula ya registrada con otro celular
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
            return "⚠️ Esta cédula ya está registrada con otro número. Tu número ha sido registrado como contacto alternativo. Un agente te atenderá."
        }

        // Actualizar cliente
        const updateData: any = {
            ruc_ci: cedula,
            verificado: true,
            verificado_at: new Date().toISOString(),
        }
        if (resultado.nombre_completo) {
            updateData.nombres_completos = resultado.nombre_completo
        }
        await supabase.from("clientes").update(updateData).eq("id", cliente.id)

        const saludoMsg = resultado.nombre_completo
            ? `✅ Identidad verificada. Bienvenid@ *${resultado.nombre_completo}*.\n\nAhora selecciona el horario:`
            : `✅ Cédula verificada.\n\nAhora selecciona el horario:`

        const paso = state.propiedad_id ? "agendar_propiedad" : "agendar_proyecto"
        await updateSession(session.id, { ...state, step: paso, intentos_cedula: 0 })

        // Enviar saludo como mensaje de texto separado
        if (phoneNumberId && from) {
            await sendWhatsAppMessage(phoneNumberId, from, saludoMsg)
        }

        // Retornar los horarios como respuesta principal
        if (state.propiedad_id) {
            return await mostrarHorariosPropiedad(
                state.propiedad_id, config?.dias_max_cita ?? 7, session.id
            )
        } else {
            return await mostrarHorariosProyecto(
                state.proyecto_id, config?.dias_max_cita ?? 7, session.id
            )
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
                body: "¿Qué deseas hacer?",
                buttons: [
                    { id: "buscar_otro_sector", title: "🔍 Cambiar búsqueda" },
                    { id: "ver_proyectos", title: "🏗️ Ver proyectos" },
                    { id: "btn_volver", title: "🏠 Menú principal" },
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
        mensaje: `No entendió: "${text}"`,
    })

    return {
        tipo: "buttons",
        payload: {
            body: "No entendí tu mensaje 😅\n\n¿Qué deseas hacer?",
            buttons: [
                { id: "menu_principal", title: "🏠 Menú principal" },
                { id: "hablar_agente", title: "👤 Hablar con agente" },
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
    await supabase
        .from("chat_sesiones")
        .update({ modo: "manual" })
        .eq("id", session.id)

    await supabase.from("notificaciones").insert({
        tenant_id: tenant.id,
        cliente_id: cliente.id,
        sesion_id: session.id,
        tipo: "modo_manual",
        mensaje: `${cliente.celular} solicitó un agente`,
    })
}

async function obtenerUbicacion(
    ciudadId: number,
    sectorId: number
): Promise<{ ciudadNombre: string; sectorNombre: string }> {
    const [{ data: ciudad }, { data: sector }] = await Promise.all([
        supabase.from("ciudades").select("nombre").eq("id", ciudadId).maybeSingle(),
        supabase.from("sectores").select("nombre").eq("id", sectorId).maybeSingle(),
    ])
    return {
        ciudadNombre: (ciudad as any)?.nombre || "",
        sectorNombre: (sector as any)?.nombre || "",
    }
}

async function menuPrincipal(tenant: any, cliente: any, config: any): Promise<Respuesta> {
    const saludo = config?.saludo || `Hola 👋 Bienvenido a ${tenant.nombre}`
    const permiteProyectos = config?.permite_proyectos !== false
    const permiteAsesor = config?.permite_asesor !== false

    const { data: reservaVigente } = await supabase
        .from("reservas")
        .select("fecha, estado, propiedades:propiedad_id(nombre), proyectos:proyecto_id(nombre)")
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
        bodyText += `\n\n📅 Tienes una cita para *${nombre}* el ${fecha}.`
    }

    bodyText += "\n\n¿En qué puedo ayudarte?"

    const buttons: { id: string; title: string }[] = [
        { id: "btn_propiedades", title: "🏠 Ver propiedades" },
    ]
    if (permiteProyectos) buttons.push({ id: "btn_proyectos", title: "🏗️ Proyectos" })
    if (permiteAsesor) buttons.push({ id: "btn_asesor", title: "👤 Hablar con asesor" })

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
        .select("id, nombre, precio_desde, estado, fecha_entrega_estimada, ciudad_id, sector_id")
        .eq("tenant_id", tenantId)
        .eq("estado", "activo")
        .is("deleted_at", null)
        .limit(8)

    if (ciudadId) query = query.eq("ciudad_id", ciudadId)

    const { data } = await query

    if (!data?.length) {
        return {
            tipo: "buttons",
            payload: {
                body: "No tenemos proyectos disponibles en este momento.",
                buttons: [
                    { id: "btn_propiedades", title: "🏠 Ver propiedades" },
                    { id: "menu_principal", title: "🏠 Menú principal" },
                ]
            }
        }
    }

    const ciudadIds = [...new Set(data.map(p => p.ciudad_id).filter(Boolean))]
    const sectorIds = [...new Set(data.map((p: any) => p.sector_id).filter(Boolean))]

    const { data: ciudades } = await supabase.from("ciudades").select("id, nombre").in("id", ciudadIds)
    const { data: sectores } = await supabase.from("sectores").select("id, nombre").in("id", sectorIds)

    const ciudadMap: Record<number, string> = {}
    const sectorMap: Record<number, string> = {}
    ciudades?.forEach((c: any) => { ciudadMap[c.id] = c.nombre })
    sectores?.forEach((s: any) => { sectorMap[s.id] = s.nombre })

    if (data.length <= 3) {
        return {
            tipo: "buttons",
            payload: {
                header: "🏗️ Proyectos disponibles",
                body: data.map((p, i) =>
                    `${i + 1}. *${p.nombre}*\n   📍 ${sectorMap[(p as any).sector_id] || ""}, ${ciudadMap[p.ciudad_id] || ""}\n   💰 Desde $${Number(p.precio_desde || 0).toLocaleString("es-EC")}`
                ).join("\n\n"),
                buttons: data.map(p => ({ id: `proy_${p.id}`, title: p.nombre.slice(0, 20) }))
            }
        }
    }

    return {
        tipo: "list",
        payload: {
            header: "🏗️ Proyectos",
            body: "Selecciona el proyecto que te interesa:",
            buttonText: "Ver proyectos",
            sections: [{
                title: "Disponibles",
                rows: data.map(p => ({
                    id: `proy_${p.id}`,
                    title: p.nombre.slice(0, 24),
                    description: `${ciudadMap[p.ciudad_id] || ""} · Desde $${Number(p.precio_desde || 0).toLocaleString("es-EC")}`
                }))
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

    if (!data?.length) return "No hay unidades disponibles en este proyecto.\n\nEscribe *agente* para más información."

    const rows = data.map(p => {
        const hab = (p.ambientes as any)?.habitaciones
        const m2 = (p.dimensiones as any)?.m2_construccion || (p.dimensiones as any)?.m2_total
        const desc = [
            hab ? `${hab} hab` : null,
            m2 ? `${m2}m²` : null,
            `$${Number(p.precio).toLocaleString("es-EC")}`
        ].filter(Boolean).join(" · ")

        return { id: `prop_${p.id}`, title: p.nombre.slice(0, 24), description: desc }
    })

    return {
        tipo: "list",
        payload: {
            header: "🏠 Unidades disponibles",
            body: "Selecciona una unidad para ver detalles:",
            buttonText: "Ver unidades",
            sections: [{ title: "Disponibles", rows }]
        }
    }
}

async function listaTipoPropiedad(): Promise<Respuesta> {
    return {
        tipo: "list",
        payload: {
            body: "¿Qué tipo de propiedad buscas?",
            buttonText: "Seleccionar tipo",
            sections: [{
                title: "Tipos de propiedad",
                rows: [
                    { id: "tipo_casa", title: "🏠 Casa" },
                    { id: "tipo_departamento", title: "🏢 Departamento" },
                    { id: "tipo_terreno", title: "🌿 Terreno" },
                    { id: "tipo_comercial", title: "🏪 Local Comercial" },
                    { id: "tipo_oficina", title: "💼 Oficina" },
                ]
            }]
        }
    }
}

async function listaCiudades(): Promise<Respuesta> {
    const { data } = await supabase
        .from("ciudades")
        .select("id, nombre, provincia_id")
        .is("deleted_at", null)
        .order("nombre")
        .limit(10)

    if (!data?.length) return "Escribe el nombre de la ciudad donde buscas:"

    const provinciaIds = [...new Set(data.map(c => c.provincia_id).filter(Boolean))]
    const { data: provincias } = await supabase
        .from("provincias").select("id, nombre").in("id", provinciaIds)
    const provMap: Record<number, string> = {}
    provincias?.forEach((p: any) => { provMap[p.id] = p.nombre })

    return {
        tipo: "list",
        payload: {
            body: "¿En qué ciudad buscas?",
            buttonText: "Seleccionar ciudad",
            sections: [{
                title: "Ciudades",
                rows: data.map(c => ({
                    id: `ciudad_${c.id}`,
                    title: c.nombre,
                    description: provMap[c.provincia_id] || ""
                }))
            }]
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

    const rows: any[] = [{ id: "sector_todos", title: "📋 Todos los sectores" }]
    if (data?.length) {
        rows.push(...data.map(s => ({ id: `sector_${s.id}`, title: s.nombre })))
    }

    return {
        tipo: "list",
        payload: {
            body: `¿En qué sector de ${ciudadNombre}?`,
            buttonText: "Seleccionar sector",
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
        p_limite: 20 // Traer más para paginar en memoria
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
                body: "No encontré propiedades con esos criterios.\n\n¿Qué deseas hacer?",
                buttons: [
                    { id: "buscar_otro_sector", title: "🔍 Cambiar búsqueda" },
                    { id: "ver_proyectos", title: "🏗️ Ver proyectos" },
                    { id: "btn_volver", title: "🏠 Menú" },
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

    const rows = pagActual.map(p => ({
        id: `prop_${p.id}`,
        title: p.nombre.slice(0, 24),
        description: `$${Number(p.precio).toLocaleString("es-EC")} · ${p.ciudad_nombre || ""}`
    }))

    const navRows: any[] = []
    if (hayAnterior) navRows.push({
        id: "pagina_anterior",
        title: "⬅️ Página anterior",
        description: `Página ${pagina}`
    })
    if (hayMas) navRows.push({
        id: "pagina_siguiente",
        title: "➡️ Siguiente página",
        description: `Página ${pagina + 2} de ${totalPaginas}`
    })
    navRows.push({ id: "btn_volver", title: "🏠 Volver al menú" })

    const sections: any[] = [{
        title: `Propiedades (${inicio + 1}-${Math.min(inicio + ITEMS_POR_PAGINA, total)} de ${total})`,
        rows
    }]

    if (navRows.length > 0) {
        sections.push({ title: "Navegación", rows: navRows })
    }

    return {
        tipo: "list",
        payload: {
            header: `🏠 ${total} resultado(s)`,
            body: `Página ${pagina + 1} de ${totalPaginas}. Selecciona una propiedad:`,
            buttonText: "Ver propiedades",
            sections
        }
    }
}

async function mostrarHorariosPropiedad(
    propiedadId: number, diasMax: number, sessionId: number
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
        return {
            tipo: "buttons",
            payload: {
                body: "No hay horarios disponibles en este momento.",
                buttons: [
                    { id: "hablar_agente", title: "👤 Coordinar con agente" },
                    { id: "btn_volver", title: "↩️ Volver" },
                ]
            }
        }
    }

    const ids = data.map(h => h.id)
    const { data: sesion } = await supabase
        .from("chat_sesiones").select("contenido").eq("id", sessionId).single()
    await updateSession(sessionId, { ...sesion?.contenido, horarios_ids: ids })

    return {
        tipo: "list",
        payload: {
            header: "📅 Horarios disponibles",
            body: "Selecciona el horario para tu visita:",
            buttonText: "Ver horarios",
            sections: [{
                title: "Disponibles",
                rows: data.map(h => ({
                    id: `horario_${h.id}`,
                    title: new Date(h.fecha + "T00:00:00").toLocaleDateString("es-EC", {
                        weekday: "short", day: "numeric", month: "short"
                    }),
                    description: `🕐 ${h.hora_inicio} - ${h.hora_fin}`
                }))
            }]
        }
    }
}

async function mostrarHorariosProyecto(
    proyectoId: number, diasMax: number, sessionId: number
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
        return {
            tipo: "buttons",
            payload: {
                body: "No hay horarios disponibles para este proyecto.",
                buttons: [
                    { id: "hablar_agente", title: "👤 Coordinar con agente" },
                    { id: "btn_volver", title: "↩️ Volver" },
                ]
            }
        }
    }

    const ids = data.map(h => h.id)
    const { data: sesion } = await supabase
        .from("chat_sesiones").select("contenido").eq("id", sessionId).single()
    await updateSession(sessionId, { ...sesion?.contenido, horarios_ids: ids })

    return {
        tipo: "list",
        payload: {
            header: "📅 Horarios de visita al proyecto",
            body: "Selecciona el horario que prefieres:",
            buttonText: "Ver horarios",
            sections: [{
                title: "Disponibles",
                rows: data.map(h => ({
                    id: `horario_${h.id}`,
                    title: new Date(h.fecha + "T00:00:00").toLocaleDateString("es-EC", {
                        weekday: "short", day: "numeric", month: "short"
                    }),
                    description: `🕐 ${h.hora_inicio} - ${h.hora_fin}`
                }))
            }]
        }
    }
}

async function listarCitasCliente(clienteId: number, tenantId: number): Promise<Respuesta> {
    const { data } = await supabase
        .from("reservas")
        .select("fecha, estado, propiedades:propiedad_id(nombre), proyectos:proyecto_id(nombre)")
        .eq("cliente_id", clienteId)
        .eq("tenant_id", tenantId)
        .gte("fecha", new Date().toISOString())
        .is("deleted_at", null)
        .order("fecha", { ascending: true })
        .limit(5)

    if (!data?.length) {
        return {
            tipo: "buttons",
            payload: {
                body: "No tienes citas programadas.",
                buttons: [
                    { id: "btn_propiedades", title: "🏠 Buscar propiedades" },
                    { id: "menu_principal", title: "🏠 Menú principal" },
                ]
            }
        }
    }

    const citas = data.map((r: any, i) => {
        const prop = r.propiedades as any
        const proy = r.proyectos as any
        const fecha = new Date(r.fecha).toLocaleDateString("es-EC", {
            weekday: "short", day: "numeric", month: "short",
            hour: "2-digit", minute: "2-digit"
        })
        const nombre = prop?.nombre || proy?.nombre || "Visita"
        return `${i + 1}. *${nombre}*\n   📆 ${fecha} — ${r.estado}`
    }).join("\n\n")

    return {
        tipo: "buttons",
        payload: {
            header: "📅 Tus citas próximas",
            body: citas,
            buttons: [
                { id: "hablar_agente", title: "📝 Modificar cita" },
                { id: "btn_propiedades", title: "🏠 Ver más propiedades" },
                { id: "menu_principal", title: "🏠 Menú" },
            ]
        }
    }
}

function solicitarCedula(): Respuesta {
    return "Para agendar tu visita necesitamos verificar tu identidad.\n\nPor favor ingresa tu número de cédula (10 dígitos):"
}

function formatearDetallePropiedad(p: any): string {
    const dim = p.dimensiones || {}
    const amb = p.ambientes || {}
    const ext = p.exteriores || {}
    const est = p.estacionamiento || {}
    const extra = p.extras || {}
    const pago = Array.isArray(p.tipo_pago) ? p.tipo_pago.join(", ") : ""

    let res = ""
    res += `💰 $${Number(p.precio).toLocaleString("es-EC")}`
    if (p.precio_negociable) res += " (negociable)"
    res += "\n"
    if (dim.m2_construccion) res += `📐 ${dim.m2_construccion}m² construcción\n`
    if (dim.m2_terreno) res += `📐 ${dim.m2_terreno}m² terreno\n`
    if (amb.habitaciones) res += `🛏 ${amb.habitaciones} habitaciones\n`
    if (amb.banos) res += `🚿 ${amb.banos} baños\n`
    if (est.estacionamientos) res += `🚗 ${est.estacionamientos} estacionamiento(s)\n`
    if (ext.patio) res += `🌿 Patio\n`
    if (ext.jardin) res += `🌳 Jardín\n`
    if (ext.piscina) res += `🏊 Piscina\n`
    if (extra.amoblado) res += `🪑 Amoblado\n`
    if (pago) res += `💳 Acepta: ${pago}\n`
    res += `\n${p.descripcion || ""}`
    return res.trim()
}

function formatearDetalleProyecto(p: any): string {
    const amenidades = Array.isArray(p.amenidades) ? p.amenidades.join(", ") : ""
    const pago = Array.isArray(p.tipo_pago) ? p.tipo_pago.join(", ") : ""

    let res = ""
    if (p.precio_desde) res += `💰 Desde $${Number(p.precio_desde).toLocaleString("es-EC")}`
    if (p.precio_hasta) res += ` hasta $${Number(p.precio_hasta).toLocaleString("es-EC")}`
    res += "\n"
    if (p.fecha_entrega_estimada) {
        res += `📆 Entrega: ${new Date(p.fecha_entrega_estimada).toLocaleDateString("es-EC")}\n`
    }
    if (amenidades) res += `✨ ${amenidades}\n`
    if (pago) res += `💳 Acepta: ${pago}\n`
    res += `\n${p.descripcion || ""}`
    if (p.slogan) res += `\n_${p.slogan}_`
    return res.trim()
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

function emojiTipo(tipo: string): string {
    const emojis: Record<string, string> = {
        casa: "🏠", departamento: "🏢", terreno: "🌿", comercial: "🏪", oficina: "💼"
    }
    return emojis[tipo] || "🏠"
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