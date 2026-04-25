export interface DatosCedula {
    valida: boolean
    cedula: string
    nombres?: string
    apellidos?: string
    nombre_completo?: string
    error?: string
}

export async function validarCedulaAPI(cedula: string): Promise<DatosCedula> {
    if (!validarDigitoVerificador(cedula)) {
        return { valida: false, cedula, error: "Cédula inválida" }
    }

    try {
        const proxyUrl = "https://infoplacas.herokuapp.com/"
        const targetUrl = "https://si.secap.gob.ec/sisecap/logeo_web/json/busca_persona_registro_civil.php"

        const body = new URLSearchParams({ documento: cedula, tipo: "1" })

        const res = await fetch(proxyUrl + targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Origin": "'", },
            body: body.toString(),
            signal: AbortSignal.timeout(8000),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const text = await res.text()
        if (!text) throw new Error("Respuesta vacía")

        const data = JSON.parse(text)

        if (!data?.nombres || !data?.apellidos) {
            return {
                valida: false,
                cedula,
                error: "Cédula no encontrada en el Registro Civil",
            }
        }

        return {
            valida: true,
            cedula,
            nombres: data.nombres,
            apellidos: data.apellidos,
            nombre_completo: `${data.apellidos} ${data.nombres}`.trim(),
        }

    } catch (error: any) {
        console.error("[Cédula API] Error:", error.message)
        return {
            valida: true,
            cedula,
            error: "API no disponible — cédula válida matemáticamente",
        }
    }
}

function validarDigitoVerificador(cedula: string): boolean {
    if (!/^\d{10}$/.test(cedula)) return false

    const provincia = parseInt(cedula.substring(0, 2))
    if (provincia < 1 || provincia > 24) return false

    const digitos = cedula.split("").map(Number)
    const verificador = digitos[9]
    let suma = 0

    for (let i = 0; i < 9; i++) {
        let val = digitos[i]
        if (i % 2 === 0) {
            val *= 2
            if (val > 9) val -= 9
        }
        suma += val
    }

    const resultado = suma % 10 === 0 ? 0 : 10 - (suma % 10)
    return resultado === verificador
}