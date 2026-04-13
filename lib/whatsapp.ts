const WA_API = "https://graph.facebook.com/v21.0"

export async function sendWhatsAppMessage(
    phoneNumberId: string,
    to: string,
    text: string
): Promise<string | null> {
    return await sendWA(phoneNumberId, {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text, preview_url: false },
    })
}

export async function sendWhatsAppButtons(
    phoneNumberId: string,
    to: string,
    body: string,
    buttons: { id: string; title: string }[],
    header?: string,
    footer?: string
): Promise<string | null> {
    return await sendWA(phoneNumberId, {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "button",
            ...(header && { header: { type: "text", text: header } }),
            body: { text: body },
            ...(footer && { footer: { text: footer } }),
            action: {
                buttons: buttons.slice(0, 3).map(b => ({
                    type: "reply",
                    reply: {
                        id: b.id.slice(0, 256),
                        title: b.title.slice(0, 20)
                    }
                }))
            }
        }
    })
}

export async function sendWhatsAppList(
    phoneNumberId: string,
    to: string,
    body: string,
    buttonText: string,
    sections: {
        title: string
        rows: { id: string; title: string; description?: string }[]
    }[],
    header?: string,
    footer?: string
): Promise<string | null> {
    return await sendWA(phoneNumberId, {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
            type: "list",
            ...(header && { header: { type: "text", text: header } }),
            body: { text: body },
            ...(footer && { footer: { text: footer } }),
            action: {
                button: buttonText.slice(0, 20),
                sections: sections.map(s => ({
                    title: s.title.slice(0, 24),
                    rows: s.rows.slice(0, 10).map(r => ({
                        id: r.id.slice(0, 200),
                        title: r.title.slice(0, 24),
                        ...(r.description && {
                            description: r.description.slice(0, 72)
                        })
                    }))
                }))
            }
        }
    })
}

export async function sendWhatsAppImage(
    phoneNumberId: string,
    to: string,
    imageUrl: string,
    caption?: string
): Promise<string | null> {
    return await sendWA(phoneNumberId, {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: {
            link: imageUrl,
            ...(caption && { caption: caption.slice(0, 1024) })
        }
    })
}

async function sendWA(
    phoneNumberId: string,
    payload: any
): Promise<string | null> {
    const url = `${WA_API}/${phoneNumberId}/messages`

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
        console.error("[WhatsApp] Error:", JSON.stringify(data))
        throw new Error(`WhatsApp API error: ${res.status}`)
    }

    const messageId = data.messages?.[0]?.id ?? null
    console.log("[WhatsApp] Enviado OK:", messageId)
    return messageId
}

export function extraerTextoMensaje(message: any): {
    texto: string
    esInteractivo: boolean
    buttonId?: string
} {
    if (message.type === "text") {
        return { texto: message.text?.body || "", esInteractivo: false }
    }

    if (message.type === "interactive") {
        const tipo = message.interactive?.type

        if (tipo === "button_reply") {
            return {
                texto: message.interactive.button_reply.title,
                esInteractivo: true,
                buttonId: message.interactive.button_reply.id,
            }
        }

        if (tipo === "list_reply") {
            return {
                texto: message.interactive.list_reply.title,
                esInteractivo: true,
                buttonId: message.interactive.list_reply.id,
            }
        }
    }

    return { texto: "", esInteractivo: false }
}