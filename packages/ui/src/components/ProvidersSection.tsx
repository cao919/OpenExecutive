"use client";

import { useEffect, useState } from "react";

import Icon from "@/components/Icon";
import { useT } from "@/i18n";

// ---------- Types (mirror backend schema) ----------

interface CustomProvider {
  id: number;
  name: string;
  base_url: string;
  api_key_masked: string | null;
  has_api_key: boolean;
  models: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ProviderTestResult {
  ok: boolean;
  status_code?: number;
  latency_ms?: number;
  error?: string | null;
  advertised_models?: string[] | null;
}

// Sentinel for "the user is editing — the api_key field is undeclared
// in payload, so the existing value stays". Distinct from `""` which
// means "wipe the key".
const KEY_UNCHANGED = "__unchanged__";

// Status color palette — matches the rest of the app's Briefing /
// Council chips (dark theme). Kept inline at module scope so the
// <span className={...}> calls below stay short.
const COLOR_OK = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
const COLOR_OK_SOLID = "text-emerald-300";
const COLOR_WARN = "bg-amber-500/20 text-amber-300 border-amber-500/30";
const COLOR_DANGER = "text-rose-300";
const COLOR_DANGER_HOVER = "hover:bg-rose-500/15";

// ---------- Component ----------

export function ProvidersSection() {
  const t = useT();
  const [providers, setProviders] = useState<CustomProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  const reload = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/backend/providers", { cache: "no-store" });
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      setProviders((await r.json()) as CustomProvider[]);
    } catch (e) {
      setLoadError(t("providers.errorLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      aria-labelledby="settings-providers-heading"
      className="mt-6 rounded-xl border border-line bg-surface-elevated p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-fg-muted">
          <Icon name="cpu" size="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2
            id="settings-providers-heading"
            className="text-sm font-medium text-fg"
          >
            {t("providers.title")}
          </h2>
          <p className="mt-1 text-xs text-fg-muted leading-relaxed">
            {t("providers.subtitle")}
          </p>

          {/* Built-in section (informational; toggling requires .env) */}
          <div className="mt-3 rounded-md border border-line bg-surface p-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
              {t("providers.builtInSectionTitle")}
            </h3>
            <p className="mt-1 text-xs text-fg-muted leading-relaxed">
              {t("providers.builtInSectionSub")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  t("providers.builtInAnthropic"),
                  t("providers.builtInOpenrouter"),
                  t("providers.builtInLocal"),
                  t("providers.builtInZhipuai"),
                ] as string[]
              ).map((label) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-overlay px-2 py-0.5 text-[11px] font-medium text-fg-muted"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Custom providers list */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
                {t("providers.customBadge")}
              </h3>
              {editingId === null && (
                <button
                  type="button"
                  onClick={() => setEditingId("new")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-fg/[0.05] px-2.5 py-1 text-xs font-medium text-fg hover:bg-fg/[0.10] transition-colors"
                >
                  <Icon name="plus" size="w-3.5 h-3.5" />
                  {t("providers.addButton")}
                </button>
              )}
            </div>

            {/* Inline add/edit form */}
            {editingId !== null && (
              <ProviderForm
                key={editingId === "new" ? "new" : `edit-${editingId}`}
                mode={editingId === "new" ? "create" : "edit"}
                initial={
                  editingId === "new"
                    ? undefined
                    : providers.find((p) => p.id === editingId)
                }
                existingNames={providers
                  .filter(
                    (p) => p.id !== (editingId === "new" ? -1 : editingId)
                  )
                  .map((p) => p.name)}
                onClose={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  reload();
                }}
              />
            )}

            {loadError && (
              <p className={`mt-3 text-xs ${COLOR_DANGER}`} role="alert">
                {loadError}
              </p>
            )}

            {loading && !loadError && providers.length === 0 ? (
              <p className="mt-3 text-xs text-fg-muted">{t("common.loading")}</p>
            ) : providers.length === 0 && editingId === null ? (
              <p className="mt-3 text-xs text-fg-muted">{t("providers.empty")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {providers.map((p) => (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    onChange={() => reload()}
                    onEdit={() => setEditingId(p.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Provider card ----------

function ProviderCard({
  provider,
  onChange,
  onEdit,
}: {
  provider: CustomProvider;
  onChange: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);

  const toggleEnabled = async (nextEnabled: boolean) => {
    try {
      const r = await fetch(`/api/backend/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      onChange();
      setTestResult(null);
    } catch {
      setTestResult({ ok: false, error: t("providers.errorSave") });
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("providers.confirmDelete"))) return;
    try {
      const r = await fetch(`/api/backend/providers/${provider.id}`, {
        method: "DELETE",
      });
      if (r.status !== 204 && !r.ok) throw new Error(`HTTP ${r.status}`);
      onChange();
    } catch {
      setTestResult({ ok: false, error: t("providers.errorDelete") });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`/api/backend/providers/${provider.id}/test`, {
        method: "POST",
      });
      const body = (await r.json()) as ProviderTestResult;
      setTestResult(body);
    } catch {
      setTestResult({ ok: false, error: t("providers.errorTest") });
    } finally {
      setTesting(false);
    }
  };

  return (
    <li className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-fg truncate">
              {provider.name}
            </h4>
            {provider.enabled ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${COLOR_OK}`}
              >
                {t("providers.statusOk")}
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${COLOR_WARN}`}
              >
                {t("providers.statusDisabled")}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-fg-muted font-mono">
            {provider.base_url}
          </p>
          {provider.has_api_key && (
            <p className="mt-0.5 truncate text-[11px] text-fg-subtle font-mono">
              {t("providers.fieldApiKey")}: {provider.api_key_masked}
            </p>
          )}
          {provider.models.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {provider.models.map((m) => (
                <li
                  key={m}
                  className="inline-flex items-center rounded border border-line bg-surface-overlay px-1.5 py-0.5 text-[10px] font-mono text-fg-muted"
                >
                  {m}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-overlay px-2 py-1 text-[11px] font-medium text-fg hover:bg-fg/[0.05] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <Icon
                name="restore"
                size="w-3 h-3"
                className={testing ? "animate-spin" : ""}
              />
              {t("providers.testButton")}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-overlay px-2 py-1 text-[11px] font-medium text-fg hover:bg-fg/[0.05] transition-colors"
            >
              {t("providers.editButton")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className={`inline-flex items-center gap-1 rounded-md border border-line bg-surface-overlay px-2 py-1 text-[11px] font-medium ${COLOR_DANGER} ${COLOR_DANGER_HOVER} transition-colors`}
            >
              {t("providers.deleteButton")}
            </button>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
            <input
              type="checkbox"
              checked={provider.enabled}
              onChange={(e) => toggleEnabled(e.target.checked)}
              className="h-3 w-3 accent-fg"
            />
            {t("providers.fieldEnabled")}
          </label>
        </div>
      </div>
      {/* Test result strip — collapsible row, shows up only after Test */}
      {testResult && (
        <div
          className="mt-2 rounded border border-line bg-surface-overlay px-2 py-1.5 text-[11px]"
          aria-live="polite"
        >
          {testResult.ok ? (
            <span className={COLOR_OK_SOLID}>
              {t("providers.statusOk")} ·{" "}
              {testResult.status_code != null &&
                `${t("providers.statusStatus")} ${testResult.status_code}`}
              {testResult.latency_ms != null &&
                ` · ${testResult.latency_ms}ms`}
              {testResult.advertised_models &&
                testResult.advertised_models.length > 0 && (
                  <span className="ml-1 text-fg-muted">
                    · {testResult.advertised_models.length}{" "}
                    {t("providers.statusAdvertisedModels")}
                  </span>
                )}
            </span>
          ) : (
            <span className={COLOR_DANGER}>
              {t("providers.statusFail")}
              {testResult.status_code != null &&
                ` · ${t("providers.statusStatus")} ${testResult.status_code}`}
              {testResult.error && ` · ${testResult.error}`}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

// ---------- Form (create + edit, inline) ----------

interface ProviderFormProps {
  mode: "create" | "edit";
  initial?: CustomProvider;
  existingNames: string[];
  onClose: () => void;
  onSaved: () => void;
}

function ProviderForm({
  mode,
  initial,
  existingNames,
  onClose,
  onSaved,
}: ProviderFormProps) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? "");
  const [apiKey, setApiKey] = useState(KEY_UNCHANGED);
  const [modelsText, setModelsText] = useState(
    initial?.models.join("\n") ?? ""
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const modelsList = modelsText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const trimmedName = name.trim();
  const trimmedUrl = baseUrl.trim();
  const valid =
    trimmedName.length > 0 &&
    /^https?:\/\//.test(trimmedUrl) &&
    modelsList.length > 0;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const url =
        mode === "create"
          ? "/api/backend/providers"
          : `/api/backend/providers/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const body: Record<string, unknown> = {
        name: trimmedName,
        base_url: trimmedUrl,
        models: modelsList,
        enabled,
      };
      if (mode === "edit") {
        // For edits, omit api_key unless the user typed something
        // new. `clear_api_key` is for an explicit "wipe" intent via
        // a separate UI control we don't currently expose.
        if (apiKey === KEY_UNCHANGED) {
          // Send no api_key field — server treats unset as "leave alone".
        } else {
          body.api_key = apiKey;
        }
      } else {
        body.api_key = apiKey === KEY_UNCHANGED ? null : apiKey;
      }

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`${r.status}: ${errText}`);
      }
      onSaved();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : t("providers.errorSave")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-line-strong bg-surface p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t("providers.fieldName")}
          help={
            existingNames.includes(trimmedName)
              ? t("providers.validationDuplicate")
              : null
          }
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("providers.fieldNamePlaceholder")}
            className="w-full rounded-md border border-line bg-surface-overlay px-2 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-fg/20"
          />
        </Field>
        <Field
          label={t("providers.fieldBaseUrl")}
          help={
            trimmedUrl && !/^https?:\/\//.test(trimmedUrl)
              ? t("providers.validationInvalidUrl")
              : null
          }
        >
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={t("providers.fieldBaseUrlPlaceholder")}
            className="w-full rounded-md border border-line bg-surface-overlay px-2 py-1.5 text-sm text-fg font-mono placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-fg/20"
          />
        </Field>
        <Field
          label={t("providers.fieldApiKey")}
          help={
            mode === "edit" && initial?.has_api_key && apiKey === KEY_UNCHANGED
              ? initial.api_key_masked
              : null
          }
        >
          <input
            type="password"
            value={apiKey === KEY_UNCHANGED ? "" : apiKey}
            onChange={(e) => setApiKey(e.target.value || KEY_UNCHANGED)}
            placeholder={
              mode === "edit" && initial?.has_api_key
                ? "•••（留空保持现有 key）"
                : t("providers.fieldApiKeyPlaceholder")
            }
            autoComplete="off"
            className="w-full rounded-md border border-line bg-surface-overlay px-2 py-1.5 text-sm text-fg font-mono placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-fg/20"
          />
        </Field>
        <Field
          label={t("providers.fieldModels")}
          help={
            modelsList.length === 0
              ? t("providers.validationNoModels")
              : t("providers.fieldModelsHelp")
          }
        >
          <textarea
            value={modelsText}
            onChange={(e) => setModelsText(e.target.value)}
            rows={3}
            placeholder={t("providers.fieldModelsPlaceholder")}
            className="w-full rounded-md border border-line bg-surface-overlay px-2 py-1.5 text-sm text-fg font-mono placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-fg/20"
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-fg">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-3.5 w-3.5 accent-fg"
          />
          {t("providers.fieldEnabled")}
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line bg-surface-overlay px-3 py-1.5 text-xs font-medium text-fg hover:bg-fg/[0.05] transition-colors"
          >
            {t("providers.cancelButton")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || submitting}
            className="rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg hover:bg-fg/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {t("providers.saveButton")}
          </button>
        </div>
      </div>
      {submitError && (
        <p
          className={`mt-2 text-xs ${COLOR_DANGER} whitespace-pre-wrap break-all`}
          role="alert"
        >
          {submitError}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {help && <p className="mt-1 text-[11px] text-fg-subtle">{help}</p>}
    </label>
  );
}
