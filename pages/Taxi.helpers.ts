export interface ChatMessage {
  question: string;
  analysis: string;
  chart?: { title: string; data: Array<{ name: string; value: number }> } | null;
  followUps?: string[];
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export const SESSIONS_KEY = 'taxi_sessions';
export const ACTIVE_SESSION_KEY = 'taxi_active_session';
export const LEGACY_HISTORY_KEY = 'taxi_chat_history';
export const MAX_MESSAGES_PER_SESSION = 50;
const TITLE_MAX = 40;

export function makeSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function titleFromQuestion(q: string): string {
  const trimmed = q.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'New chat';
  if (trimmed.length <= TITLE_MAX) return trimmed;
  return trimmed.slice(0, TITLE_MAX).trimEnd() + '…';
}

export function makeFreshSession(): Session {
  const now = Date.now();
  return { id: makeSessionId(), title: 'New chat', createdAt: now, updatedAt: now, messages: [] };
}

export function sortByRecent(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

function isValidSession(s: unknown): s is Session {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.createdAt === 'number' &&
    typeof o.updatedAt === 'number' &&
    Array.isArray(o.messages)
  );
}

export function loadSessions(): Session[] {
  try {
    const saved = localStorage.getItem(SESSIONS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed.filter(isValidSession);
    }
    const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
    if (legacy) {
      const msgs = JSON.parse(legacy) as ChatMessage[];
      if (Array.isArray(msgs) && msgs.length > 0) {
        const now = Date.now();
        const trimmed = msgs.slice(-MAX_MESSAGES_PER_SESSION);
        const session: Session = {
          id: makeSessionId(),
          title: titleFromQuestion(trimmed[0]?.question || 'Past chat'),
          createdAt: now,
          updatedAt: now,
          messages: trimmed,
        };
        localStorage.removeItem(LEGACY_HISTORY_KEY);
        return [session];
      }
    }
  } catch { /* ignore */ }
  return [];
}

export function appendMessage(
  sessions: Session[],
  activeId: string,
  msg: ChatMessage
): Session[] {
  return sessions.map(s => {
    if (s.id !== activeId) return s;
    const isFirst = s.messages.length === 0;
    const next = [...s.messages, msg].slice(-MAX_MESSAGES_PER_SESSION);
    return {
      ...s,
      messages: next,
      updatedAt: Date.now(),
      title: isFirst ? titleFromQuestion(msg.question) : s.title,
    };
  });
}

export function pickInitialActiveId(sessions: Session[], stored: string | null): string {
  if (stored && sessions.some(s => s.id === stored)) return stored;
  if (sessions.length === 0) return '';
  return sortByRecent(sessions)[0].id;
}
