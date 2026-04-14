import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ConversacionesClient from "./conversaciones-client"

export default async function ConversacionesPage() {
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const { data: sesiones } = await supabase
        .from("chat_sesiones")
        .select(`
            id, modo, updated_at, contenido,
            clientes:cliente_id(id, nombres_completos, celular, verificado)
        `)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(50)

    const conversaciones = await Promise.all(
        (sesiones || []).map(async (s: any) => {
            const cliente = Array.isArray(s.clientes) ? s.clientes[0] : s.clientes

            const [{ data: msg }, { count }] = await Promise.all([
                supabase
                    .from("mensajes")
                    .select("contenido, origen, created_at")
                    .eq("sesion_id", s.id)
                    .is("deleted_at", null)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from("notificaciones")
                    .select("*", { count: "exact", head: true })
                    .eq("sesion_id", s.id)
                    .eq("leida", false)
                    .is("deleted_at", null)
            ])

            return {
                id: s.id,
                modo: s.modo,
                updated_at: s.updated_at,
                step: s.contenido?.step,
                cliente: {
                    id: cliente?.id,
                    nombre: cliente?.nombres_completos || "Cliente WhatsApp",
                    celular: cliente?.celular || "",
                    verificado: cliente?.verificado || false,
                },
                ultimo_mensaje: msg || null,
                notificaciones: count || 0,
            }
        })
    )

    return <ConversacionesClient conversaciones={conversaciones} />
}