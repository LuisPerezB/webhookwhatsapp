import { NextRequest } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session) return new Response("No autorizado", { status: 401 })

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: any) => {
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                    )
                } catch {}
            }

            // Enviar ping inicial
            send({ tipo: "conectado", tenantId: session.tenantId })

            // Polling interno cada 3 segundos — empuja al cliente solo si hay cambios
            let ultimaActualizacion = new Date().toISOString()

            const interval = setInterval(async () => {
                try {
                    // Mensajes nuevos desde la última actualización
                    const { data: mensajesNuevos } = await supabase
                        .from("mensajes")
                        .select(`
                            id, sesion_id, origen, contenido, created_at,
                            chat_sesiones!inner(tenant_id, modo)
                        `)
                        .eq("chat_sesiones.tenant_id", session.tenantId)
                        .gt("created_at", ultimaActualizacion)
                        .is("deleted_at", null)
                        .order("created_at", { ascending: true })

                    // Notificaciones nuevas
                    const { data: notifsNuevas } = await supabase
                        .from("notificaciones")
                        .select("id, tipo, mensaje, sesion_id, created_at")
                        .eq("tenant_id", session.tenantId)
                        .eq("leida", false)
                        .gt("created_at", ultimaActualizacion)
                        .is("deleted_at", null)

                    const ahora = new Date().toISOString()

                    if (mensajesNuevos?.length || notifsNuevas?.length) {
                        send({
                            tipo: "actualizacion",
                            mensajes: mensajesNuevos || [],
                            notificaciones: notifsNuevas || [],
                            timestamp: ahora
                        })
                        ultimaActualizacion = ahora
                    } else {
                        // Ping para mantener conexión viva
                        send({ tipo: "ping", timestamp: ahora })
                    }
                } catch {
                    clearInterval(interval)
                }
            }, 3000)

            // Cerrar cuando el cliente desconecta
            request.signal.addEventListener("abort", () => {
                clearInterval(interval)
                try { controller.close() } catch {}
            })
        }
    })

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    })
}