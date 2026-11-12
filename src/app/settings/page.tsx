import { hasAiGatewayKey, getAiProvider } from "@/lib/settings";
import { isClaudeCliAvailable } from "@/lib/claudeCli";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [configured, provider, cliAvailable] = await Promise.all([
    hasAiGatewayKey(),
    getAiProvider(),
    isClaudeCliAvailable(),
  ]);

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <h1 className="font-display text-[28px] font-semibold text-ink">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Choose how solutions are autograded with an AI model: the Vercel AI Gateway, or the Claude subscription of
        the machine this tool runs on.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]">
        <SettingsForm initiallyConfigured={configured} initialProvider={provider} cliAvailable={cliAvailable} />
      </div>
    </div>
  );
}
