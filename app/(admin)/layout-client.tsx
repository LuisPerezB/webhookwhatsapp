"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import type { SessionPayload } from "@/lib/auth"

interface Notificacion {
    id: number
    tipo: string
    mensaje: string
    leida: boolean
    created_at: string
    clientes?: { nombres_completos: string; celular: string }
}

interface Conversacion {
    id: number
    modo: string
    updated_at: string
    cliente: { id: number; nombre: string; celular: string; verificado: boolean }
    ultimo_mensaje: { contenido: string; origen: string } | null
    notificaciones_no_leidas: number
}

export default function AdminLayoutClient({
    children,
    session,
}: {
    children: React.ReactNode
    session: SessionPayload
}) {
    const router = useRouter()
    const pathname = usePathname()

    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [theme, setTheme] = useState<"" | "dark">("")
    const [notifOpen, setNotifOpen] = useState(false)
    const [chatOpen, setChatOpen] = useState(false)
    const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
    const [totalNoLeidas, setTotalNoLeidas] = useState(0)
    const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
    const [loadingNotif, setLoadingNotif] = useState(false)

    // Cargar notificaciones
    const cargarNotificaciones = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/notificaciones")
            if (!res.ok) return
            const data = await res.json()
            setNotificaciones(data.notificaciones || [])
            setTotalNoLeidas(data.total_no_leidas || 0)
        } catch {}
    }, [])

    // Cargar conversaciones para el panel flotante
    const cargarConversaciones = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/conversaciones?limite=5")
            if (!res.ok) return
            const data = await res.json()
            setConversaciones(data.conversaciones || [])
        } catch {}
    }, [])

    useEffect(() => {
        cargarNotificaciones()
        cargarConversaciones()
        // Polling cada 30 segundos
        const interval = setInterval(() => {
            cargarNotificaciones()
            cargarConversaciones()
        }, 30000)
        return () => clearInterval(interval)
    }, [cargarNotificaciones, cargarConversaciones])

    // Marcar todas como leídas
    const marcarTodasLeidas = async () => {
        await fetch("/api/admin/notificaciones", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ todas: true })
        })
        setNotificaciones([])
        setTotalNoLeidas(0)
    }

    const handleLogout = async () => {
        await fetch("/api/auth/login", { method: "DELETE" })
        router.push("/auth/login")
    }

    const navItems = [
        {
            label: "Principal",
            items: [
                { id: "dashboard", href: "/dashboard", label: "Resumen", icon: IconGrid },
            ]
        },
        {
            label: "Catálogo",
            items: [
                { id: "propiedades", href: "/dashboard/propiedades", label: "Propiedades", icon: IconHome },
                { id: "horarios", href: "/dashboard/horarios", label: "Horarios", icon: IconClock },
            ]
        },
        {
            label: "CRM",
            items: [
                { id: "conversaciones", href: "/dashboard/conversaciones", label: "Conversaciones", icon: IconChat },
                { id: "clientes", href: "/dashboard/clientes", label: "Clientes", icon: IconUser },
                { id: "reservas", href: "/dashboard/reservas", label: "Reservas", icon: IconCalendar },
            ]
        },
        {
            label: "Sistema",
            items: [
                { id: "config", href: "/dashboard/config", label: "Configuración", icon: IconSettings },
            ]
        }
    ]

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard"
        return pathname.startsWith(href)
    }

    const tiempoRelativo = (fecha: string) => {
        const diff = Date.now() - new Date(fecha).getTime()
        const min = Math.floor(diff / 60000)
        if (min < 1) return "ahora"
        if (min < 60) return `${min}m`
        const h = Math.floor(min / 60)
        if (h < 24) return `${h}h`
        return `${Math.floor(h / 24)}d`
    }

    const iniciales = (nombre: string) =>
        nombre.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()

    const badgeModo = (modo: string) => {
        const cfg: Record<string, { bg: string; text: string; label: string }> = {
            automatico: { bg: "#e4f5ec", text: "#1a5c3a", label: "bot" },
            manual: { bg: "#fef3e2", text: "#7a4a0a", label: "manual" },
            pausado: { bg: "#f0ede8", text: "#4a4742", label: "pausado" },
        }
        return cfg[modo] || cfg.automatico
    }

    return (
        <div
            style={{
                display: "flex", height: "100vh", overflow: "hidden",
                background: "var(--bg)", position: "relative",
                fontFamily: "'DM Sans', sans-serif", fontSize: 14,
            }}
            data-theme={theme}
        >
            <style>{`
                :root {
                    --bg: #f4f2ee; --surface: #fff; --surface2: #f0ede8;
                    --surface3: #e8e4dd; --border: rgba(0,0,0,0.07);
                    --border2: rgba(0,0,0,0.13); --text: #1a1917;
                    --text2: #6b6861; --text3: #a09c97;
                    --accent: #2a4a3e; --accent2: #3d6b5c;
                    --accent-light: #e6f0eb; --accent-text: #1a3329;
                    --sw: 220px; --hh: 52px;
                    --sg: #1a5c3a; --sgb: #e4f5ec;
                    --sa: #7a4a0a; --sab: #fef3e2;
                    --sr: #991f1f; --srb: #fdeaea;
                    --sb: #1a4a7a; --sbb: #e6f0fb;
                    --sp: #3a2a7a; --spb: #eeebfb;
                    --sgr: #4a4742; --sgrb: #f0ede8;
                }
                [data-theme="dark"] {
                    --bg: #111110; --surface: #1c1b19; --surface2: #242320;
                    --surface3: #2e2c29; --border: rgba(255,255,255,0.07);
                    --border2: rgba(255,255,255,0.13); --text: #f0ede8;
                    --text2: #9e9b96; --text3: #6b6861;
                    --accent: #4a8c72; --accent2: #5aab8a;
                    --accent-light: #1a2e25; --accent-text: #b8d9ca;
                    --sg: #3aaa72; --sgb: #182a20;
                    --sa: #d4842a; --sab: #2a1e0e;
                    --sr: #e05a4a; --srb: #2a1a18;
                    --sb: #4a8abf; --sbb: #172030;
                    --sp: #8a72e0; --spb: #1e1830;
                    --sgr: #9e9b96; --sgrb: #242320;
                }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                ::-webkit-scrollbar { width: 3px; height: 3px; }
                ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 10px; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
            `}</style>

            {/* Overlay sidebar mobile */}
            {sidebarOpen && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    style={{
                        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
                        zIndex: 25, display: "block"
                    }}
                />
            )}

            {/* SIDEBAR */}
            <aside style={{
                width: "var(--sw)", background: "var(--surface)",
                borderRight: "0.5px solid var(--border)", display: "flex",
                flexDirection: "column", flexShrink: 0, zIndex: 30,
                overflow: "hidden", transition: "transform .22s cubic-bezier(.4,0,.2,1)",
                ...(typeof window !== "undefined" && window.innerWidth < 768 ? {
                    position: "fixed", top: 0, bottom: 0, left: 0,
                    height: "100vh",
                    transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                } : {})
            }}>
                {/* Logo */}
                <div style={{
                    padding: "0 18px", height: "var(--hh)", display: "flex",
                    alignItems: "center", gap: 10,
                    borderBottom: "0.5px solid var(--border)", flexShrink: 0
                }}>
                    <div style={{
                        width: 26, height: 26, background: "var(--accent)",
                        borderRadius: 6, display: "flex", alignItems: "center",
                        justifyContent: "center", flexShrink: 0
                    }}>
                        <span style={{ color: "#fff", fontSize: 10, fontWeight: 500 }}>IA</span>
                    </div>
                    <span style={{ fontSize: 15, color: "var(--text)", fontWeight: 500 }}>
                        Inmobi<em style={{ fontStyle: "italic", color: "var(--accent2)" }}>l.ia</em>
                    </span>
                </div>

                {/* Nav */}
                <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
                    {navItems.map(group => (
                        <div key={group.label}>
                            <div style={{
                                fontSize: 10, fontWeight: 500, letterSpacing: ".08em",
                                color: "var(--text3)", padding: "8px 12px 4px",
                                textTransform: "uppercase"
                            }}>
                                {group.label}
                            </div>
                            {group.items.map(item => {
                                const active = isActive(item.href)
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => {
                                            router.push(item.href)
                                            setSidebarOpen(false)
                                        }}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 9,
                                            padding: "7px 12px", borderRadius: 7, cursor: "pointer",
                                            fontSize: 13, whiteSpace: "nowrap",
                                            color: active ? "var(--accent)" : "var(--text2)",
                                            background: active ? "var(--accent-light)" : "transparent",
                                            fontWeight: active ? 500 : 400,
                                            transition: "all .12s",
                                        }}
                                    >
                                        <item.icon active={active} />
                                        {item.label}
                                        {item.id === "conversaciones" && totalNoLeidas > 0 && (
                                            <span style={{
                                                marginLeft: "auto", fontSize: 10,
                                                padding: "1px 6px", borderRadius: 10,
                                                background: "var(--srb)", color: "var(--sr)",
                                                fontWeight: 500
                                            }}>
                                                {totalNoLeidas}
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </nav>

                {/* Footer usuario */}
                <div style={{ padding: "10px 8px", borderTop: "0.5px solid var(--border)", flexShrink: 0 }}>
                    <div
                        onClick={handleLogout}
                        style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "7px 12px", borderRadius: 7, cursor: "pointer",
                            transition: "background .12s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                        <div style={{
                            width: 26, height: 26, borderRadius: "50%",
                            background: "var(--accent)", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: "#fff", fontWeight: 500, flexShrink: 0
                        }}>
                            {iniciales(session.nombres)}
                        </div>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                                {session.nombres.split(" ")[0]}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text3)" }}>
                                Cerrar sesión
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* MAIN */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

                {/* TOPBAR */}
                <div style={{
                    height: "var(--hh)", background: "var(--surface)",
                    borderBottom: "0.5px solid var(--border)",
                    display: "flex", alignItems: "center",
                    padding: "0 18px", gap: 10, flexShrink: 0
                }}>
                    {/* Hamburger mobile */}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        style={{
                            width: 30, height: 30, borderRadius: 7,
                            border: "0.5px solid var(--border2)",
                            background: "var(--surface2)", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "var(--text2)"
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M2 4h12M2 8h12M2 12h12" />
                        </svg>
                    </button>

                    {/* Título dinámico */}
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                        {navItems.flatMap(g => g.items).find(i => isActive(i.href))?.label || "Dashboard"}
                    </div>

                    {/* Theme toggle */}
                    <IconButton onClick={() => setTheme(t => t === "dark" ? "" : "dark")} title="Tema">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="8" cy="8" r="3.5" />
                            <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.3 3.3l.7.7M12 12l.7.7M11.3 3.3l-.7.7M4.7 11.3l-.7.7" />
                        </svg>
                    </IconButton>

                    {/* Notificaciones */}
                    <div style={{ position: "relative" }}>
                        <IconButton onClick={() => { setNotifOpen(o => !o); if (!notifOpen) cargarNotificaciones() }} title="Notificaciones">
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M8 1.5a4.5 4.5 0 014.5 4.5c0 2 .8 3.5 1.5 4.5H2c.7-1 1.5-2.5 1.5-4.5A4.5 4.5 0 018 1.5z" />
                                <path d="M6.5 13.5a1.5 1.5 0 003 0" />
                            </svg>
                            {totalNoLeidas > 0 && (
                                <span style={{
                                    position: "absolute", top: -4, right: -4,
                                    background: "var(--sr)", color: "#fff",
                                    fontSize: 9, width: 15, height: 15,
                                    borderRadius: "50%", display: "flex",
                                    alignItems: "center", justifyContent: "center",
                                    fontWeight: 500
                                }}>
                                    {totalNoLeidas > 9 ? "9+" : totalNoLeidas}
                                </span>
                            )}
                        </IconButton>

                        {/* Panel notificaciones */}
                        {notifOpen && (
                            <div style={{
                                position: "absolute", top: 38, right: 0,
                                width: 280, background: "var(--surface)",
                                border: "0.5px solid var(--border2)",
                                borderRadius: 10, zIndex: 55,
                                boxShadow: "0 4px 20px rgba(0,0,0,.1)",
                                animation: "fadeIn .15s ease"
                            }}>
                                <div style={{
                                    padding: "8px 14px",
                                    borderBottom: "0.5px solid var(--border)",
                                    fontSize: 12, fontWeight: 500, color: "var(--text)",
                                    display: "flex", justifyContent: "space-between",
                                    alignItems: "center"
                                }}>
                                    <span>Notificaciones</span>
                                    {totalNoLeidas > 0 && (
                                        <span
                                            onClick={marcarTodasLeidas}
                                            style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}
                                        >
                                            Marcar leídas
                                        </span>
                                    )}
                                </div>
                                {notificaciones.length === 0 ? (
                                    <div style={{ padding: "20px 14px", textAlign: "center", fontSize: 12, color: "var(--text3)" }}>
                                        Sin notificaciones nuevas
                                    </div>
                                ) : notificaciones.slice(0, 5).map(n => {
                                    const cliente = n.clientes as any
                                    return (
                                        <div key={n.id} style={{
                                            display: "flex", gap: 9,
                                            padding: "8px 14px",
                                            borderBottom: "0.5px solid var(--border)"
                                        }}>
                                            <div style={{
                                                width: 6, height: 6, borderRadius: "50%",
                                                background: "var(--accent)", marginTop: 4,
                                                flexShrink: 0, animation: "pulse 2s infinite"
                                            }} />
                                            <div>
                                                <div style={{ fontSize: 12, color: "var(--text2)" }}>
                                                    {n.mensaje}
                                                </div>
                                                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>
                                                    {tiempoRelativo(n.created_at)}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* CONTENT */}
                <div
                    style={{ flex: 1, overflowY: "auto", padding: 20, position: "relative" }}
                    onClick={() => { setNotifOpen(false) }}
                >
                    {children}
                </div>
            </div>

            {/* FAB CONVERSACIONES */}
            <div
                onClick={() => { setChatOpen(o => !o); if (!chatOpen) cargarConversaciones() }}
                style={{
                    position: "fixed", bottom: 24, right: 24,
                    width: 44, height: 44, borderRadius: "50%",
                    background: "var(--accent)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    cursor: "pointer", zIndex: 50,
                    transition: "transform .15s",
                    boxShadow: "0 4px 16px rgba(0,0,0,.15)"
                }}
            >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.5">
                    <path d="M14 10.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2.5V3.5C1.5 2.7 2.2 2 3 2h10c.8 0 1.5.7 1.5 1.5v7z" />
                </svg>
                {totalNoLeidas > 0 && (
                    <div style={{
                        position: "absolute", top: -3, right: -3,
                        width: 17, height: 17, background: "var(--sr)",
                        borderRadius: "50%", fontSize: 9, color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 500
                    }}>
                        {totalNoLeidas > 9 ? "9+" : totalNoLeidas}
                    </div>
                )}
            </div>

            {/* PANEL FLOTANTE CONVERSACIONES */}
            <div style={{
                position: "fixed", bottom: 78, right: 24,
                width: 360, maxWidth: "calc(100vw - 48px)",
                height: 460, background: "var(--surface)",
                border: "0.5px solid var(--border2)",
                borderRadius: 13, display: "flex",
                flexDirection: "column", overflow: "hidden",
                zIndex: 50, transition: "all .18s cubic-bezier(.4,0,.2,1)",
                transform: chatOpen ? "scale(1) translateY(0)" : "scale(.94) translateY(12px)",
                opacity: chatOpen ? 1 : 0,
                pointerEvents: chatOpen ? "all" : "none",
            }}>
                <div style={{
                    padding: "10px 12px",
                    borderBottom: "0.5px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 8, flexShrink: 0
                }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", flex: 1 }}>
                        Conversaciones activas
                    </div>
                    <button
                        onClick={() => setChatOpen(false)}
                        style={{
                            width: 24, height: 24, borderRadius: 5,
                            border: "0.5px solid var(--border2)",
                            background: "var(--surface2)", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "var(--text2)", fontSize: 11
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                    {conversaciones.length === 0 ? (
                        <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text3)" }}>
                            Sin conversaciones activas
                        </div>
                    ) : conversaciones.map(conv => {
                        const badge = badgeModo(conv.modo)
                        const ini = iniciales(conv.cliente.nombre)
                        const colors = [
                            { bg: "var(--sab)", text: "var(--sa)" },
                            { bg: "var(--sbb)", text: "var(--sb)" },
                            { bg: "var(--sgb)", text: "var(--sg)" },
                            { bg: "var(--spb)", text: "var(--sp)" },
                        ]
                        const color = colors[conv.id % colors.length]

                        return (
                            <div
                                key={conv.id}
                                onClick={() => {
                                    router.push(`/dashboard/conversaciones/${conv.id}`)
                                    setChatOpen(false)
                                }}
                                style={{
                                    display: "flex", alignItems: "center", gap: 9,
                                    padding: "8px 12px",
                                    borderBottom: "0.5px solid var(--border)",
                                    cursor: "pointer", transition: "background .1s"
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                                <div style={{
                                    width: 28, height: 28, borderRadius: "50%",
                                    background: color.bg, color: color.text,
                                    display: "flex", alignItems: "center",
                                    justifyContent: "center", fontSize: 10,
                                    fontWeight: 500, flexShrink: 0
                                }}>
                                    {ini}
                                </div>
                                <div style={{ flex: 1, overflow: "hidden" }}>
                                    <div style={{
                                        fontSize: 12, fontWeight: 500, color: "var(--text)",
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                    }}>
                                        {conv.cliente.nombre}
                                    </div>
                                    <div style={{
                                        fontSize: 11, color: "var(--text3)", marginTop: 1,
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                    }}>
                                        {conv.ultimo_mensaje
                                            ? `${conv.ultimo_mensaje.origen === "cliente" ? "" : conv.ultimo_mensaje.origen === "bot" ? "Bot: " : "Tú: "}${conv.ultimo_mensaje.contenido.slice(0, 40)}`
                                            : "Sin mensajes"
                                        }
                                    </div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 3 }}>
                                        {tiempoRelativo(conv.updated_at)}
                                    </div>
                                    <span style={{
                                        display: "inline-flex", alignItems: "center",
                                        padding: "1px 6px", borderRadius: 20,
                                        fontSize: 9, fontWeight: 500,
                                        background: badge.bg, color: badge.text
                                    }}>
                                        {badge.label}
                                    </span>
                                    {conv.notificaciones_no_leidas > 0 && (
                                        <div style={{
                                            width: 6, height: 6, borderRadius: "50%",
                                            background: "var(--sr)", marginLeft: "auto",
                                            marginTop: 2
                                        }} />
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div style={{
                    padding: "8px 12px",
                    borderTop: "0.5px solid var(--border)",
                    display: "flex", justifyContent: "center"
                }}>
                    <button
                        onClick={() => { router.push("/dashboard/conversaciones"); setChatOpen(false) }}
                        style={{
                            fontSize: 12, color: "var(--accent)", cursor: "pointer",
                            background: "none", border: "none", fontFamily: "inherit"
                        }}
                    >
                        Ver todas las conversaciones →
                    </button>
                </div>
            </div>
        </div>
    )
}

// =========================
// COMPONENTES AUXILIARES
// =========================

function IconButton({
    children, onClick, title
}: {
    children: React.ReactNode
    onClick: () => void
    title?: string
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            style={{
                width: 30, height: 30, borderRadius: 7,
                border: "0.5px solid var(--border2)",
                background: "var(--surface2)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text2)", flexShrink: 0, position: "relative",
                transition: "background .12s"
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--surface3)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--surface2)")}
        >
            {children}
        </button>
    )
}

function IconGrid({ active }: { active: boolean }) {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" style={{ opacity: active ? 1 : .7 }}>
            <rect x="1" y="1" width="6" height="6" rx="1.5" />
            <rect x="9" y="1" width="6" height="6" rx="1.5" />
            <rect x="1" y="9" width="6" height="6" rx="1.5" />
            <rect x="9" y="9" width="6" height="6" rx="1.5" />
        </svg>
    )
}

function IconHome({ active }: { active: boolean }) {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" style={{ opacity: active ? 1 : .7 }}>
            <path d="M1 8L8 2l7 6" />
            <path d="M3 6.5V14h3.5v-3.5h3V14H13V6.5" />
        </svg>
    )
}

function IconChat({ active }: { active: boolean }) {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" style={{ opacity: active ? 1 : .7 }}>
            <path d="M14 10.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2.5V3.5C1.5 2.7 2.2 2 3 2h10c.8 0 1.5.7 1.5 1.5v7z" />
        </svg>
    )
}

function IconUser({ active }: { active: boolean }) {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" style={{ opacity: active ? 1 : .7 }}>
            <circle cx="8" cy="5" r="3" />
            <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
    )
}

function IconCalendar({ active }: { active: boolean }) {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" style={{ opacity: active ? 1 : .7 }}>
            <rect x="1" y="3" width="14" height="12" rx="1.5" />
            <path d="M1 7h14M5 1v4M11 1v4" />
        </svg>
    )
}

function IconClock({ active }: { active: boolean }) {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" style={{ opacity: active ? 1 : .7 }}>
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 4.5V8l2.5 2.5" />
        </svg>
    )
}

function IconSettings({ active }: { active: boolean }) {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" style={{ opacity: active ? 1 : .7 }}>
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M11.3 3.3l-1.4 1.4M4.7 11.3l-1.4 1.4" />
        </svg>
    )
}