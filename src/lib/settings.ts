import fs from "node:fs/promises";
import path from "node:path";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

export type AiProvider = "gateway" | "claude-cli";

interface AppSettings {
  aiGatewayKey?: string;
  /** Defaults to "gateway" when unset. */
  aiProvider?: AiProvider;
}

async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    return JSON.parse(raw) as AppSettings;
  } catch {
    return {};
  }
}

async function writeSettings(settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

/** Never expose this value to the client - server-side use only. */
export async function getAiGatewayKey(): Promise<string | null> {
  const settings = await readSettings();
  return settings.aiGatewayKey?.trim() || null;
}

export async function hasAiGatewayKey(): Promise<boolean> {
  return (await getAiGatewayKey()) !== null;
}

/** Pass null or an empty string to clear the saved key. */
export async function setAiGatewayKey(key: string | null): Promise<void> {
  const settings = await readSettings();
  const trimmed = key?.trim();
  if (trimmed) {
    settings.aiGatewayKey = trimmed;
  } else {
    delete settings.aiGatewayKey;
  }
  await writeSettings(settings);
}

export async function getAiProvider(): Promise<AiProvider> {
  const settings = await readSettings();
  return settings.aiProvider === "claude-cli" ? "claude-cli" : "gateway";
}

export async function setAiProvider(provider: AiProvider): Promise<void> {
  const settings = await readSettings();
  settings.aiProvider = provider;
  await writeSettings(settings);
}

export type AiAccess = { provider: "gateway"; apiKey: string } | { provider: "claude-cli" };

/** The credentials/route to use for AI calls, or null if the selected provider isn't set up. */
export async function getAiAccess(): Promise<AiAccess | null> {
  if ((await getAiProvider()) === "claude-cli") return { provider: "claude-cli" };
  const apiKey = await getAiGatewayKey();
  return apiKey ? { provider: "gateway", apiKey } : null;
}

/** True when autograding can run with the currently selected provider. */
export async function isAiConfigured(): Promise<boolean> {
  return (await getAiAccess()) !== null;
}
