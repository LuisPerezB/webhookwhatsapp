import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import PropiedadesClient from "./propiedades-client"

export default async function PropiedadesPage() {
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const [
        { data: propiedades },
        { data: ciudades },
        { data: sectores },
        { data: proyectos }
    ] = await Promise.all([
        supabase
            .from("propiedades")
            .select(`
                id, nombre, precio, precio_negociable,
                tipo_propiedad, tipo_operacion, tipo_pago,
                estado, fotos, descripcion, total_consultas,
                dimensiones, ambientes, exteriores,
                estacionamiento, extras, servicios, seguridad,
                ciudad:ciudad_id(id, nombre),
                sector:sector_id(id, nombre),
                proyecto:proyecto_id(id, nombre)
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
            .order("nombre"),
        supabase
            .from("proyectos")
            .select("id, nombre")
            .eq("tenant_id", session.tenantId)
            .eq("estado", "activo")
            .is("deleted_at", null)
    ])

    return (
        <PropiedadesClient
            propiedadesIniciales={propiedades || []}
            ciudades={ciudades || []}
            sectores={sectores || []}
            proyectos={proyectos || []}
            tenantId={session.tenantId}
        />
    )
}