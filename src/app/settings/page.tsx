import { hasAiGatewayKey } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const configured = await hasAiGatewayKey();

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Settings</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Configure the Vercel AI Gateway key used to autograde solutions with an AI model.
      </p>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <SettingsForm initiallyConfigured={configured} />
      </div>
    </div>
  );
}
