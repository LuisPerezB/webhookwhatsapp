"use client"

import { useState } from "react"

interface Props {
    configInicial: any
    tenant: any
    numbers: any[]
    user: any
}

export default function ConfigClient({ configInicial, tenant, numbers, user }: Props) {
    const [config, setConfig] = useState({
        bot_activo: configInicial.bot_activo ?? true,
        saludo: configInicial.saludo || "",
        tiempo_inactividad_min: configInicial.tiempo_inactividad_min ?? 15,
        tiempo_manual_min: configInicial.tiempo_manual_min ?? 15,
        dias_max_cita: configInicial.dias_max_cita ?? 7,
        intentos_cedula_max: configInicial.intentos_cedula_max ?? 2,
        permite_proyectos: configInicial.permite_proyectos ?? true,
        permite_asesor: configInicial.permite_asesor ?? true,
        notificar_lead_nuevo: configInicial.notificar_lead_nuevo ?? true,
        notificar_cita_nueva: configInicial.notificar_cita_nueva ?? true,
        bot_control_numbers: configInicial.bot_control_numbers || [],
    })
    const [guardando, setGuardando] = useState(false)
    const [toast, setToast] = useState("")
    const [nuevoNumero, setNuevoNumero] = useState("")

    const mostrarToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(""), 2200)
    }

    const guardar = async () => {
        setGuardando(true)
        try {
            const res = await fetch("/api/admin/config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config })
            })
            if (res.ok) mostrarToast("Configuración guardada ✓")
            else mostrarToast("Error al guardar")
        } finally {
            setGuardando(false)
        }
    }

    const agregarNumero = () => {
        const num = nuevoNumero.trim().replace(/\s/g, "")
        if (!num) return
        setConfig(prev => ({
            ...prev,
            bot_control_numbers: [...prev.bot_control_numbers, num]
        }))
        setNuevoNumero("")
    }

    const quitarNumero = (i: number) => {
        setConfig(prev => ({
            ...prev,
            bot_control_numbers: prev.bot_control_numbers.filter((_: any, idx: number) => idx !== i)
        }))
    }

    const formatPlan = (plan: string) => ({
        starter: "Starter", pro: "Pro", enterprise: "Enterprise"
    }[plan] || plan || "—")

    const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
        <div
            onClick={() => onChange(!value)}
            style={{
                width: 34, height: 18, borderRadius: 9,
                background: value ? "var(--accent)" : "var(--surface2)",
                border: `0.5px solid ${value ? "var(--accent)" : "var(--border2)"}`,
                cursor: "pointer", position: "relative",
                transition: "all .15s", flexShrink: 0
            }}
        >
            <div style={{
                position: "absolute", width: 12, height: 12,
                borderRadius: "50%", background: "#fff",
                top: 2, left: value ? 18 : 2, transition: "left .15s"
            }} />
        </div>
    )

    const Seccion = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
        <div style={{ padding: "16px 18px", borderBottom: "0.5px solid var(--border)" }}>
            <div style={{
                fontSize: 12, fontWeight: 500, color: "var(--text)",
                marginBottom: 12
            }}>
                {titulo}
            </div>
            {children}
        </div>
    )

    const Fila = ({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) => (
        <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 12,
            padding: "6px 0"
        }}>
            <div>
                <div style={{ fontSize: 13, color: "var(--text)" }}>{label}</div>
                {sub && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{sub}</div>}
            </div>
            {children}
        </div>
    )

    return (
        <div>
            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16, flexWrap: "wrap", gap: 10
            }}>
                <div style={{
                    fontSize: 22, fontWeight: 500, color: "var(--text)",
                    fontFamily: "'DM Serif Display', serif"
                }}>
                    Configuración
                </div>
                <button
                    onClick={guardar}
                    disabled={guardando}
                    style={{
                        padding: "7px 16px", borderRadius: 7,
                        background: "var(--accent)", color: "#fff",
                        border: "none", cursor: "pointer",
                        fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                        opacity: guardando ? 0.6 : 1
                    }}
                >
                    {guardando ? "Guardando..." : "Guardar cambios"}
                </button>
            </div>

            <div style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                borderRadius: 10, overflow: "hidden"
            }}>
                {/* Bot activo */}
                <Seccion titulo="Bot de WhatsApp">
                    <Fila label="Bot activo" sub="El bot responde automáticamente a los clientes">
                        <Toggle
                            value={config.bot_activo}
                            onChange={v => setConfig(p => ({ ...p, bot_activo: v }))}
                        />
                    </Fila>
                    <Fila label="Permite proyectos" sub="Mostrar proyectos inmobiliarios en el bot">
                        <Toggle
                            value={config.permite_proyectos}
                            onChange={v => setConfig(p => ({ ...p, permite_proyectos: v }))}
                        />
                    </Fila>
                    <Fila label="Botón hablar con asesor" sub="Mostrar opción de contacto humano">
                        <Toggle
                            value={config.permite_asesor}
                            onChange={v => setConfig(p => ({ ...p, permite_asesor: v }))}
                        />
                    </Fila>
                </Seccion>

                {/* Tiempos */}
                <Seccion titulo="Tiempos">
                    {[
                        {
                            key: "tiempo_inactividad_min",
                            label: "Tiempo de inactividad (min)",
                            sub: "Reinicia el flujo si el cliente no responde"
                        },
                        {
                            key: "tiempo_manual_min",
                            label: "Tiempo modo manual (min)",
                            sub: "El bot se reactiva automáticamente después de este tiempo"
                        },
                        {
                            key: "dias_max_cita",
                            label: "Días máximos para cita",
                            sub: "Ventana de horarios disponibles para agendar"
                        },
                        {
                            key: "intentos_cedula_max",
                            label: "Intentos máx. de cédula",
                            sub: "Intentos antes de pasar a modo manual"
                        },
                    ].map(f => (
                        <Fila key={f.key} label={f.label} sub={f.sub}>
                            <input
                                type="number"
                                value={config[f.key as keyof typeof config] as number}
                                onChange={e => setConfig(p => ({
                                    ...p, [f.key]: parseInt(e.target.value) || 0
                                }))}
                                style={{
                                    width: 64, padding: "5px 8px",
                                    borderRadius: 7, border: "0.5px solid var(--border2)",
                                    background: "var(--surface2)", color: "var(--text)",
                                    fontFamily: "inherit", fontSize: 13,
                                    outline: "none", textAlign: "center"
                                }}
                            />
                        </Fila>
                    ))}
                </Seccion>

                {/* Notificaciones */}
                <Seccion titulo="Notificaciones">
                    <Fila label="Notificar lead nuevo" sub="Alerta cuando un cliente nuevo escribe por primera vez">
                        <Toggle
                            value={config.notificar_lead_nuevo}
                            onChange={v => setConfig(p => ({ ...p, notificar_lead_nuevo: v }))}
                        />
                    </Fila>
                    <Fila label="Notificar cita nueva" sub="Alerta cuando se agenda una cita">
                        <Toggle
                            value={config.notificar_cita_nueva}
                            onChange={v => setConfig(p => ({ ...p, notificar_cita_nueva: v }))}
                        />
                    </Fila>
                </Seccion>

                {/* Saludo */}
                <Seccion titulo="Mensaje de saludo">
                    <textarea
                        value={config.saludo}
                        onChange={e => setConfig(p => ({ ...p, saludo: e.target.value }))}
                        placeholder="Ej: Hola 👋 Bienvenido a nuestra inmobiliaria..."
                        rows={3}
                        style={{
                            width: "100%", padding: "8px 10px",
                            borderRadius: 7, border: "0.5px solid var(--border2)",
                            background: "var(--surface2)", color: "var(--text)",
                            fontFamily: "inherit", fontSize: 13, outline: "none",
                            resize: "vertical"
                        }}
                    />
                </Seccion>

                {/* Números de control */}
                <Seccion titulo="Números de control">
                    <div style={{
                        fontSize: 11, color: "var(--text3)", marginBottom: 10
                    }}>
                        Números de WhatsApp que pueden enviar comandos al bot
                        (modo manual, modo auto, citas hoy, leads hoy)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {config.bot_control_numbers.map((num: string, i: number) => (
                            <div key={i} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                                <input
                                    type="text"
                                    value={num}
                                    onChange={e => {
                                        const nums = [...config.bot_control_numbers]
                                        nums[i] = e.target.value
                                        setConfig(p => ({ ...p, bot_control_numbers: nums }))
                                    }}
                                    style={{
                                        flex: 1, padding: "6px 9px",
                                        borderRadius: 7, border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", color: "var(--text)",
                                        fontFamily: "inherit", fontSize: 12, outline: "none"
                                    }}
                                />
                                <button
                                    onClick={() => quitarNumero(i)}
                                    style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        border: "0.5px solid var(--border2)",
                                        background: "var(--surface2)", cursor: "pointer",
                                        display: "flex", alignItems: "center",
                                        justifyContent: "center", color: "var(--text2)"
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLElement).style.background = "var(--srb)"
                                        ;(e.currentTarget as HTMLElement).style.color = "var(--sr)"
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLElement).style.background = "var(--surface2)"
                                        ;(e.currentTarget as HTMLElement).style.color = "var(--text2)"
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}

                        {/* Agregar número */}
                        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                            <input
                                type="text"
                                value={nuevoNumero}
                                onChange={e => setNuevoNumero(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") agregarNumero() }}
                                placeholder="593987654321 (sin + ni espacios)"
                                style={{
                                    flex: 1, padding: "6px 9px",
                                    borderRadius: 7, border: "0.5px solid var(--border2)",
                                    background: "var(--surface2)", color: "var(--text)",
                                    fontFamily: "inherit", fontSize: 12, outline: "none"
                                }}
                            />
                            <button
                                onClick={agregarNumero}
                                style={{
                                    padding: "6px 12px", borderRadius: 7,
                                    border: "0.5px solid var(--border2)",
                                    background: "var(--surface2)", cursor: "pointer",
                                    fontSize: 12, color: "var(--text2)",
                                    fontFamily: "inherit"
                                }}
                            >
                                + Agregar
                            </button>
                        </div>
                    </div>
                </Seccion>

                {/* Números WhatsApp registrados */}
                <Seccion titulo="Números de WhatsApp">
                    {numbers.map(n => (
                        <div key={n.id} style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", padding: "6px 0"
                        }}>
                            <div>
                                <div style={{ fontSize: 13, color: "var(--text)" }}>{n.numero}</div>
                                <div style={{ fontSize: 10, color: "var(--text3)" }}>
                                    ID: {n.phone_number_id}
                                </div>
                            </div>
                            <span style={{
                                padding: "2px 8px", borderRadius: 20,
                                fontSize: 10, fontWeight: 500,
                                background: n.activo ? "var(--sgb)" : "var(--sgrb)",
                                color: n.activo ? "var(--sg)" : "var(--sgr)"
                            }}>
                                {n.activo ? "activo" : "inactivo"}
                            </span>
                        </div>
                    ))}
                </Seccion>

                {/* Suscripción */}
                <div style={{ padding: "16px 18px" }}>
                    <div style={{
                        fontSize: 12, fontWeight: 500, color: "var(--text)",
                        marginBottom: 12
                    }}>
                        Suscripción
                    </div>
                    <Fila label="Plan activo" sub={user.paid_until
                        ? `Próximo cobro: ${new Date(user.paid_until).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })}`
                        : undefined
                    }>
                        <span style={{
                            padding: "4px 12px", borderRadius: 20,
                            background: "var(--sgb)", color: "var(--sg)",
                            fontSize: 12, fontWeight: 500
                        }}>
                            {formatPlan(user.suscription_plan)}
                        </span>
                    </Fila>
                </div>
            </div>

            {toast && (
                <div style={{
                    position: "fixed", bottom: 24, left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--accent)", color: "#fff",
                    padding: "7px 16px", borderRadius: 8,
                    fontSize: 12, fontWeight: 500, zIndex: 99,
                    whiteSpace: "nowrap", pointerEvents: "none"
                }}>
                    {toast}
                </div>
            )}
        </div>
    )
}