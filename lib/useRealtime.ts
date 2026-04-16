"use client"

import { useEffect, useRef, useCallback } from "react"

interface RealtimeEvent {
    tipo: "conectado" | "actualizacion" | "ping"
    mensajes?: any[]
    notificaciones?: any[]
    timestamp?: string
}

export function useRealtime(onActualizacion: (event: RealtimeEvent) => void) {
    const esRef = useRef<EventSource | null>(null)
    const onActualizacionRef = useRef(onActualizacion)

    useEffect(() => {
        onActualizacionRef.current = onActualizacion
    }, [onActualizacion])

    useEffect(() => {
        const conectar = () => {
            const es = new EventSource("/api/admin/conversaciones/stream")
            esRef.current = es

            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    onActualizacionRef.current(data)
                } catch {}
            }

            es.onerror = () => {
                es.close()
                // Reconectar después de 5 segundos
                setTimeout(conectar, 5000)
            }
        }

        conectar()

        return () => {
            esRef.current?.close()
        }
    }, [])
}