import { useEffect, useState, useRef } from 'react';
import { linksApi, type LinkItem, type LinkCategory } from '@pulse/api-client';
import Spinner from '../components/Spinner';

const CATEGORIES: { value: LinkCategory; label: string; icon: string }[] = [
  { value: 'food',      label: 'Food',      icon: '🍽️' },
  { value: 'drinks',    label: 'Drinks',    icon: '🍹' },
  { value: 'nutrition', label: 'Nutrition', icon: '📊' },
  { value: 'exercise',  label: 'Exercise',  icon: '💪' },
  { value: 'other',     label: 'Other',     icon: '🔖' },
];

function categoryIcon(category: LinkCategory | undefined): string {
  return CATEGORIES.find((c) => c.value === category)?.icon ?? '🔖';
}

function FaviconImg({ src, title }: { src: string | null; title: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className="w-8 h-8 rounded-md bg-dram-border flex items-center justify-center flex-shrink-0 text-sm text-gray-500">
        🔗
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={title}
      onError={() => setErrored(true)}
      className="w-8 h-8 rounded-md object-contain bg-dram-border flex-shrink-0"
    />
  );
}

export default function Links() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [newCategory, setNewCategory] = useState<LinkCategory>('other');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<LinkCategory | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<LinkItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFavicon, setEditFavicon] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editCategory, setEditCategory] = useState<LinkCategory>('other');

  useEffect(() => {
    linksApi.getAll().then(setLinks).finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (!url) return;
    setAdding(true);
    try {
      const link = await linksApi.add(url, newCategory);
      setLinks((prev) => [link, ...prev]);
      setInput('');
      inputRef.current?.focus();
    } catch (err: any) {
      alert(err?.message || 'Failed to add link.');
    } finally {
      setAdding(false);
    }
  }

  function openEdit(link: LinkItem) {
    setEditTarget(link);
    setEditTitle(link.title);
    setEditFavicon(link.favicon_url ?? '');
    setEditUrl(link.url);
    setEditCategory(link.category ?? 'other');
  }

  async function commitEdit() {
    if (!editTarget) return;
    const title = editTitle.trim();
    if (!title) return;
    const favicon_url = editFavicon.trim() || null;
    const url = editUrl.trim() || editTarget.url;
    const category = editCategory;
    setEditTarget(null);
    await linksApi.update(editTarget.id, { title, favicon_url, url, category }).catch(() => {});
    setLinks((prev) =>
      prev.map((l) => l.id === editTarget.id ? { ...l, title, favicon_url, url, category } : l)
    );
  }

  async function handleDelete(id: number) {
    await linksApi.delete(id).catch(() => {});
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  const sorted = [...links].sort((a, b) => a.title.localeCompare(b.title));
  const visible = filter === 'all' ? sorted : sorted.filter((l) => (l.category ?? 'other') === filter);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
        <div className="px-6 pt-5 pb-4 border-b border-dram-border flex-shrink-0">
          <h1 className="text-xl font-semibold text-slate-200 mb-3">Links</h1>
          <form onSubmit={handleAdd} className="flex gap-2 mb-3">
            <input
              ref={inputRef}
              type="url"
              placeholder="https://…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as LinkCategory)}
              className="bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={adding || !input.trim()}
              className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition disabled:opacity-40 flex-shrink-0"
            >
              {adding ? 'Adding…' : '+ Add'}
            </button>
          </form>

          {/* Filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setFilter('all')}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm border transition ${filter === 'all' ? 'border-dram-accent text-dram-accent bg-dram-accent/10' : 'border-dram-border text-dram-muted hover:border-slate-500 hover:text-slate-200'}`}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setFilter(c.value)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm border transition ${filter === c.value ? 'border-dram-accent text-dram-accent bg-dram-accent/10' : 'border-dram-border text-dram-muted hover:border-slate-500 hover:text-slate-200'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center mt-16"><Spinner size={10} /></div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center mt-20 text-gray-600">
              <span className="text-5xl mb-3">🔗</span>
              <p className="text-lg">{filter === 'all' ? 'No links yet.' : `No ${CATEGORIES.find((c) => c.value === filter)?.label} links yet.`}</p>
              {filter === 'all' && <p className="text-sm mt-1">Paste a URL above to save a site.</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-w-2xl">
              {visible.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 bg-dram-card border border-dram-border rounded-xl px-4 py-3 group hover:border-dram-accent/40 transition"
                >
                  <FaviconImg src={link.favicon_url} title={link.title} />

                  <div className="flex-1 min-w-0">
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      <p className="text-base font-medium text-white truncate hover:text-dram-accent transition">{link.title}</p>
                    </a>
                    <p className="text-sm text-gray-500 truncate mt-0.5">{link.url}</p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(link); }}
                      className="text-gray-500 hover:text-dram-accent transition text-sm px-1.5 py-0.5 rounded"
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(link.id); }}
                      className="text-gray-500 hover:text-red-400 transition text-lg px-1 leading-none"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>

                  <span className="text-lg flex-shrink-0" title={(link.category ?? 'other')}>{categoryIcon(link.category)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditTarget(null)}>
          <div className="bg-dram-card border border-dram-border rounded-xl p-5 w-full max-w-sm mx-4 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-white">Edit Link</h2>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-400">Name</label>
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditTarget(null); }}
                className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-400">URL</label>
              <input
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://…"
                className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-400">Image URL</label>
              <div className="flex gap-2 items-center">
                <input
                  value={editFavicon}
                  onChange={(e) => setEditFavicon(e.target.value)}
                  placeholder="https://…"
                  className="flex-1 bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
                />
                {editFavicon && (
                  <img
                    src={editFavicon}
                    alt=""
                    className="w-8 h-8 rounded-md object-contain bg-dram-border flex-shrink-0"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-400">Category</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as LinkCategory)}
                className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">
                Cancel
              </button>
              <button onClick={commitEdit} className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
