'use client';

import { Monitor, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useI18n } from '@/contexts/I18nContext';
import { apiRequest, ApiClientError, type UserSessionInfo } from '@/lib/api';

export default function SessionsPage() {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<UserSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<UserSessionInfo[]>('/auth/sessions');
      setSessions(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleRevoke = async (sessionId: string) => {
    setFeedback(null);
    setError(null);
    try {
      await apiRequest(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
      setFeedback(t.sessions.revoked);
      await loadSessions();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to revoke session');
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.sessions.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.sessions.subtitle}</p>
        </div>

        {feedback && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {feedback}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              {t.common.loading}
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              {t.common.noData}
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {session.ipAddress || 'Unknown IP'}
                      </p>
                      {session.isCurrent && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          {t.sessions.currentSession}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 max-w-xl truncate text-xs text-slate-500">
                      {session.userAgent || 'Browser / API Client'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {new Date(session.createdAt).toLocaleString()} →{' '}
                      {new Date(session.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {!session.isCurrent && (
                  <button
                    type="button"
                    onClick={() => void handleRevoke(session.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.sessions.revoke}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

