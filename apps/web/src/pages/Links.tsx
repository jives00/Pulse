import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getLinks, addLink, updateLink, deleteLink, type LinkItem } from '../api/client';
import Spinner from '../components/Spinner';

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
  const token = useAuthStore((s) => s.token)!;
  const logout = useAuthStore((s) => s.logout);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<LinkItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFavicon, setEditFavicon] = useState('');
  const [editUrl, setEditUrl] = useState('');

  useEffect(() => {
    getLinks(token).then(setLinks).finally(() => setLoading(false));
  }, [token]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (!url) return;
    setAdding(true);
    try {
      const link = await addLink(token, url);
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
  }

  async function commitEdit() {
    if (!editTarget) return;
    const title = editTitle.trim();
    if (!title) return;
    const favicon_url = editFavicon.trim() || null;
    const url = editUrl.trim() || editTarget.url;
    setEditTarget(null);
    await updateLink(token, editTarget.id, title, favicon_url, url).catch(() => {});
    setLinks((prev) =>
      prev.map((l) => l.id === editTarget.id ? { ...l, title, favicon_url, url } : l)
    );
  }

  async function handleDelete(id: number) {
    await deleteLink(token, id).catch(() => {});
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

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
          <Link to="/history" className="px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-dram-card text-sm">
            History
          </Link>
          <Link to="/links" className="px-3 py-2 rounded-lg bg-dram-card text-white text-sm">
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
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-dram-border flex-shrink-0">
          <h1 className="text-lg font-semibold mb-3">Links</h1>
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              ref={inputRef}
              type="url"
              placeholder="https://…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
            />
            <button
              type="submit"
              disabled={adding || !input.trim()}
              className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition disabled:opacity-40 flex-shrink-0"
            >
              {adding ? 'Adding…' : '+ Add'}
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center mt-16"><Spinner size={10} /></div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center mt-20 text-gray-600">
              <span className="text-5xl mb-3">🔗</span>
              <p className="text-lg">No links yet.</p>
              <p className="text-sm mt-1">Paste a URL above to save a site.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-w-2xl">
              {[...links].sort((a, b) => a.title.localeCompare(b.title)).map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 bg-dram-card border border-dram-border rounded-xl px-4 py-3 group hover:border-dram-accent/40 transition"
                >
                  <FaviconImg src={link.favicon_url} title={link.title} />

                  <div className="flex-1 min-w-0">
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      <p className="text-sm font-medium text-white truncate hover:text-dram-accent transition">{link.title}</p>
                    </a>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{link.url}</p>
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditTarget(null)}>
          <div className="bg-dram-card border border-dram-border rounded-xl p-5 w-full max-w-sm mx-4 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-white">Edit Link</h2>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Name</label>
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditTarget(null); }}
                className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">URL</label>
              <input
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://…"
                className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Image URL</label>
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
