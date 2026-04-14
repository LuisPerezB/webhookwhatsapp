import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ReservasClient from "./reservas-client"

export default async function ReservasPage() {
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const { data: reservas } = await supabase
        .from("reservas")
        .select(`
            id, fecha, estado, created_at,
            clientes:cliente_id(nombres_completos, celular),
            propiedades:propiedad_id(nombre),
            proyectos:proyecto_id(nombre)
        `)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("fecha", { ascending: true })

    return <ReservasClient reservasIniciales={reservas || []} />
}