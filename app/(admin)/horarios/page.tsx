import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import HorariosClient from "./horarios-client"

export default async function HorariosPage() {
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0]
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 2, 0).toISOString().split("T")[0]

    const [{ data: horarios }, { data: propiedades }, { data: proyectos }] = await Promise.all([
        supabase
            .from("horarios_disponibles")
            .select(`
                id, fecha, hora_inicio, hora_fin, disponible,
                propiedad:propiedad_id(id, nombre),
                proyecto:proyecto_id(id, nombre)
            `)
            .eq("tenant_id", session.tenantId)
            .is("deleted_at", null)
            .gte("fecha", desde)
            .lte("fecha", hasta)
            .order("fecha", { ascending: true })
            .order("hora_inicio", { ascending: true }),
        supabase
            .from("propiedades")
            .select("id, nombre, tipo_propiedad, tipo_operacion, ciudad:ciudad_id(nombre)")
            .eq("tenant_id", session.tenantId)
            .eq("estado", "disponible")
            .is("deleted_at", null)
            .is("proyecto_id", null),
        supabase
            .from("proyectos")
            .select("id, nombre, ciudad:ciudad_id(nombre)")
            .eq("tenant_id", session.tenantId)
            .eq("estado", "activo")
            .is("deleted_at", null)
    ])

    return (
        <HorariosClient
            horariosIniciales={horarios || []}
            propiedades={propiedades || []}
            proyectos={proyectos || []}
        />
    )
}