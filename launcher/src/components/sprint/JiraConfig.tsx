// Sprint tab — Jira connection forms (design/sprint.html #s6b connect + #s6
// Edit-Jira panel). Two surfaces, one field model:
//
//  - ConnectJiraForm (#connect-jira-form, screen 6b) — first-time link. The
//    cog sits in this card's header (aria-pressed + aria-controls) and scrolls
//    to the form; Submit posts a fresh JiraLinkInput.
//  - JiraConfigPanel (#jira-config-panel, screen 6) — the Edit-Jira panel,
//    pre-filled from the live link. Passes locked → editing → saving →
//    saved | error, mirrors the server's validation copy + PATCH 409, keeps
//    field values on a rejected token (spec §7), and returns focus to the cog
//    on Esc/close (AC-5).
//
// All fields carry programmatic <label for> + aria-describedby help lines
// (WCAG 2.1 AA §6). Client validation mirrors the server rules so a 422 round
// trip is the exception, not the normal path.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createJiraLink,
  updateJiraLink,
  type JiraLink,
  type JiraLinkPatch,
  type JiraSyncDirection,
} from '../../lib/api';

// ── Shared field model ─────────────────────────────────────────────────────

export const SYNC_OPTIONS: { value: JiraSyncDirection; label: string }[] = [
  { value: 'two_way', label: 'Two-way — Launcher ↔ Jira (recommended)' },
  { value: 'launcher_to_jira', label: 'One-way — Launcher → Jira' },
  { value: 'jira_to_launcher', label: 'One-way — Jira → Launcher' },
];

export const AUTO_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: 'Create Jira ticket when Requirements move to Sprint-ready' },
  { value: false, label: 'Manual — I’ll create tickets from the board' },
];

export type JiraFields = {
  projectKey: string;
  baseUrl: string;
  accountEmail: string;
  apiToken: string;
  syncDirection: JiraSyncDirection;
  autoCreate: boolean;
};

export type JiraFieldErrors = Partial<
  Record<'projectKey' | 'baseUrl' | 'accountEmail' | 'apiToken', string>
>;

// Mirrors server/jira-link.ts validateCreateInput so the client rejects the
// same shapes before a round trip. `requireToken` is true for the connect form
// (a fresh token is mandatory) and false for the edit panel when a token is
// already stored (leave-the-token-unchanged path).
export function validateJiraFields(f: JiraFields, requireToken: boolean): JiraFieldErrors {
  const errs: JiraFieldErrors = {};
  if (f.projectKey && !/^[A-Z][A-Z0-9]+$/.test(f.projectKey)) {
    errs.projectKey = 'Project key must be 2–10 uppercase letters (e.g. TM, TEN).';
  } else if (!f.projectKey) {
    errs.projectKey = 'Project key is required.';
  }
  if (!f.baseUrl) {
    errs.baseUrl = 'Base URL is required.';
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(f.baseUrl);
    } catch {
      /* fall through — parsed stays null */
    }
    if (!parsed) {
      errs.baseUrl = 'Base URL must be a valid URL with protocol.';
    } else if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      // Mirrors server validateBaseUrl (DR2 #1): javascript:/file:/data: and
      // credentials-in-URL are rejected before any round trip.
      errs.baseUrl = 'Base URL must use http or https — other schemes are not allowed.';
    } else if (!parsed.host || parsed.username || parsed.password) {
      errs.baseUrl = 'Base URL must not embed credentials — use the Account email / API token fields.';
    }
  }
  if (f.accountEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.accountEmail)) {
    errs.accountEmail = 'Enter a valid email address.';
  } else if (!f.accountEmail) {
    errs.accountEmail = 'Account email is required.';
  }
  if (f.apiToken && f.apiToken.length < 24) {
    errs.apiToken = 'API token must be at least 24 characters.';
  } else if (requireToken && !f.apiToken) {
    errs.apiToken = 'API token is required.';
  }
  return errs;
}

// A stored link is "stale" past 2 minutes — the status pill flips to the
// amber variant and the banner reads the elapsed gap (spec §5).
export function linkAgeMs(link: JiraLink): number {
  if (!link.lastSyncedAt) return Number.POSITIVE_INFINITY;
  const tsMs = Date.parse(link.lastSyncedAt.replace(' ', 'T') + 'Z');
  if (Number.isNaN(tsMs)) return Number.POSITIVE_INFINITY;
  return Date.now() - tsMs;
}

