import { supabase } from "./supabase"
import {
    sendWhatsAppMessage,
    sendWhatsAppButtons,
    sendWhatsAppList,
    sendWhatsAppImage,
    extraerTextoMensaje,
} from "./whatsapp"
import { handleMessage, handleLink } from "./chatbot"

export async function dispatchMessage({
    phoneNumberId,
    from,
    message,
}: {
    phoneNumberId: string
    from: string
    message: any
}) {
    const phoneNumberIdStr = String(phoneNumberId).trim()

    // 1. WHATSAPP NUMBER
    const { data: whatsappNumber } = await supabase
        .from("whatsapp_numbers")
        .select("*")
        .eq("phone_number_id", phoneNumberIdStr)
        .eq("activo", true)
        .is("deleted_at", null)
        .single()

    if (!whatsappNumber) {
        console.log("[Dispatcher] Número no encontrado:", phoneNumberIdStr)
        return
    }

    // 2. TENANT
    const { data: tenant } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", whatsappNumber.tenant_id)
        .eq("activo", true)
        .is("deleted_at", null)
        .single()

    if (!tenant) {
        console.log("[Dispatcher] Tenant inactivo:", whatsappNumber.tenant_id)
        return
    }

    // Verificar suscripción vigente
    const { data: userActivo } = await supabase
        .from("users")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .eq("suscription_status", "active")
        .gt("paid_until", new Date().toISOString())
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle()

    if (!userActivo) {
        console.log("[Dispatcher] Sin suscripción vigente:", tenant.id)
        return
    }

    // 3. CONFIG
    const { data: configData } = await supabase
        .from("tenant_config")
        .select("config")
        .eq("tenant_id", tenant.id)
        .is("deleted_at", null)
        .maybeSingle()

    const config = configData?.config ?? {}

    if (config.bot_activo === false) {
        console.log("[Dispatcher] Bot desactivado:", tenant.id)
        return
    }

    // 4. CLIENTE GLOBAL
    let { data: cliente } = await supabase
        .from("clientes")
        .select("*")
        .eq("celular", from)
        .is("deleted_at", null)
        .maybeSingle()

    if (!cliente) {
        const { data, error } = await supabase
            .from("clientes")
            .insert({ celular: from, nombres_completos: "Cliente WhatsApp" })
            .select()
            .single()

        if (error || !data) {
            console.error("[Dispatcher] Error creando cliente:", error?.message)
            return
        }
        cliente = data
    }

    if (cliente.bloqueado) {
        console.log("[Dispatcher] Cliente bloqueado:", from)
        return
    }

    // 5. RELACIÓN CLIENTE - TENANT
    let { data: relacion } = await supabase
        .from("cliente_tenants")
        .select("*")
        .eq("cliente_id", cliente.id)
        .eq("tenant_id", tenant.id)
        .is("deleted_at", null)
        .maybeSingle()

    const esNuevoLead = !relacion

    if (!relacion) {
        const { data } = await supabase
            .from("cliente_tenants")
            .insert({ cliente_id: cliente.id, tenant_id: tenant.id })
            .select()
            .single()
        relacion = data
    } else {
        await supabase
            .from("cliente_tenants")
            .update({ ultimo_contacto: new Date().toISOString() })
            .eq("id", relacion.id)
    }

    // 6. EXTRAER TEXTO
    const { texto: textoMensaje, buttonId } = extraerTextoMensaje(message)

    // 7. DETECTAR LINK
    const textoCompleto = message.text?.body || textoMensaje || ""
    const linkPattern = /(propiedad|proyecto|catalogo)-(\d+)-(\d+)/
    const linkMatch = textoCompleto.match(linkPattern)

    if (linkMatch) {
        const slug = linkMatch[0]
        const { data: linkRows } = await supabase
            .rpc("resolver_link", { p_slug: slug })

        const linkData = Array.isArray(linkRows) ? linkRows[0] : linkRows

        if (linkData?.valido) {
            const session = await obtenerOCrearSesion(cliente.id, tenant.id)
            if (!session) return

            await guardarMensaje(session, tenant.id, cliente.id, textoCompleto, message.id)

            const respuesta = await handleLink({
                tenant,
                cliente,
                session,
                linkData,
                phoneNumberId: phoneNumberIdStr,
                config,
            })

            if (respuesta) {
                await enviarYGuardar(phoneNumberIdStr, from, respuesta, session, tenant.id, cliente.id)
            }
            return
        }
    }

    // 8. SESIÓN
    let session = await obtenerSesionActiva(cliente.id, tenant.id, config)

    if (!session) {
        session = await crearSesion(cliente.id, tenant.id)
        if (!session) return

        if (esNuevoLead && config.notificar_lead_nuevo !== false) {
            await supabase.from("notificaciones").insert({
                tenant_id: tenant.id,
                cliente_id: cliente.id,
                sesion_id: session.id,
                tipo: "lead_nuevo",
                mensaje: `Nuevo lead: ${from}`,
            })
        }
    }

    // 9. GUARDAR MENSAJE ENTRANTE
    await guardarMensaje(
        session, tenant.id, cliente.id,
        textoMensaje || "[interactivo]", message.id
    )

    // 10. MODO MANUAL / PAUSADO
    if (session.modo === "manual" || session.modo === "pausado") {
        if (session.modo === "manual" && config?.tiempo_manual_min) {
            const tiempoManualMs = config.tiempo_manual_min * 60 * 1000
            const tiempoEnManual = Date.now() - new Date(session.updated_at).getTime()

            if (tiempoEnManual > tiempoManualMs) {
                await supabase
                    .from("chat_sesiones")
                    .update({
                        modo: "automatico",
                        agente_id: null,
                        contenido: { step: "inicio" },
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", session.id)

                const { data: sessionReactivada } = await supabase
                    .from("chat_sesiones")
                    .select("*")
                    .eq("id", session.id)
                    .single()

                session = sessionReactivada
            } else {
                await procesarRespuestaEnModoManual({
                    session, tenant, cliente,
                    textoMensaje: textoMensaje || "[interactivo]",
                })
                return
            }
        } else {
            await procesarRespuestaEnModoManual({
                session, tenant, cliente,
                textoMensaje: textoMensaje || "[interactivo]",
            })
            return
        }
    }

    // 11. COMANDO DE CONTROL
    const esComando = await procesarComandoControl({
        texto: textoMensaje,
        buttonId,
        from,
        tenant,
        config,
        phoneNumberId: phoneNumberIdStr,
        session,
    })
    if (esComando) return

    // 12. CHATBOT
    const respuesta = await handleMessage({
        tenant,
        cliente,
        session,
        message,
        textoMensaje,
        buttonId,
        phoneNumberId: phoneNumberIdStr,
        from,
        config,
    })

    // 13. RESPONDER Y GUARDAR
    if (respuesta) {
        await enviarYGuardar(phoneNumberIdStr, from, respuesta, session, tenant.id, cliente.id)
    }
}

// =========================
// HELPERS
// =========================

async function obtenerSesionActiva(
    clienteId: number,
    tenantId: number,
    config: any
): Promise<any | null> {
    const { data: session } = await supabase
        .from("chat_sesiones")
        .select("*")
        .eq("cliente_id", clienteId)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!session) return null

    const INACTIVIDAD_MIN = config?.tiempo_inactividad_min ?? 15
    const INACTIVIDAD_MS = INACTIVIDAD_MIN * 60 * 1000
    const EXPIRACION_MS = 24 * 60 * 60 * 1000
    const ahora = Date.now()
    const ultimaActividad = new Date(session.updated_at).getTime()
    const inactiva = ahora - ultimaActividad > INACTIVIDAD_MS
    const expirada = ahora - ultimaActividad > EXPIRACION_MS

    if (inactiva) {
        if (expirada) {
            await supabase
                .from("chat_sesiones")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", session.id)
            return null
        }

        await supabase
            .from("chat_sesiones")
            .update({
                contenido: { step: "inicio" },
                modo: "automatico",
                agente_id: null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", session.id)

        const { data: reset } = await supabase
            .from("chat_sesiones")
            .select("*")
            .eq("id", session.id)
            .single()

        return reset
    }

    return session
}

async function obtenerOCrearSesion(
    clienteId: number,
    tenantId: number
): Promise<any | null> {
    const { data: session } = await supabase
        .from("chat_sesiones")
        .select("*")
        .eq("cliente_id", clienteId)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (session) return session
    return await crearSesion(clienteId, tenantId)
}

async function crearSesion(
    clienteId: number,
    tenantId: number
): Promise<any | null> {
    const { data, error } = await supabase
        .from("chat_sesiones")
        .insert({
            cliente_id: clienteId,
            tenant_id: tenantId,
            contenido: { step: "inicio" },
            modo: "automatico",
        })
        .select()
        .single()

    if (error) {
        console.error("[Dispatcher] Error creando sesión:", error.message)
        return null
    }
    return data
}

async function guardarMensaje(
    session: any,
    tenantId: number,
    clienteId: number,
    contenido: string,
    whatsappMessageId?: string
) {
    await supabase.from("mensajes").insert({
        sesion_id: session.id,
        tenant_id: tenantId,
        cliente_id: clienteId,
        origen: "cliente",
        contenido,
        whatsapp_message_id: whatsappMessageId,
    })

    await supabase
        .from("chat_sesiones")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", session.id)
}

async function enviarYGuardar(
    phoneNumberId: string,
    to: string,
    respuesta: string | { tipo: "buttons" | "list" | "image"; payload: any },
    session: any,
    tenantId: number,
    clienteId: number
) {
    let messageId: string | null = null
    let contenido = ""

    try {
        if (typeof respuesta === "string") {
            messageId = await sendWhatsAppMessage(phoneNumberId, to, respuesta)
            contenido = respuesta
        } else if (respuesta.tipo === "buttons") {
            const { body, buttons, header, footer } = respuesta.payload
            messageId = await sendWhatsAppButtons(phoneNumberId, to, body, buttons, header, footer)
            contenido = body
        } else if (respuesta.tipo === "list") {
            const { body, buttonText, sections, header, footer } = respuesta.payload
            messageId = await sendWhatsAppList(phoneNumberId, to, body, buttonText, sections, header, footer)
            contenido = body
        } else if (respuesta.tipo === "image") {
            const { imageUrl, caption } = respuesta.payload
            messageId = await sendWhatsAppImage(phoneNumberId, to, imageUrl, caption)
            contenido = caption || imageUrl
        }

        await supabase.from("mensajes").insert({
            sesion_id: session.id,
            tenant_id: tenantId,
            cliente_id: clienteId,
            origen: "bot",
            contenido,
            whatsapp_message_id: messageId,
        })

    } catch (error: any) {
        console.error("[Dispatcher] Error enviando respuesta:", error.message)
    }
}

async function procesarRespuestaEnModoManual({
    session, tenant, cliente, textoMensaje,
}: {
    session: any
    tenant: any
    cliente: any
    textoMensaje: string
}) {
    const { data: ultimoAsesor } = await supabase
        .from("mensajes")
        .select("contenido, created_at")
        .eq("sesion_id", session.id)
        .eq("origen", "agente")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    const { data: ultimoCliente } = await supabase
        .from("mensajes")
        .select("contenido, created_at")
        .eq("sesion_id", session.id)
        .eq("origen", "cliente")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    const asesorEsperaRespuesta = ultimoAsesor && (
        !ultimoCliente ||
        new Date(ultimoAsesor.created_at) > new Date(ultimoCliente.created_at)
    )

    const msg = asesorEsperaRespuesta
        ? `${cliente.celular} respondió al asesor: "${textoMensaje.slice(0, 100)}"`
        : `${cliente.celular} escribió (modo manual): "${textoMensaje.slice(0, 100)}"`

    await supabase.from("notificaciones").insert({
        tenant_id: tenant.id,
        cliente_id: cliente.id,
        sesion_id: session.id,
        tipo: "modo_manual",
        mensaje: msg,
    })

    await supabase
        .from("chat_sesiones")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", session.id)
}

async function procesarComandoControl({
    texto, buttonId, from, tenant, config, phoneNumberId, session,
}: any): Promise<boolean> {
    const botControlNumbers: string[] = config.bot_control_numbers ?? []

    // Normalizar — quitar +, espacios y guiones para comparar
    const fromNorm = from.replace(/[\s+\-]/g, "")
    const match = botControlNumbers.some(n =>
        n.replace(/[\s+\-]/g, "") === fromNorm
    )

    if (!match) return false

    const cmd = (texto || "").toLowerCase().trim()
    let respuesta = ""
    let esComando = true

    if (cmd.startsWith("modo manual")) {
        const celular = cmd.replace("modo manual", "").trim()
        await cambiarModoSesion(celular, tenant.id, "manual")
        respuesta = `✅ Modo manual activado para ${celular}`
    } else if (cmd.startsWith("modo auto")) {
        const celular = cmd.replace("modo auto", "").trim()
        await cambiarModoSesion(celular, tenant.id, "automatico")
        respuesta = `✅ Modo automático activado para ${celular}`
    } else if (cmd.startsWith("pausar")) {
        const celular = cmd.replace("pausar", "").trim()
        await cambiarModoSesion(celular, tenant.id, "pausado")
        respuesta = `⏸️ Bot pausado para ${celular}`
    } else if (cmd === "citas hoy") {
        respuesta = await resumenCitasHoy(tenant.id)
    } else if (cmd === "leads hoy") {
        respuesta = await resumenLeadsHoy(tenant.id)
    } else {
        esComando = false
    }

    if (esComando && respuesta) {
        await sendWhatsAppMessage(phoneNumberId, from, respuesta)
        await supabase.from("bot_comandos").insert({
            tenant_id: tenant.id,
            user_id: 1,
            comando: cmd.split(" ")[0] as any,
            parametro: cmd,
            resultado: respuesta,
        })
    }

    return esComando
}

async function cambiarModoSesion(
    celular: string,
    tenantId: number,
    modo: "automatico" | "manual" | "pausado"
) {
    const { data: cliente } = await supabase
        .from("clientes")
        .select("id")
        .eq("celular", celular)
        .maybeSingle()

    if (!cliente) return

    const updateData: any = { modo }
    if (modo === "automatico") {
        updateData.agente_id = null
        updateData.contenido = { step: "inicio" }
    }

    await supabase
        .from("chat_sesiones")
        .update(updateData)
        .eq("cliente_id", cliente.id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
}

async function resumenCitasHoy(tenantId: number): Promise<string> {
    const hoy = new Date().toISOString().split("T")[0]

    const { data } = await supabase
        .from("reservas")
        .select(`fecha, estado, clientes(nombres_completos, celular), propiedades(nombre), proyectos(nombre)`)
        .eq("tenant_id", tenantId)
        .gte("fecha", `${hoy}T00:00:00`)
        .lte("fecha", `${hoy}T23:59:59`)
        .is("deleted_at", null)

    if (!data?.length) return "📅 No hay citas para hoy."

    let res = `📅 Citas de hoy (${data.length}):\n\n`
    data.forEach((r: any, i) => {
        const hora = new Date(r.fecha).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })
        const nombre = r.propiedades?.nombre || r.proyectos?.nombre || "Visita"
        res += `${i + 1}. ${hora} — ${r.clientes?.nombres_completos}\n   📍 ${nombre} — ${r.estado}\n\n`
    })
    return res
}

async function resumenLeadsHoy(tenantId: number): Promise<string> {
    const hoy = new Date().toISOString().split("T")[0]

    const { data } = await supabase
        .from("cliente_tenants")
        .select("primer_contacto, clientes(nombres_completos, celular)")
        .eq("tenant_id", tenantId)
        .gte("primer_contacto", `${hoy}T00:00:00`)
        .is("deleted_at", null)

    if (!data?.length) return "👤 No hay leads nuevos hoy."

    let res = `👤 Leads de hoy (${data.length}):\n\n`
    data.forEach((l: any, i) => {
        res += `${i + 1}. ${l.clientes?.nombres_completos} — ${l.clientes?.celular}\n`
    })
    return res
}