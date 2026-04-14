import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ClientesClient from "./clientes-client"

export default async function ClientesPage() {
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const { data: relaciones } = await supabase
        .from("cliente_tenants")
        .select(`
            primer_contacto, ultimo_contacto,
            clientes:cliente_id(
                id, nombres_completos, celular,
                ruc_ci, verificado, bloqueado, created_at
            )
        `)
        .eq("tenant_id", session.tenantId)
        .is("deleted_at", null)
        .order("ultimo_contacto", { ascending: false })
        .limit(100)

    const clientes = (relaciones || []).map((r: any) => {
        const c = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
        return {
            ...c,
            primer_contacto: r.primer_contacto,
            ultimo_contacto: r.ultimo_contacto,
        }
    }).filter(Boolean)

    return <ClientesClient clientesIniciales={clientes} />
}