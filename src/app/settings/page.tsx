import { hasAiGatewayKey } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const configured = await hasAiGatewayKey();

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <h1 className="font-display text-[28px] font-semibold text-ink">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Configure the Vercel AI Gateway key used to autograde solutions with an AI model.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
        <SettingsForm initiallyConfigured={configured} />
      </div>
    </div>
  );
}
