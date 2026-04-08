import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function WhatsAppWebhookPage() {
  const webhookUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}/api/webhook/whatsapp`
    : "https://your-domain.vercel.app/api/webhook/whatsapp"

  return (
    <main className="min-h-screen bg-background p-6 md:p-12">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#25D366]">
              <WhatsAppIcon className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">WhatsApp Business API</h1>
              <p className="text-muted-foreground">Webhook Integration</p>
            </div>
          </div>
        </div>

        {/* Webhook URL Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-[#25D366]/10 text-[#25D366]">
                Endpoint Ready
              </Badge>
            </CardTitle>
            <CardDescription>
              Use this URL in your Meta Developer Console webhook configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block rounded-lg bg-muted p-4 text-sm font-mono break-all">
              {webhookUrl}
            </code>
          </CardContent>
        </Card>

        {/* Setup Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Setup Instructions</CardTitle>
            <CardDescription>
              Follow these steps to connect your WhatsApp Business account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1 */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                  1
                </span>
                Create a Meta App
              </h3>
              <p className="text-sm text-muted-foreground pl-8">
                Go to{" "}
                <a
                  href="https://developers.facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  developers.facebook.com
                </a>{" "}
                and create a new app with WhatsApp Business product.
              </p>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                  2
                </span>
                Configure Webhook
              </h3>
              <p className="text-sm text-muted-foreground pl-8">
                In your Meta App Dashboard, go to WhatsApp → Configuration → Webhook and enter your webhook URL.
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                  3
                </span>
                Set Environment Variables
              </h3>
              <div className="pl-8 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Add these environment variables to your Vercel project:
                </p>
                <div className="space-y-2">
                  <EnvVariable
                    name="WHATSAPP_VERIFY_TOKEN"
                    description="Your custom verification token (must match Meta console)"
                  />
                  <EnvVariable
                    name="WHATSAPP_TOKEN"
                    description="Permanent access token from Meta Developer Console"
                  />
                  <EnvVariable
                    name="WHATSAPP_PHONE_NUMBER_ID"
                    description="Your WhatsApp Business phone number ID"
                  />
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                  4
                </span>
                Subscribe to Webhook Fields
              </h3>
              <p className="text-sm text-muted-foreground pl-8">
                In the webhook configuration, subscribe to <code className="bg-muted px-1 rounded">messages</code> field to receive incoming messages.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* API Features */}
        <Card>
          <CardHeader>
            <CardTitle>Supported Features</CardTitle>
            <CardDescription>
              This webhook handles the following WhatsApp events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <FeatureItem title="Text Messages" description="Receive and process text messages" />
              <FeatureItem title="Media Messages" description="Images, audio, video, documents" />
              <FeatureItem title="Location Sharing" description="Receive location data" />
              <FeatureItem title="Interactive Messages" description="Button and list responses" />
              <FeatureItem title="Status Updates" description="Sent, delivered, read receipts" />
              <FeatureItem title="Template Messages" description="Send pre-approved templates" />
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          Check the server logs for incoming webhook events
        </p>
      </div>
    </main>
  )
}

function EnvVariable({ name, description }: { name: string; description: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <code className="text-sm font-semibold text-primary">{name}</code>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}

function FeatureItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="mt-0.5 h-2 w-2 rounded-full bg-[#25D366]" />
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
