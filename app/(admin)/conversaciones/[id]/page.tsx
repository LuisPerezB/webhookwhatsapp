import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ChatClient from "./chat-client"

export default async function ChatPage({
    params
}: {
    params: { id: string }
}) {
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const sesionId = parseInt(params.id)

    // Sesión + cliente
    const { data: sesion } = await supabase
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

    if (!sesion) redirect("/dashboard/conversaciones")

    // Mensajes
    const { data: mensajes } = await supabase
        .from("mensajes")
        .select("id, origen, contenido, created_at")
        .eq("sesion_id", sesionId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(100)

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