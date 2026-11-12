"use client";

import { useState, type FormEvent } from "react";

type Provider = "gateway" | "claude-cli";

export function SettingsForm({
  initiallyConfigured,
  initialProvider,
  cliAvailable,
}: {
  initiallyConfigured: boolean;
  initialProvider: Provider;
  cliAvailable: boolean;
}) {
  const [configured, setConfigured] = useState(initiallyConfigured);
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(nextKey: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiGatewayKey: nextKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");

      setConfigured(data.hasAiGatewayKey);
      setKey("");
      setMessage(nextKey ? "Key saved." : "Key cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseProvider(next: Provider) {
    if (next === provider) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiProvider: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      setProvider(data.aiProvider);
      setMessage("AI provider updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    save(key.trim());
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2" disabled={saving}>
        <legend className="text-sm font-medium text-ink">AI provider</legend>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="radio"
            name="aiProvider"
            checked={provider === "gateway"}
            onChange={() => chooseProvider("gateway")}
            className="mt-1"
          />
          <span>
            Vercel AI Gateway
            <span className="block text-xs text-muted">Uses the API key below; any model on the Gateway.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="radio"
            name="aiProvider"
            checked={provider === "claude-cli"}
            onChange={() => chooseProvider("claude-cli")}
            className="mt-1"
          />
          <span>
            Claude subscription of this machine
            <span className="block text-xs text-muted">
              Runs the local <code>claude</code> CLI, billed to the account it is logged in with (
              <code>claude login</code>). Opus, Sonnet or Haiku.
            </span>
            {!cliAvailable && (
              <span className="block text-xs text-red-600">
                The <code>claude</code> CLI was not found on this machine.
              </span>
            )}
          </span>
        </label>
      </fieldset>

      <div className={provider === "claude-cli" ? "opacity-50" : undefined}>
        <label htmlFor="aiGatewayKey" className="block text-sm font-medium text-ink">
          Vercel AI Gateway API key
        </label>
        <p className="mt-0.5 text-xs text-muted">
          {configured
            ? "A key is currently configured. Enter a new one to replace it."
            : "No key configured yet - autograding is disabled until one is set."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          id="aiGatewayKey"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={configured ? "••••••••••••" : "vck_..."}
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={!key.trim() || saving}
          className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-40"
        >
          Save
        </button>
      </form>

      {configured && (
        <button
          type="button"
          onClick={() => save("")}
          disabled={saving}
          className="text-xs text-red-600 hover:underline disabled:opacity-40"
        >
          Clear saved key
        </button>
      )}

      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
