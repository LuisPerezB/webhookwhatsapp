// app/api/admin/upload/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export async function POST(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get("file") as File
    const tipo = formData.get("tipo") as string || "propiedades"

    if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 })

    const ext = file.name.split(".").pop()
    const nombre = `${session.tenantId}/${Date.now()}.${ext}`

    const { data, error } = await supabase.storage
        .from(tipo)
        .upload(nombre, file, { contentType: file.type, upsert: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { data: urlData } = supabase.storage
        .from(tipo)
        .getPublicUrl(nombre)

    return NextResponse.json({ url: urlData.publicUrl })
}