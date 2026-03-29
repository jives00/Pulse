import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getHistory, updateLogEntry, deleteLogEntry, type HistoryEntry } from '../api/client';
import type { RecipeDetail as RecipeDetailType } from '../../../../packages/api-client/src/index';
import RecipeDetail from '../components/RecipeDetail';
import RecipeForm from '../components/RecipeForm';
import Spinner from '../components/Spinner';

type PanelState =
  | { mode: 'none' }
  | { mode: 'detail'; recipeId: number }
  | { mode: 'edit'; recipe: RecipeDetailType };

function toLocalDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function groupByDate(entries: HistoryEntry[]): { label: string; entries: HistoryEntry[] }[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fmtKey = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const todayKey = fmtKey(today);
  const yesterdayKey = fmtKey(yesterday);

  const groups: Map<string, HistoryEntry[]> = new Map();
  for (const entry of entries) {
    const d = new Date(entry.made_at);
    const key = fmtKey(d);
    const label = key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : key;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

export default function History() {
  const token = useAuthStore((s) => s.token)!;
  const logout = useAuthStore((s) => s.logout);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<PanelState>({ mode: 'none' });

  // Edit modal state
  const [editTarget, setEditTarget] = useState<HistoryEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getHistory(token).then(setEntries).finally(() => setLoading(false));
  }, [token]);

  function openEdit(e: React.MouseEvent, entry: HistoryEntry) {
    e.stopPropagation();
    setEditTarget(entry);
    setEditDate(toLocalDate(entry.made_at));
    setEditTime(toLocalTime(entry.made_at));
  }

  async function commitEdit() {
    if (!editTarget || !editDate || !editTime) return;
    setSaving(true);
    try {
      const iso = new Date(`${editDate}T${editTime}`).toISOString();
      await updateLogEntry(token, editTarget.recipe_id, editTarget.log_id, iso);
      setEntries((prev) =>
        prev
          .map((e) => e.log_id === editTarget.log_id ? { ...e, made_at: iso } : e)
          .sort((a, b) => new Date(b.made_at).getTime() - new Date(a.made_at).getTime())
      );
      setEditTarget(null);
    } catch {
      // keep modal open on error
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, entry: HistoryEntry) {
    e.stopPropagation();
    await deleteLogEntry(token, entry.recipe_id, entry.log_id).catch(() => {});
    setEntries((prev) => prev.filter((x) => x.log_id !== entry.log_id));
    // Close panel if it was showing this recipe and no other entries remain for it
    if (panel.mode === 'detail' && panel.recipeId === entry.recipe_id) {
      const remaining = entries.filter((x) => x.log_id !== entry.log_id && x.recipe_id === entry.recipe_id);
      if (remaining.length === 0) setPanel({ mode: 'none' });
    }
  }

  const panelOpen = panel.mode !== 'none';
  const groups = groupByDate(entries);

  return (
    <div className="flex h-screen bg-dram-bg text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-44 flex-shrink-0 border-r border-dram-border flex flex-col p-4">
        <div className="mb-8">
          <Link to="/"><img src="/logo.png" alt="dram" className="w-24 mx-auto" /></Link>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          <Link to="/" className="px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-dram-card text-sm">
            Library
          </Link>
          <Link to="/history" className="px-3 py-2 rounded-lg bg-dram-card text-white text-sm">
            History
          </Link>
          <Link to="/links" className="px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-dram-card text-sm">
            Links
          </Link>
          <Link to="/settings" className="px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-dram-card text-sm">
            Settings
          </Link>
        </nav>
        <button onClick={logout} className="text-xs text-gray-600 hover:text-gray-400 text-left">
          Sign out
        </button>
      </aside>

      {/* Main */}
      <div className={`flex-1 flex flex-col overflow-hidden ${panelOpen ? 'mr-[420px]' : ''}`}>
        <div className="px-6 pt-5 pb-4 border-b border-dram-border flex-shrink-0">
          <h1 className="text-lg font-semibold">History</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center mt-16"><Spinner size={10} /></div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center mt-20 text-gray-600">
              <span className="text-5xl mb-3">📋</span>
              <p className="text-lg">No history yet.</p>
              <p className="text-sm mt-1">Log a recipe as made to see it here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 max-w-2xl">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{group.label}</p>
                  <div className="flex flex-col gap-2">
                    {group.entries.map((entry) => (
                      <div
                        key={entry.log_id}
                        className={`flex items-center gap-3 bg-dram-card border rounded-xl px-4 py-3 group transition ${
                          panel.mode === 'detail' && panel.recipeId === entry.recipe_id
                            ? 'border-dram-accent/60'
                            : 'border-dram-border hover:border-dram-accent/40'
                        }`}
                      >
                        {/* Thumbnail — click to open detail */}
                        <button
                          onClick={() => setPanel({ mode: 'detail', recipeId: entry.recipe_id })}
                          className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-dram-border flex items-center justify-center"
                        >
                          {entry.photo_url ? (
                            <img src={entry.photo_url} alt={entry.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-lg opacity-40">{entry.type === 'cocktail' ? '🍸' : '🍴'}</span>
                          )}
                        </button>

                        {/* Info — click to open detail */}
                        <button
                          onClick={() => setPanel({ mode: 'detail', recipeId: entry.recipe_id })}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="text-sm font-medium text-white truncate">{entry.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(entry.made_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </button>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                          <button
                            onClick={(e) => openEdit(e, entry)}
                            className="text-gray-500 hover:text-dram-accent transition text-sm px-1.5 py-0.5 rounded"
                            title="Edit date"
                          >
                            ✎
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, entry)}
                            className="text-gray-500 hover:text-red-400 transition text-lg px-1 leading-none"
                            title="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      {panelOpen && (
        <div data-panel className="fixed right-0 top-0 h-full w-[420px] z-10 shadow-2xl">
          {panel.mode === 'detail' && (
            <RecipeDetail
              recipeId={panel.recipeId}
              onClose={() => setPanel({ mode: 'none' })}
              onEdit={(recipe) => setPanel({ mode: 'edit', recipe })}
              onDeleted={() => setPanel({ mode: 'none' })}
              onUpdated={() => {}}
            />
          )}
          {panel.mode === 'edit' && (
            <RecipeForm
              initialData={panel.recipe}
              onSaved={(id) => setPanel({ mode: 'detail', recipeId: id })}
              onCancel={() => setPanel({ mode: 'none' })}
            />
          )}
        </div>
      )}

      {/* Edit date modal */}
      {editTarget && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setEditTarget(null)}
        >
          <div
            className="bg-dram-card border border-dram-border rounded-xl p-5 w-full max-w-sm mx-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-white">Edit Entry</h2>
            <p className="text-sm text-gray-400 -mt-2 truncate">{editTarget.name}</p>

            <div className="flex gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-gray-400">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditTarget(null); }}
                  className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent [color-scheme:dark]"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-gray-400">Time</label>
                <div className="flex gap-1 items-center">
                  {(() => {
                    const h24 = parseInt(editTime.split(':')[0] ?? '0', 10);
                    const min = editTime.split(':')[1] ?? '00';
                    const period = h24 < 12 ? 'AM' : 'PM';
                    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                    function setHour(newH12: number, p: string) {
                      let h = newH12 % 12;
                      if (p === 'PM') h += 12;
                      setEditTime(`${String(h).padStart(2, '0')}:${min}`);
                    }
                    function setMinute(newMin: string) {
                      setEditTime(`${String(h24).padStart(2, '0')}:${newMin}`);
                    }
                    function setPeriod(p: string) {
                      setHour(h12, p);
                    }
                    return (
                      <>
                        <select
                          value={h12}
                          onChange={(e) => setHour(parseInt(e.target.value, 10), period)}
                          className="w-14 bg-dram-bg border border-dram-border rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="text-gray-400">:</span>
                        <select
                          value={min}
                          onChange={(e) => setMinute(e.target.value)}
                          className="w-14 bg-dram-bg border border-dram-border rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
                        >
                          {Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0')).map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={period}
                          onChange={(e) => setPeriod(e.target.value)}
                          className="w-16 bg-dram-bg border border-dram-border rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={commitEdit}
                disabled={saving || !editDate || !editTime}
                className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
