export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  text: string
) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    }),
  })
}