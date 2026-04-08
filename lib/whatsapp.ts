export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  text: string
) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    console.error("[WhatsApp] Error enviando mensaje:", JSON.stringify(data))
    throw new Error(`WhatsApp API error: ${res.status}`)
  }

  console.log("[WhatsApp] Mensaje enviado OK:", data.messages?.[0]?.id)
  return data
}