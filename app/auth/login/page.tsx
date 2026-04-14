"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
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
        } catch {
            setError("Error de conexión")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            minHeight: "100vh", display: "flex", alignItems: "center",
            justifyContent: "center", background: "#111110",
            fontFamily: "'DM Sans', sans-serif"
        }}>
            <div style={{
                width: "100%", maxWidth: 360, padding: "0 20px"
            }}>
                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <div style={{
                        width: 44, height: 44, background: "#2a4a3e",
                        borderRadius: 10, display: "flex", alignItems: "center",
                        justifyContent: "center", margin: "0 auto 12px"
                    }}>
                        <span style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>IA</span>
                    </div>
                    <div style={{ fontSize: 22, color: "#f0ede8", fontWeight: 500 }}>
                        Inmobi<em style={{ fontStyle: "italic", color: "#5aab8a" }}>l.ia</em>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b6861", marginTop: 4 }}>
                        Panel de administración
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                            <label style={{
                                display: "block", fontSize: 11, fontWeight: 500,
                                color: "#6b6861", textTransform: "uppercase",
                                letterSpacing: ".06em", marginBottom: 5
                            }}>
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="admin@empresa.com"
                                required
                                style={{
                                    width: "100%", padding: "10px 12px",
                                    borderRadius: 8, border: "0.5px solid rgba(255,255,255,0.1)",
                                    background: "#1c1b19", color: "#f0ede8",
                                    fontFamily: "inherit", fontSize: 13, outline: "none",
                                }}
                            />
                        </div>

                        <div>
                            <label style={{
                                display: "block", fontSize: 11, fontWeight: 500,
                                color: "#6b6861", textTransform: "uppercase",
                                letterSpacing: ".06em", marginBottom: 5
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
                                    width: "100%", padding: "10px 12px",
                                    borderRadius: 8, border: "0.5px solid rgba(255,255,255,0.1)",
                                    background: "#1c1b19", color: "#f0ede8",
                                    fontFamily: "inherit", fontSize: 13, outline: "none",
                                }}
                            />
                        </div>

                        {error && (
                            <div style={{
                                padding: "8px 12px", borderRadius: 7,
                                background: "rgba(153,31,31,0.15)",
                                border: "0.5px solid rgba(153,31,31,0.3)",
                                fontSize: 12, color: "#e05a4a"
                            }}>
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: "10px 0", borderRadius: 8,
                                background: loading ? "#1a3329" : "#2a4a3e",
                                color: "#fff", border: "none", cursor: loading ? "not-allowed" : "pointer",
                                fontFamily: "inherit", fontSize: 13, fontWeight: 500,
                                transition: "background .12s", marginTop: 4
                            }}
                        >
                            {loading ? "Iniciando sesión..." : "Iniciar sesión"}
                        </button>
                    </div>
                </form>

                <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#4a4742" }}>
                    INMOBIL.IA · Panel administrativo
                </div>
            </div>
        </div>
    )
}