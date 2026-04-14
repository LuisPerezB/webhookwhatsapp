import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ProyectosClient from "./proyectos-client"

export default async function ProyectosPage() {
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const [
        { data: proyectos },
        { data: ciudades },
        { data: sectores }
    ] = await Promise.all([
        supabase
            .from("proyectos")
            .select(`
                id, nombre, descripcion, slogan,
                precio_desde, precio_hasta, tipo_pago,
                estado, fecha_entrega_estimada,
                amenidades, sitio_web, fotos,
                total_consultas, created_at,
                ciudad:ciudad_id(id, nombre),
                sector:sector_id(id, nombre)
            `)
            .eq("tenant_id", session.tenantId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
        supabase
            .from("ciudades")
            .select("id, nombre")
            .is("deleted_at", null)
            .order("nombre"),
        supabase
            .from("sectores")
            .select("id, nombre, ciudad_id")
            .is("deleted_at", null)
            .order("nombre")
    ])

    // Para cada proyecto — contar unidades
    const proyectosConUnidades = await Promise.all(
        (proyectos || []).map(async (p: any) => {
            const { count } = await supabase
                .from("propiedades")
                .select("*", { count: "exact", head: true })
                .eq("proyecto_id", p.id)
                .eq("tenant_id", session.tenantId)
                .is("deleted_at", null)

            const { data: link } = await supabase
                .from("links")
                .select("slug")
                .eq("tenant_id", session.tenantId)
                .eq("proyecto_id", p.id)
                .single()

            return { ...p, total_unidades: count || 0, slug: link?.slug }
        })
    )

    return (
        <ProyectosClient
            proyectosIniciales={proyectosConUnidades}
            ciudades={ciudades || []}
            sectores={sectores || []}
            tenantId={session.tenantId}
        />
    )
}