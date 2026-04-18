import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { sendWhatsAppMessage } from "@/lib/whatsapp"

export async function POST(request: NextRequest) {
    const secret = request.headers.get("x-cron-secret")
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const ahora = new Date()
    const horaActual = ahora.getHours() // hora en UTC — ajustar a Ecuador (UTC-5)
    const horaEcuador = (horaActual - 5 + 24) % 24

    console.log(`[Cron] Ejecutando a las ${horaEcuador}:00 hora Ecuador`)

    let citasANotificar: any[] = []
    let tipoRecordatorio: "manana_temprano" | "hoy" = "hoy"

    if (horaEcuador === 8) {
        // 8am Ecuador — notificar citas de HOY que son después de las 10am
        const hoy = new Date()
        const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 10, 0, 0)
        const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59)

        // Convertir a UTC para Supabase
        const inicioUTC = new Date(inicioHoy.getTime() + 5 * 60 * 60 * 1000).toISOString()
        const finUTC = new Date(finHoy.getTime() + 5 * 60 * 60 * 1000).toISOString()

        const { data } = await supabase
            .from("reservas")
            .select(`
                id, fecha, estado, recordatorio_enviado,
                tenant_id,
                clientes:cliente_id(celular, nombres_completos),
                propiedades:propiedad_id(nombre),
                proyectos:proyecto_id(nombre)
            `)
            .in("estado", ["confirmada", "pendiente"])
            .gte("fecha", inicioUTC)
            .lte("fecha", finUTC)
            .eq("recordatorio_enviado", false)
            .is("deleted_at", null)

        citasANotificar = data || []
        tipoRecordatorio = "hoy"

    } else if (horaEcuador === 18) {
        // 6pm Ecuador — notificar citas de MAÑANA que son antes de las 10am
        const manana = new Date()
        manana.setDate(manana.getDate() + 1)

        const inicioManana = new Date(manana.getFullYear(), manana.getMonth(), manana.getDate(), 0, 0, 0)
        const limiteManana = new Date(manana.getFullYear(), manana.getMonth(), manana.getDate(), 10, 0, 0)

        const inicioUTC = new Date(inicioManana.getTime() + 5 * 60 * 60 * 1000).toISOString()
        const limiteUTC = new Date(limiteManana.getTime() + 5 * 60 * 60 * 1000).toISOString()

        const { data } = await supabase
            .from("reservas")
            .select(`
                id, fecha, estado, recordatorio_enviado,
                tenant_id,
                clientes:cliente_id(celular, nombres_completos),
                propiedades:propiedad_id(nombre),
                proyectos:proyecto_id(nombre)
            `)
            .in("estado", ["confirmada", "pendiente"])
            .gte("fecha", inicioUTC)
            .lte("fecha", limiteUTC)
            .eq("recordatorio_enviado", false)
            .is("deleted_at", null)

        citasANotificar = data || []
        tipoRecordatorio = "manana_temprano"

    } else {
        // No es hora de enviar recordatorios
        return NextResponse.json({
            ok: true,
            mensaje: `No es hora de recordatorios (hora Ecuador: ${horaEcuador}:00)`,
            enviados: 0
        })
    }

    if (!citasANotificar.length) {
        return NextResponse.json({
            ok: true,
            mensaje: "Sin citas para notificar",
            enviados: 0
        })
    }

    let enviados = 0

    for (const cita of citasANotificar) {
        const enviado = await enviarRecordatorio(cita, tipoRecordatorio)
        if (enviado) {
            await supabase
                .from("reservas")
                .update({ recordatorio_enviado: true })
                .eq("id", cita.id)
            enviados++
        }
    }

    console.log(`[Cron] Recordatorios enviados: ${enviados}/${citasANotificar.length}`)
    return NextResponse.json({ ok: true, enviados, total: citasANotificar.length })
}

async function enviarRecordatorio(
    cita: any,
    tipo: "hoy" | "manana_temprano"
): Promise<boolean> {
    try {
        const cliente = Array.isArray(cita.clientes) ? cita.clientes[0] : cita.clientes
        const prop = Array.isArray(cita.propiedades) ? cita.propiedades[0] : cita.propiedades
        const proy = Array.isArray(cita.proyectos) ? cita.proyectos[0] : cita.proyectos

        if (!cliente?.celular) return false

        const nombreProp = prop?.nombre || proy?.nombre || "la propiedad"
        const hora = new Date(cita.fecha).toLocaleTimeString("es-EC", {
            hour: "2-digit", minute: "2-digit"
        })
        const nombreCliente = cliente.nombres_completos !== "Cliente WhatsApp"
            ? ` ${cliente.nombres_completos.split(" ")[0]}` : ""

        // Token del tenant
        const { data: wn } = await supabase
            .from("whatsapp_numbers")
            .select("phone_number_id, access_token")
            .eq("tenant_id", cita.tenant_id)
            .eq("activo", true)
            .is("deleted_at", null)
            .single()

        if (!wn) return false
        const token = wn.access_token || process.env.WHATSAPP_TOKEN

        // Mensaje según tipo
        const msgCliente = tipo === "hoy"
            ? `Recordatorio de visita 📅\n\nHola${nombreCliente}! Hoy tienes una visita programada.\n\n🏠 ${nombreProp}\n🕐 ${hora}\n\nTe esperamos. Escribe 'agente' si necesitas reprogramar.`
            : `Recordatorio de visita 📅\n\nHola${nombreCliente}! Mañana temprano tienes una visita programada.\n\n🏠 ${nombreProp}\n🕐 ${hora}\n\nTe esperamos. Escribe 'agente' si necesitas reprogramar.`

        await sendWhatsAppMessage(
            wn.phone_number_id,
            cliente.celular,
            msgCliente,
            token
        )

        // Notificación al asesor
        const cuando = tipo === "hoy" ? "hoy" : "mañana temprano"
        await supabase.from("notificaciones").insert({
            tenant_id: cita.tenant_id,
            tipo: "recordatorio_cita",
            mensaje: `Recordatorio enviado a ${cliente.celular} — cita ${cuando} a las ${hora} en ${nombreProp}`
        })

        return true

    } catch (err) {
        console.error("[Cron] Error:", err)
        return false
    }
}