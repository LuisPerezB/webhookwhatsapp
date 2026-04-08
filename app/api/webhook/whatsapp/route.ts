import { NextRequest, NextResponse } from "next/server"

// Verify token - should match the token you set in the Meta Developer Console
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "your_verify_token"

// WhatsApp Business API credentials
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID

/**
 * GET handler for webhook verification
 * Meta sends a GET request to verify the webhook URL
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  // Check if this is a subscription verification request
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp Webhook] Verification successful")
    // Return the challenge to complete verification
    return new NextResponse(challenge, { status: 200 })
  }

  console.log("[WhatsApp Webhook] Verification failed - invalid token or mode")
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

/**
 * POST handler for incoming webhook events
 * Receives messages, status updates, and other events from WhatsApp
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log("[WhatsApp Webhook] Received event:", JSON.stringify(body, null, 2))

    // Check if this is a WhatsApp Business API event
    if (body.object === "whatsapp_business_account") {
      // Process each entry
      for (const entry of body.entry || []) {
        // Process each change in the entry
        for (const change of entry.changes || []) {
          const value = change.value

          // Handle incoming messages
          if (value.messages) {
            for (const message of value.messages) {
              await handleIncomingMessage(message, value.metadata)
            }
          }

          // Handle message status updates (sent, delivered, read)
          if (value.statuses) {
            for (const status of value.statuses) {
              handleStatusUpdate(status)
            }
          }
        }
      }

      // Always return 200 OK to acknowledge receipt
      return NextResponse.json({ status: "received" }, { status: 200 })
    }

    return NextResponse.json({ error: "Unknown event type" }, { status: 400 })
  } catch (error) {
    console.error("[WhatsApp Webhook] Error processing webhook:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Handle incoming WhatsApp messages
 */
async function handleIncomingMessage(
  message: WhatsAppMessage,
  metadata: WhatsAppMetadata
) {
  const { from, type, timestamp } = message

  console.log(`[WhatsApp] New ${type} message from ${from} at ${timestamp}`)

  switch (type) {
    case "text":
      console.log(`[WhatsApp] Text message: ${message.text?.body}`)
      // Example: Send an auto-reply
      // await sendWhatsAppMessage(from, `You said: ${message.text?.body}`)
      break

    case "image":
      console.log(`[WhatsApp] Image received, ID: ${message.image?.id}`)
      break

    case "audio":
      console.log(`[WhatsApp] Audio received, ID: ${message.audio?.id}`)
      break

    case "video":
      console.log(`[WhatsApp] Video received, ID: ${message.video?.id}`)
      break

    case "document":
      console.log(`[WhatsApp] Document received: ${message.document?.filename}`)
      break

    case "location":
      console.log(
        `[WhatsApp] Location: ${message.location?.latitude}, ${message.location?.longitude}`
      )
      break

    case "button":
      console.log(`[WhatsApp] Button clicked: ${message.button?.text}`)
      break

    case "interactive":
      console.log(`[WhatsApp] Interactive response:`, message.interactive)
      break

    default:
      console.log(`[WhatsApp] Unknown message type: ${type}`)
  }

  // TODO: Add your message handling logic here
  // - Store messages in database
  // - Trigger automated responses
  // - Forward to customer service
}

/**
 * Handle message status updates
 */
function handleStatusUpdate(status: WhatsAppStatus) {
  const { id, status: statusType, timestamp, recipient_id } = status

  console.log(
    `[WhatsApp] Message ${id} to ${recipient_id}: ${statusType} at ${timestamp}`
  )

  // TODO: Update message status in your database
}

/**
 * Send a message via WhatsApp Business API
 */
export async function sendWhatsAppMessage(to: string, text: string) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error("[WhatsApp] Missing API credentials")
    return null
  }

  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: { body: text },
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error("[WhatsApp] Failed to send message:", data)
    return null
  }

  console.log("[WhatsApp] Message sent successfully:", data)
  return data
}

/**
 * Send a template message via WhatsApp Business API
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = "en",
  components?: TemplateComponent[]
) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error("[WhatsApp] Missing API credentials")
    return null
  }

  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components,
      },
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error("[WhatsApp] Failed to send template:", data)
    return null
  }

  console.log("[WhatsApp] Template sent successfully:", data)
  return data
}

// Type definitions
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
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  button?: { text: string; payload: string }
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
  }
}

interface WhatsAppMetadata {
  display_phone_number: string
  phone_number_id: string
}

interface WhatsAppStatus {
  id: string
  status: "sent" | "delivered" | "read" | "failed"
  timestamp: string
  recipient_id: string
  errors?: Array<{ code: number; title: string }>
}

interface TemplateComponent {
  type: "header" | "body" | "button"
  parameters?: Array<{
    type: "text" | "currency" | "date_time" | "image" | "document" | "video"
    text?: string
    [key: string]: unknown
  }>
}
