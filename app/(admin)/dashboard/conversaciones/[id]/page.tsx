import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ChatClient from "./chat-client"

export default async function ChatPage({
    params
}: {
    params: { id: string }
}) {
    const { id } = await params
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const sesionId = parseInt(id)
    if (isNaN(sesionId)) redirect("/dashboard/conversaciones")

    // LOG TEMPORAL
    console.log("[Chat] sesionId:", sesionId)
    console.log("[Chat] tenantId:", session.tenantId)

    const { data: sesion, error } = await supabase
        .from("chat_sesiones")
        .select(`
            id, modo, updated_at, contenido, agente_id,
            clientes:cliente_id(
                id, nombres_completos, celular,
                ruc_ci, verificado, bloqueado
            )
        `)
        .eq("id", sesionId)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .single()

    // LOG TEMPORAL
    console.log("[Chat] sesion:", JSON.stringify(sesion))
    console.log("[Chat] error:", JSON.stringify(error))

    if (error || !sesion) {
        console.log("[Chat] Redirigiendo — sesion no encontrada")
        redirect("/dashboard/conversaciones")
    }

    // Mensajes
    const { data: mensajesRaw } = await supabase
        .from("mensajes")
        .select("id, origen, contenido, created_at")
        .eq("sesion_id", sesionId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })  // desc para traer los más recientes
        .limit(100)

    // Invertir para mostrar en orden cronológico
    const mensajes = (mensajesRaw || []).reverse()
    // Propiedades y proyectos para enviar desde el asesor
    const [{ data: propiedades }, { data: proyectos }] = await Promise.all([
        supabase
            .from("propiedades")
            .select("id, nombre, precio, tipo_operacion, tipo_propiedad, ciudad:ciudad_id(nombre)")
            .eq("tenant_id", session.tenantId)
            .eq("estado", "disponible")
            .is("deleted_at", null)
            .is("proyecto_id", null)
            .limit(20),
        supabase
            .from("proyectos")
            .select("id, nombre, precio_desde, ciudad:ciudad_id(nombre)")
            .eq("tenant_id", session.tenantId)
            .eq("estado", "activo")
            .is("deleted_at", null)
            .limit(10)
    ])

    // Marcar notificaciones como leídas
    await supabase
        .from("notificaciones")
        .update({ leida: true })
        .eq("sesion_id", sesionId)
        .eq("tenant_id", session.tenantId)

    const cliente = Array.isArray(sesion.clientes)
        ? sesion.clientes[0] : sesion.clientes

    return (
        <ChatClient
            sesion={{
                id: sesion.id,
                modo: sesion.modo,
                step: sesion.contenido?.step,
                updated_at: sesion.updated_at,
            }}
            cliente={cliente}
            mensajesIniciales={mensajes || []}
            propiedades={propiedades || []}
            proyectos={proyectos || []}
            agenteNombre={session.nombres}
        />
    )
}