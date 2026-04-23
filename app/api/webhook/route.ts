import { NextRequest, NextResponse } from "next/server"
import { dispatchMessage } from "@/lib/dispatcher"

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "your_verify_token"

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get("hub.mode")
    const token = searchParams.get("hub.verify_token")
    const challenge = searchParams.get("hub.challenge")

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 })
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

export async function POST(request: NextRequest) {
    try {

        const body = await request.json()

        if (body.object !== "whatsapp_business_account") {
            return NextResponse.json({ error: "Evento no válido" }, { status: 400 })
        }

        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value
                const phoneNumberId = value?.metadata?.phone_number_id

                if (value.messages) {
                    for (const message of value.messages) {
                        await dispatchMessage({
                            phoneNumberId,
                            from: message.from,
                            message,
                        })
                    }
                }
            }
        }

        return NextResponse.json({ status: "ok" }, { status: 200 })

    } catch (error) {
        console.error("[Webhook] Error crítico:", error)
        return NextResponse.json({ error: "Internal error" }, { status: 500 })
    }
}

interface WhatsAppStatus {
    id: string
    status: "sent" | "delivered" | "read" | "failed"
    timestamp: string
    recipient_id: string
}