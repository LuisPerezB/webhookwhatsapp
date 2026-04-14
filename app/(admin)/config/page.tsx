import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import ConfigClient from "./config-client"

export default async function ConfigPage() {
    const session = await getSession()
    if (!session) redirect("/auth/login")

    const [{ data: configData }, { data: tenant }, { data: numbers }, { data: user }] = await Promise.all([
        supabase
            .from("tenant_config")
            .select("config")
            .eq("tenant_id", session.tenantId)
            .is("deleted_at", null)
            .single(),
        supabase
            .from("tenants")
            .select("nombre, activo")
            .eq("id", session.tenantId)
            .single(),
        supabase
            .from("whatsapp_numbers")
            .select("id, phone_number_id, numero, activo")
            .eq("tenant_id", session.tenantId)
            .is("deleted_at", null),
        supabase
            .from("users")
            .select("suscription_plan, suscription_status, paid_until")
            .eq("id", session.userId)
            .single()
    ])

    return (
        <ConfigClient
            configInicial={configData?.config || {}}
            tenant={tenant || {}}
            numbers={numbers || []}
            user={user || {}}
        />
    )
}