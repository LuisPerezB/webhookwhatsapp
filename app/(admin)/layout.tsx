import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import AdminLayoutClient from "./layout-client"

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await getSession()

    if (!session) {
        redirect("/auth/login")
    }

    return (
        <AdminLayoutClient session={session}>
            {children}
        </AdminLayoutClient>
    )
}