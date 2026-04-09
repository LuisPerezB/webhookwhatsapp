import { NextRequest, NextResponse } from "next/server"
import { dispatchMessage } from "@/lib/dispatcher"
import { SpeedInsights } from "@vercel/speed-insights/next"
// Verify token
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "your_verify_token"

// =========================
// GET → Verificación
// =========================
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verificado ✅")
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

// =========================
// POST → Eventos WhatsApp
// =========================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("[Webhook] Body recibido:", JSON.stringify(body))

    if (body.object !== "whatsapp_business_account") {
      console.log("[Webhook] Objeto no válido:", body.object)
      return NextResponse.json({ error: "Evento no válido" }, { status: 400 })
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value
        const phoneNumberId = value?.metadata?.phone_number_id

        console.log("[Webhook] phoneNumberId:", phoneNumberId)
        console.log("[Webhook] value.messages:", JSON.stringify(value.messages))

        if (value.messages) {
          for (const message of value.messages) {
            console.log("[Webhook] Procesando mensaje de:", message.from, "tipo:", message.type)
            await dispatchMessage({ phoneNumberId, from: message.from, message })
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

// =========================
// STATUS UPDATE
// =========================
function handleStatusUpdate(status: WhatsAppStatus) {
  const { id, status: statusType, timestamp, recipient_id } = status

  console.log(
    `[WhatsApp] ${id} → ${recipient_id}: ${statusType} (${timestamp})`
  )
}

// =========================
// TYPES (los dejas igual)
// =========================

interface WhatsAppMessage {
  from: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string }
  audio?: { id: string; mime_type: string }
  video?: { id: string; mime_type: string }
  document?: { id: string; mime_type: string; filename: string }
  location?: { latitude: number; longitude: number }
  button?: { text: string; payload: string }
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string }
  }
}

interface WhatsAppStatus {
  id: string
  status: "sent" | "delivered" | "read" | "failed"
  timestamp: string
  recipient_id: string
}