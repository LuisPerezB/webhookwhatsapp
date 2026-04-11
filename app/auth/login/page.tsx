"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || "Error al iniciar sesión")
                return
            }

            router.push("/dashboard")
            router.refresh()

        } catch {
            setError("Error de conexión. Intenta de nuevo.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            minHeight: "100vh",
            background: "#0a0a0a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Georgia', serif",
            position: "relative",
            overflow: "hidden",
        }}>
            {/* Fondo con grid sutil */}
            <div style={{
                position: "absolute", inset: 0,
                backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
            }} />

            {/* Acento de color */}
            <div style={{
                position: "absolute", top: "-20%", right: "-10%",
                width: "500px", height: "500px",
                background: "radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)",
                pointerEvents: "none",
            }} />

            <div style={{
                position: "relative", zIndex: 1,
                width: "100%", maxWidth: "400px",
                padding: "0 24px",
            }}>
                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: "48px" }}>
                    <div style={{
                        display: "inline-flex", alignItems: "center",
                        justifyContent: "center", gap: "10px", marginBottom: "8px",
                    }}>
                        <div style={{
                            width: "36px", height: "36px",
                            background: "#22c55e",
                            borderRadius: "8px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                                <polyline points="9,22 9,12 15,12 15,22" fill="none" stroke="white" strokeWidth="1.5"/>
                            </svg>
                        </div>
                        <span style={{
                            fontSize: "22px", fontWeight: "700",
                            color: "#ffffff", letterSpacing: "-0.5px",
                            fontFamily: "'Georgia', serif",
                        }}>
                            INMOBIL<span style={{ color: "#22c55e" }}>.IA</span>
                        </span>
                    </div>
                    <p style={{
                        color: "#52525b", fontSize: "13px",
                        letterSpacing: "0.1em", textTransform: "uppercase",
                    }}>
                        Panel de Administración
                    </p>
                </div>

                {/* Card */}
                <div style={{
                    background: "#111111",
                    border: "1px solid #1f1f1f",
                    borderRadius: "16px",
                    padding: "36px",
                }}>
                    <h2 style={{
                        color: "#ffffff", fontSize: "20px",
                        fontWeight: "600", marginBottom: "6px",
                        margin: "0 0 6px 0",
                    }}>
                        Bienvenido
                    </h2>
                    <p style={{
                        color: "#52525b", fontSize: "14px",
                        margin: "0 0 28px 0",
                    }}>
                        Ingresa tus credenciales para continuar
                    </p>

                    <form onSubmit={handleLogin}>
                        {/* Email */}
                        <div style={{ marginBottom: "16px" }}>
                            <label style={{
                                display: "block", color: "#a1a1aa",
                                fontSize: "12px", letterSpacing: "0.05em",
                                textTransform: "uppercase", marginBottom: "8px",
                            }}>
                                Correo electrónico
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="tu@email.com"
                                required
                                style={{
                                    width: "100%", padding: "12px 14px",
                                    background: "#0a0a0a",
                                    border: "1px solid #27272a",
                                    borderRadius: "8px",
                                    color: "#ffffff", fontSize: "14px",
                                    outline: "none", boxSizing: "border-box",
                                    transition: "border-color 0.2s",
                                    fontFamily: "monospace",
                                }}
                                onFocus={e => e.target.style.borderColor = "#22c55e"}
                                onBlur={e => e.target.style.borderColor = "#27272a"}
                            />
                        </div>

                        {/* Password */}
                        <div style={{ marginBottom: "24px" }}>
                            <label style={{
                                display: "block", color: "#a1a1aa",
                                fontSize: "12px", letterSpacing: "0.05em",
                                textTransform: "uppercase", marginBottom: "8px",
                            }}>
                                Contraseña
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                style={{
                                    width: "100%", padding: "12px 14px",
                                    background: "#0a0a0a",
                                    border: "1px solid #27272a",
                                    borderRadius: "8px",
                                    color: "#ffffff", fontSize: "14px",
                                    outline: "none", boxSizing: "border-box",
                                    transition: "border-color 0.2s",
                                    fontFamily: "monospace",
                                }}
                                onFocus={e => e.target.style.borderColor = "#22c55e"}
                                onBlur={e => e.target.style.borderColor = "#27272a"}
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div style={{
                                background: "#1a0a0a",
                                border: "1px solid #450a0a",
                                borderRadius: "8px",
                                padding: "12px 14px",
                                marginBottom: "20px",
                                color: "#f87171",
                                fontSize: "13px",
                                display: "flex", alignItems: "flex-start", gap: "8px",
                            }}>
                                <span style={{ marginTop: "1px" }}>⚠</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Botón */}
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: "100%", padding: "13px",
                                background: loading ? "#15803d" : "#22c55e",
                                border: "none", borderRadius: "8px",
                                color: "#000000", fontSize: "14px",
                                fontWeight: "700", cursor: loading ? "not-allowed" : "pointer",
                                letterSpacing: "0.03em",
                                transition: "all 0.2s",
                                display: "flex", alignItems: "center",
                                justifyContent: "center", gap: "8px",
                            }}
                        >
                            {loading ? (
                                <>
                                    <span style={{
                                        width: "14px", height: "14px",
                                        border: "2px solid #000",
                                        borderTopColor: "transparent",
                                        borderRadius: "50%",
                                        display: "inline-block",
                                        animation: "spin 0.7s linear infinite",
                                    }} />
                                    Verificando...
                                </>
                            ) : "Ingresar"}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p style={{
                    textAlign: "center", color: "#3f3f46",
                    fontSize: "12px", marginTop: "24px",
                }}>
                    INMOBIL.IA © {new Date().getFullYear()}
                </p>
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                input::placeholder { color: #3f3f46; }
            `}</style>
        </div>
    )
}