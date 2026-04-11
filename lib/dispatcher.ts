import { supabase } from "./supabase"
import { sendWhatsAppMessage } from "./whatsapp"
import { handleMessage } from "./chatbot"

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

    // =========================
    // 1. TENANT
    // =========================
    const { data: whatsappNumber } = await supabase
        .from("whatsapp_numbers")
        .select("*, tenants(*), tenant_config(config)")
        .eq("phone_number_id", phoneNumberIdStr)
        .is("deleted_at", null)
        .single()

    if (!whatsappNumber) {
        console.log("[Dispatcher] Tenant no encontrado para:", phoneNumberIdStr)
        return
    }

    const tenant = whatsappNumber.tenants
    const config = whatsappNumber.tenant_config?.config ?? {}

    // =========================
    // 2. CLIENTE GLOBAL
    // =========================
    let { data: cliente } = await supabase
        .from("clientes")
        .select("*")
        .eq("celular", from)
        .is("deleted_at", null)
        .maybeSingle()

    if (!cliente) {
        const { data, error } = await supabase
            .from("clientes")
            .insert({
                celular: from,
                nombres_completos: "Cliente WhatsApp",
            })
            .select()
            .single()

        if (error || !data) {
            console.error("[Dispatcher] Error creando cliente:", error?.message)
            return
        }
        cliente = data
    }

    // Guard: cliente bloqueado
    if (cliente.bloqueado) {
        console.log("[Dispatcher] Cliente bloqueado:", from)
        return
    }

    // =========================
    // 3. RELACIÓN CLIENTE - TENANT
    // =========================
    let { data: relacion } = await supabase
        .from("cliente_tenants")
        .select("*")
        .eq("cliente_id", cliente.id)
        .eq("tenant_id", tenant.id)
        .is("deleted_at", null)
        .maybeSingle()

    if (!relacion) {
        const { data } = await supabase
            .from("cliente_tenants")
            .insert({
                cliente_id: cliente.id,
                tenant_id: tenant.id,
                primer_contacto: new Date().toISOString(),
                ultimo_contacto: new Date().toISOString(),
            })
            .select()
            .single()
        relacion = data

        // Notificar lead nuevo
        if (config.notificar_lead_nuevo) {
            await crearNotificacion({
                tenant_id: tenant.id,
                cliente_id: cliente.id,
                sesion_id: null,
                tipo: "lead_nuevo",
                mensaje: `Nuevo lead: ${from}`,
            })
        }
    } else {
        await supabase
            .from("cliente_tenants")
            .update({ ultimo_contacto: new Date().toISOString() })
            .eq("id", relacion.id)
    }

    // =========================
    // 4. SESIÓN CON EXPIRACIÓN POR INACTIVIDAD
    // =========================
    let { data: session } = await supabase
        .from("chat_sesiones")
        .select("*")
        .eq("cliente_id", cliente.id)
        .eq("tenant_id", tenant.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    const INACTIVIDAD_MS = 10 * 60 * 1000 // 10 minutos
    const EXPIRACION_MS = 24 * 60 * 60 * 1000 // 24 horas

    const ahora = new Date().getTime()
    const ultimaActividad = session
        ? new Date(session.updated_at).getTime()
        : 0

    const inactiva = ahora - ultimaActividad > INACTIVIDAD_MS
    const expirada = ahora - ultimaActividad > EXPIRACION_MS

    if (session && inactiva) {
        if (expirada) {
            // Soft delete de sesión vieja
            await supabase
                .from("chat_sesiones")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", session.id)
        } else {
            // Reiniciar estado pero mantener sesión — solo limpia el flujo
            await supabase
                .from("chat_sesiones")
                .update({
                    contenido: { step: "inicio" },
                    modo: "automatico",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", session.id)

            // Recargar sesión actualizada
            const { data: sessionReset } = await supabase
                .from("chat_sesiones")
                .select("*")
                .eq("id", session.id)
                .single()

            session = sessionReset
        }
    }

    // Crear sesión nueva si no existe o fue eliminada
    if (!session || session.deleted_at) {
        const { data, error } = await supabase
            .from("chat_sesiones")
            .insert({
                cliente_id: cliente.id,
                tenant_id: tenant.id,
                contenido: { step: "inicio" },
                modo: "automatico",
            })
            .select()
            .single()

        if (error || !data) {
            console.error("[Dispatcher] Error creando sesión:", error?.message)
            return
        }
        session = data
    }

    // =========================
    // 5. GUARDAR MENSAJE ENTRANTE
    // =========================
    const textoMensaje = message.text?.body || "[mensaje no textual]"

    await supabase.from("mensajes").insert({
        sesion_id: session.id,
        tenant_id: tenant.id,
        cliente_id: cliente.id,
        origen: "cliente",
        contenido: textoMensaje,
        whatsapp_message_id: message.id,
    })

    // Actualizar updated_at de la sesión
    await supabase
        .from("chat_sesiones")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", session.id)

    // =========================
    // 6. VERIFICAR MODO
    // Si está en modo manual, el bot no responde
    // =========================
    if (session.modo === "manual" || session.modo === "pausado") {
        console.log("[Dispatcher] Sesión en modo:", session.modo, "— bot no responde")
        return
    }

    // =========================
    // 7. VERIFICAR COMANDO DE CONTROL
    // El agente puede escribir al bot para cambiar modo
    // =========================
    const esComandoControl = await procesarComandoControl({
        texto: textoMensaje,
        from,
        tenant,
        config,
        session,
    })

    if (esComandoControl) return

    // =========================
    // 8. CHATBOT
    // =========================
    const response = await handleMessage({
        tenant,
        cliente,
        session,
        message,
        config,
    })

    // =========================
    // 9. RESPONDER Y GUARDAR
    // =========================
    if (response) {
        const whatsappMessageId = await sendWhatsAppMessage(
            phoneNumberIdStr,
            from,
            response
        )

        await supabase.from("mensajes").insert({
            sesion_id: session.id,
            tenant_id: tenant.id,
            cliente_id: cliente.id,
            origen: "bot",
            contenido: response,
            whatsapp_message_id: whatsappMessageId,
        })
    }
}

// =========================
// COMANDO DE CONTROL
// El agente escribe al bot para cambiar el modo de una sesión
// Comandos: "modo manual 593964090970"
//           "modo auto 593964090970"
//           "pausar 593964090970"
//           "citas hoy"
//           "leads hoy"
// =========================
async function procesarComandoControl({
    texto,
    from,
    tenant,
    config,
    session,
}: any): Promise<boolean> {

    const botControlNumbers: string[] = config.bot_control_numbers ?? []
    if (!botControlNumbers.includes(from)) return false

    const cmd = texto.toLowerCase().trim()
    let respuesta = ""
    let esComando = true

    // modo manual <celular>
    if (cmd.startsWith("modo manual")) {
        const celular = cmd.replace("modo manual", "").trim()
        await cambiarModoSesion(celular, tenant.id, "manual")
        respuesta = `✅ Modo manual activado para ${celular}`

        // modo auto <celular>
    } else if (cmd.startsWith("modo auto")) {
        const celular = cmd.replace("modo auto", "").trim()
        await cambiarModoSesion(celular, tenant.id, "automatico")
        respuesta = `✅ Modo automático activado para ${celular}`

        // pausar <celular>
    } else if (cmd.startsWith("pausar")) {
        const celular = cmd.replace("pausar", "").trim()
        await cambiarModoSesion(celular, tenant.id, "pausado")
        respuesta = `⏸️ Bot pausado para ${celular}`

        // citas hoy
    } else if (cmd === "citas hoy") {
        respuesta = await resumenCitasHoy(tenant.id)

        // leads hoy
    } else if (cmd === "leads hoy") {
        respuesta = await resumenLeadsHoy(tenant.id)

    } else {
        esComando = false
    }

    if (esComando && respuesta) {
        await sendWhatsAppMessage(
            session.phoneNumberId ?? "",
            from,
            respuesta
        )

        await supabase.from("bot_comandos").insert({
            tenant_id: tenant.id,
            user_id: 1, // TODO: resolver user_id desde celular del agente
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

    await supabase
        .from("chat_sesiones")
        .update({ modo })
        .eq("cliente_id", cliente.id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
}

async function resumenCitasHoy(tenantId: number): Promise<string> {
    const hoy = new Date().toISOString().split("T")[0]

    const { data } = await supabase
        .from("reservas")
        .select("fecha, estado, clientes(nombres_completos, celular), propiedades(nombre)")
        .eq("tenant_id", tenantId)
        .gte("fecha", `${hoy}T00:00:00`)
        .lte("fecha", `${hoy}T23:59:59`)
        .is("deleted_at", null)

    if (!data?.length) return "📅 No hay citas para hoy."

    let res = `📅 Citas de hoy (${data.length}):\n\n`
    data.forEach((r: any, i: number) => {
        const hora = new Date(r.fecha).toLocaleTimeString("es-EC", {
            hour: "2-digit", minute: "2-digit"
        })
        res += `${i + 1}. ${hora} — ${r.clientes?.nombres_completos} (${r.clientes?.celular})\n`
        res += `   📍 ${r.propiedades?.nombre ?? "Propiedad"} — ${r.estado}\n\n`
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
    data.forEach((l: any, i: number) => {
        res += `${i + 1}. ${l.clientes?.nombres_completos} — ${l.clientes?.celular}\n`
    })

    return res
}

async function crearNotificacion({
    tenant_id,
    cliente_id,
    sesion_id,
    tipo,
    mensaje,
}: {
    tenant_id: number
    cliente_id: number
    sesion_id: number | null
    tipo: string
    mensaje: string
}) {
    if (!sesion_id) return

    await supabase.from("notificaciones").insert({
        tenant_id,
        cliente_id,
        sesion_id,
        tipo,
        mensaje,
    })
}