"use client"

import { useState, useRef } from "react"

// Foto puede ser un archivo local (pendiente) o una URL ya guardada
export interface FotoItem {
    tipo: "local" | "remota"
    url: string        // URL remota si ya está guardada
    preview: string    // ObjectURL para preview local
    file?: File        // Archivo pendiente de subir
}

interface Props {
    fotosIniciales: string[]   // URLs ya guardadas en DB
    onChange: (fotos: FotoItem[]) => void
    fotos: FotoItem[]
}

export function FotoUploader({ fotosIniciales, fotos, onChange }: Props) {
    const inputRef = useRef<HTMLInputElement>(null)

    const agregarArchivos = (files: FileList | null) => {
        if (!files) return
        const nuevas: FotoItem[] = Array.from(files).map(file => ({
            tipo: "local",
            url: "",
            preview: URL.createObjectURL(file),
            file
        }))
        onChange([...fotos, ...nuevas])
    }

    const quitar = (i: number) => {
        const nuevas = [...fotos]
        // Liberar ObjectURL si es local
        if (nuevas[i].tipo === "local") {
            URL.revokeObjectURL(nuevas[i].preview)
        }
        nuevas.splice(i, 1)
        onChange(nuevas)
    }

    const moverPrimero = (i: number) => {
        if (i === 0) return
        const nuevas = [...fotos]
        const [item] = nuevas.splice(i, 1)
        nuevas.unshift(item)
        onChange(nuevas)
    }

    return (
        <div>
            {/* Preview grid */}
            {fotos.length > 0 && (
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
                    gap: 6, marginBottom: 8
                }}>
                    {fotos.map((foto, i) => (
                        <div key={i} style={{ position: "relative" }}>
                            <img
                                src={foto.tipo === "local" ? foto.preview : foto.url}
                                alt=""
                                style={{
                                    width: "100%", aspectRatio: "1",
                                    objectFit: "cover", borderRadius: 6,
                                    border: i === 0
                                        ? "2px solid var(--accent)"
                                        : "0.5px solid var(--border)"
                                }}
                            />

                            {/* Badge pendiente */}
                            {foto.tipo === "local" && (
                                <span style={{
                                    position: "absolute", bottom: 3, left: 3,
                                    fontSize: 8, background: "var(--sa)",
                                    color: "#fff", padding: "1px 4px", borderRadius: 3
                                }}>
                                    pendiente
                                </span>
                            )}

                            {/* Badge portada */}
                            {i === 0 && (
                                <span style={{
                                    position: "absolute", bottom: foto.tipo === "local" ? 14 : 3,
                                    left: 3, fontSize: 8, background: "var(--accent)",
                                    color: "#fff", padding: "1px 4px", borderRadius: 3
                                }}>
                                    portada
                                </span>
                            )}

                            {/* Botón quitar */}
                            <button
                                onClick={() => quitar(i)}
                                style={{
                                    position: "absolute", top: 3, right: 3,
                                    width: 18, height: 18, borderRadius: "50%",
                                    background: "rgba(0,0,0,0.65)", color: "#fff",
                                    border: "none", cursor: "pointer", fontSize: 10,
                                    display: "flex", alignItems: "center", justifyContent: "center"
                                }}
                            >
                                ✕
                            </button>

                            {/* Botón hacer portada */}
                            {i > 0 && (
                                <button
                                    onClick={() => moverPrimero(i)}
                                    title="Hacer portada"
                                    style={{
                                        position: "absolute", top: 3, left: 3,
                                        width: 18, height: 18, borderRadius: "50%",
                                        background: "rgba(0,0,0,0.65)", color: "#fff",
                                        border: "none", cursor: "pointer", fontSize: 10,
                                        display: "flex", alignItems: "center", justifyContent: "center"
                                    }}
                                >
                                    ★
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Drop zone */}
            <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); agregarArchivos(e.dataTransfer.files) }}
                style={{
                    border: "1px dashed var(--border2)", borderRadius: 8,
                    padding: 16, textAlign: "center", cursor: "pointer",
                    background: "var(--surface2)", transition: "border-color .12s"
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border2)")}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={e => agregarArchivos(e.target.files)}
                />
                <div style={{ fontSize: 20, marginBottom: 4 }}>📷</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                    Clic o arrastra fotos aquí
                </div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>
                    JPG, PNG, WEBP · La primera foto es la portada
                </div>
            </div>
        </div>
    )
}

// Función para subir las fotos pendientes al guardar
// Se llama desde el formulario antes de hacer el POST/PATCH
export async function subirFotosPendientes(fotos: FotoItem[]): Promise<string[]> {
    const urls: string[] = []

    for (const foto of fotos) {
        if (foto.tipo === "remota") {
            // Ya está en Supabase, conservar URL
            urls.push(foto.url)
        } else if (foto.file) {
            // Subir a Supabase Storage
            const form = new FormData()
            form.append("file", foto.file)
            form.append("tipo", "propiedades")

            const res = await fetch("/api/admin/upload", {
                method: "POST",
                body: form
            })

            if (res.ok) {
                const { url } = await res.json()
                urls.push(url)
            }
        }
    }

    return urls
}