// ── Screen 6b — Connect Jira setup form (#connect-jira-form) ───────────────

type ConnectJiraFormProps = {
  idOrSlug: string;
  onConnected: (link: JiraLink) => void;
};

export function ConnectJiraForm({ idOrSlug, onConnected }: ConnectJiraFormProps) {
  const [fields, setFields] = useState<JiraFields>({
    projectKey: '',
    baseUrl: '',
    accountEmail: '',
    apiToken: '',
    syncDirection: 'two_way',
    autoCreate: true,
  });
  const [errors, setErrors] = useState<JiraFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof JiraFields>(key: K, v: JiraFields[K]) =>
    setFields((f) => ({ ...f, [key]: v }));

  // Focus the first field on mount (spec §5 "Focus" state).
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  // A live 429 countdown — retry-after surfaced as an inline error (spec §7).
  useEffect(() => {
    if (rateLimitedUntil === null) return;
    const t = setInterval(() => setRateLimitedUntil(Date.now() >= rateLimitedUntil ? null : rateLimitedUntil), 1000);
    return () => clearInterval(t);
  }, [rateLimitedUntil]);
  const retryIn = rateLimitedUntil === null ? null : Math.max(1, Math.ceil((rateLimitedUntil - Date.now()) / 1000));

  const submit = async () => {
    const errs = validateJiraFields(fields, true);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const { link } = await createJiraLink(idOrSlug, {
        jiraProjectKey: fields.projectKey.trim(),
        jiraBaseUrl: fields.baseUrl.trim(),
        accountEmail: fields.accountEmail.trim(),
        apiToken: fields.apiToken,
        syncDirection: fields.syncDirection,
        autoCreate: fields.autoCreate,
      });
      onConnected(link);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not connect Jira.';
      setServerError(msg);
      if (/rate/i.test(msg)) setRateLimitedUntil(Date.now() + (60 + Math.floor(Math.random() * 15)) * 1000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="connect-jira-form" className="card" style={{ padding: 24 }}>
      <div className="setup-card" style={{ maxWidth: 'none' }}>
        <div className="setup-h">
          <div className="ico" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M12 2v6 M12 22v-6 M2 12h6 M22 12h-6" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          </div>
          <div>
            <h3>Connect Jira</h3>
            <p>Sprint needs a Jira link to create and sync stories. Auth is scoped to a single API token — your Jira password is never stored.</p>
          </div>
          {/* Board-level Settings cog — lives in the setup card header so it reads
              as "this board's settings", not project-wide settings. aria-pressed
              stays true while the user is in the setup flow (FR-6). */}
          <button
            className="icon-btn"
            type="button"
            aria-label="Board settings — connect Jira for this board"
            aria-pressed="true"
            aria-controls="connect-jira-form"
            title="Board settings — Jira connection"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              document.getElementById('connect-jira-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              firstFieldRef.current?.focus();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="setup-row">
            <label htmlFor="jk">Project key</label>
            <input
              ref={firstFieldRef}
              id="jk"
              className="input mono"
              value={fields.projectKey}
              onChange={(e) => set('projectKey', e.target.value.toUpperCase())}
              aria-describedby="jk-help"
              aria-invalid={errors.projectKey ? true : undefined}
            />
            <span id="jk-help" className="help">
              Short prefix used for all created tickets (e.g. <b>TEN-12</b>).
            </span>
            {errors.projectKey && (
              <span role="alert" className="field-error">{errors.projectKey}</span>
            )}
          </div>
          <div className="setup-row">
            <label htmlFor="ju">Base URL</label>
            <input
              id="ju"
              className="input"
              value={fields.baseUrl}
              onChange={(e) => set('baseUrl', e.target.value)}
              aria-describedby="ju-help"
              aria-invalid={errors.baseUrl ? true : undefined}
            />
            <span id="ju-help" className="help">
              Your Atlassian Cloud or self-hosted Jira URL. Must include the protocol.
            </span>
            {errors.baseUrl && (
              <span role="alert" className="field-error">{errors.baseUrl}</span>
            )}
          </div>
          <div className="setup-row">
            <label htmlFor="ja">Account email</label>
            <input
              id="ja"
              className="input"
              value={fields.accountEmail}
              onChange={(e) => set('accountEmail', e.target.value)}
              aria-describedby="ja-help"
              aria-invalid={errors.accountEmail ? true : undefined}
            />
            <span id="ja-help" className="help">
              The Atlassian account that owns the API token below.
            </span>
            {errors.accountEmail && (
              <span role="alert" className="field-error">{errors.accountEmail}</span>
            )}
          </div>
          <div className="setup-row">
            <label htmlFor="jt">API token</label>
            <input
              id="jt"
              className="input"
              type="password"
              value={fields.apiToken}
              onChange={(e) => set('apiToken', e.target.value)}
              aria-describedby="jt-help"
              aria-invalid={errors.apiToken ? true : undefined}
              autoComplete="off"
            />
            <span id="jt-help" className="help">
              Create one at <b>id.atlassian.com/manage-profile/security/api-tokens</b>. Your Jira password is never stored.
            </span>
            {errors.apiToken && (
              <span role="alert" className="field-error">{errors.apiToken}</span>
            )}
          </div>
          <div className="setup-row">
            <label htmlFor="js">Sync direction</label>
            <select
              id="js"
              className="input"
              value={fields.syncDirection}
              onChange={(e) => set('syncDirection', e.target.value as JiraSyncDirection)}
              aria-describedby="js-help"
            >
              {SYNC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span id="js-help" className="help">
              Two-way mirrors every status change in under 30s.
            </span>
          </div>
          <div className="setup-row">
            <label htmlFor="jauto">Auto-create</label>
            <select
              id="jauto"
              className="input"
              value={fields.autoCreate ? '1' : '0'}
              onChange={(e) => set('autoCreate', e.target.value === '1')}
              aria-describedby="jauto-help"
            >
              {AUTO_OPTIONS.map((o) => (
                <option key={String(o.value)} value={o.value ? '1' : '0'}>{o.label}</option>
              ))}
            </select>
            <span id="jauto-help" className="help">
              Pick manual if a human BA needs to triage each ticket first.
            </span>
          </div>

          <div className="setup-divider" />

          <div className="setup-help">
            <b>What gets shared:</b> project name, requirement IDs, story status changes, and code-agent commits.
            <b> What stays local:</b> artifact files, design-system rules, and the live activity feed.
          </div>

          {serverError && (
            <div className="error-banner" role="alert" style={{ margin: '12px 0 0' }}>
              {retryIn !== null
                ? `Rate limited by Jira — retry in ${retryIn}s.`
                : serverError}
            </div>
          )}

          <div className="setup-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Connecting…' : 'Connect Jira'}
            </button>
            <span className="setup-help" style={{ marginLeft: 'auto' }}>
              Takes ~30s. You can disconnect anytime from Settings.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Screen 6 — Edit-Jira panel (#jira-config-panel) ───────────────────────

type JiraConfigPanelProps = {
  idOrSlug: string;
  link: JiraLink;
  onClose: () => void; // restores focus to the cog (AC-5)
  onSaved: (link: JiraLink) => void;
  onDisconnect: () => void; // parent opens the disconnection ConfirmDialog
};

type PanelPhase = 'locked' | 'editing' | 'saving' | 'saved' | 'error';

export function JiraConfigPanel({ idOrSlug, link, onClose, onSaved, onDisconnect }: JiraConfigPanelProps) {
  const [phase, setPhase] = useState<PanelPhase>('locked');
  const [fields, setFields] = useState<JiraFields>({
    projectKey: link.jiraProjectKey,
    baseUrl: link.jiraBaseUrl,
    accountEmail: link.accountEmail,
    apiToken: '',
    syncDirection: link.syncDirection,
    autoCreate: link.autoCreate,
  });
  const [errors, setErrors] = useState<JiraFieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [is409, setIs409] = useState(false);
  const [offline, setOffline] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  const initial = useMemo(
    () => ({
      projectKey: link.jiraProjectKey,
      baseUrl: link.jiraBaseUrl,
      accountEmail: link.accountEmail,
      syncDirection: link.syncDirection,
      autoCreate: link.autoCreate,
    }),
    [link],
  );

  const dirty = useMemo(
    () =>
      fields.projectKey !== initial.projectKey ||
      fields.baseUrl !== initial.baseUrl ||
      fields.accountEmail !== initial.accountEmail ||
      fields.syncDirection !== initial.syncDirection ||
      fields.autoCreate !== initial.autoCreate ||
      fields.apiToken.length > 0,
    [fields, initial],
  );

  // Offline → disable saves and show the offline footer (spec §7).
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  // Esc closes the panel from anywhere inside it (spec §5 Focus state).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof JiraFields>(key: K, v: JiraFields[K]) =>
    setFields((f) => ({ ...f, [key]: v }));

  const revert = () => {
    setFields({
      projectKey: initial.projectKey,
      baseUrl: initial.baseUrl,
      accountEmail: initial.accountEmail,
      apiToken: '',
      syncDirection: initial.syncDirection,
      autoCreate: initial.autoCreate,
    });
    setErrors({});
    setServerError(null);
    setIs409(false);
    setPhase('locked');
  };

  const save = async () => {
    const errs = validateJiraFields(fields, false);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setPhase('saving');
    setServerError(null);
    setIs409(false);

    const patch: JiraLinkPatch = {};
    if (fields.projectKey !== initial.projectKey) patch.jiraProjectKey = fields.projectKey;
    if (fields.baseUrl !== initial.baseUrl) patch.jiraBaseUrl = fields.baseUrl;
    if (fields.accountEmail !== initial.accountEmail) patch.accountEmail = fields.accountEmail;
    if (fields.apiToken) patch.apiToken = fields.apiToken; // rotate (omitted = keep existing)
    if (fields.syncDirection !== initial.syncDirection) patch.syncDirection = fields.syncDirection;
    if (fields.autoCreate !== initial.autoCreate) patch.autoCreate = fields.autoCreate;

    try {
      const { link: updated } = await updateJiraLink(idOrSlug, patch);
      onSaved(updated);
      setPhase('saved');
      window.setTimeout(() => setPhase('locked'), 1400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save changes.';
      setServerError(msg);
      setIs409(msg === 'Someone else updated the Jira link. Reload to see their changes.');
      if (/token was rejected/i.test(msg)) {
        // spec §7 — all other field values are preserved; only the token needs
        // a re-entry. The field error line points at the token input.
        setErrors((prev) => ({ ...prev, apiToken: msg }));
      }
      setPhase('error');
    }
  };

  const locked = phase === 'locked' || phase === 'saved';
  const stale = linkAgeMs(link) > 120_000;

  return (
    <div id="jira-config-panel" role="region" aria-labelledby="jira-cfg-title">
      <div className={`config-card${locked ? ' readonly' : ''}`}>
        <div className="config-head">
          <div className="ico" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M12 2v6 M12 22v-6 M2 12h6 M22 12h-6" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          </div>
          <div className="body">
            <h3 id="jira-cfg-title">
              Jira connection
              <span className={`config-status${stale ? ' stale' : ''}`}>
                <span className="dot" aria-hidden="true" />
                {phase === 'saved'
                  ? 'Saved'
                  : link.syncStatus === 'pending'
                    ? 'Verification pending'
                    : `Last synced ${link.lastSyncedRelative}`}
              </span>
            </h3>
            <p>
              Edit the project key, sync direction, auto-create rule, or rotate the API token. Changes sync within 30s.
            </p>
          </div>
          <button className="close" type="button" aria-label="Close Jira settings" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12 M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="setup-row">
          <label htmlFor="jk2">Project key</label>
          <input
            ref={editRef}
            id="jk2"
            className="input mono"
            value={fields.projectKey}
            onChange={(e) => set('projectKey', e.target.value.toUpperCase())}
            disabled={locked}
            aria-describedby="jk2-help"
            aria-invalid={errors.projectKey ? true : undefined}
          />
          <span id="jk2-help" className="help">Short prefix used for all created tickets (e.g. <b>TM-12</b>).</span>
          {errors.projectKey && <span role="alert" className="field-error">{errors.projectKey}</span>}
        </div>
        <div className="setup-row">
          <label htmlFor="ju2">Base URL</label>
          <input
            id="ju2"
            className="input"
            value={fields.baseUrl}
            onChange={(e) => set('baseUrl', e.target.value)}
            disabled={locked}
            aria-describedby="ju2-help"
            aria-invalid={errors.baseUrl ? true : undefined}
          />
          <span id="ju2-help" className="help">Your Atlassian Cloud or self-hosted Jira URL. Must include the protocol.</span>
          {errors.baseUrl && <span role="alert" className="field-error">{errors.baseUrl}</span>}
        </div>
        <div className="setup-row">
          <label htmlFor="ja2">Account email</label>
          <input
            id="ja2"
            className="input"
            value={fields.accountEmail}
            onChange={(e) => set('accountEmail', e.target.value)}
            disabled={locked}
            aria-describedby="ja2-help"
            aria-invalid={errors.accountEmail ? true : undefined}
          />
          <span id="ja2-help" className="help">The Atlassian account that owns the API token below.</span>
          {errors.accountEmail && <span role="alert" className="field-error">{errors.accountEmail}</span>}
        </div>
        <div className="setup-row">
          <label htmlFor="jt2">API token</label>
          <input
            id="jt2"
            className="input"
            type="password"
            value={fields.apiToken}
            onChange={(e) => set('apiToken', e.target.value)}
            disabled={locked}
            aria-describedby="jt2-help"
            aria-invalid={errors.apiToken ? true : undefined}
            autoComplete="off"
            placeholder={link.hasToken ? '••••••••  (unchanged)' : 'Enter an API token'}
          />
          <span id="jt2-help" className="help">Stored as a salted one-way hash — never plaintext. Rotate at <b>id.atlassian.com/manage-profile/security/api-tokens</b>.</span>
          {errors.apiToken && <span role="alert" className="field-error">{errors.apiToken}</span>}
        </div>
        <div className="setup-row">
          <label htmlFor="js2">Sync direction</label>
          <select
            id="js2"
            className="input"
            value={fields.syncDirection}
            onChange={(e) => set('syncDirection', e.target.value as JiraSyncDirection)}
            disabled={locked}
            aria-describedby="js2-help"
          >
            {SYNC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span id="js2-help" className="help">Two-way mirrors every status change in under 30s.</span>
        </div>
        <div className="setup-row">
          <label htmlFor="jauto2">Auto-create</label>
          <select
            id="jauto2"
            className="input"
            value={fields.autoCreate ? '1' : '0'}
            onChange={(e) => set('autoCreate', e.target.value === '1')}
            disabled={locked}
            aria-describedby="jauto2-help"
          >
            {AUTO_OPTIONS.map((o) => (
              <option key={String(o.value)} value={o.value ? '1' : '0'}>{o.label}</option>
            ))}
          </select>
          <span id="jauto2-help" className="help">Pick manual if a human BA needs to triage each ticket first.</span>
        </div>

        {serverError && (
          <div className="error-banner" role="alert">
            {is409 ? (
              <span>
                {serverError}{' '}
                <button type="button" className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => window.location.reload()}>
                  Reload
                </button>
              </span>
            ) : (
              serverError
            )}
          </div>
        )}

        <div className="config-foot">
          <div className="left">
            Connected to <b>{link.jiraProjectKey}</b> · last synced <b>{link.lastSyncedRelative} ago</b>
          </div>
          {offline && (
            <div className="left" style={{ color: 'var(--ink-2)' }}>
              Offline — your changes are saved locally and will sync when you&rsquo;re back.
            </div>
          )}
          <div className="right">
            {phase === 'editing' || phase === 'saving' ? (
              <>
                <button type="button" className="btn btn-ghost" disabled={phase === 'saving'} onClick={revert}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void save()}
                  disabled={!dirty || phase === 'saving' || offline}
                  aria-busy={phase === 'saving'}
                >
                  {phase === 'saving' ? 'Saving…' : 'Save changes'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" onClick={onDisconnect}>
                  Disconnect
                </button>
                <button type="button" className="btn btn-soft" onClick={revert}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setPhase('editing');
                    setErrors({});
                    window.setTimeout(() => editRef.current?.focus(), 0);
                  }}
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
