import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '../store/settings';
import { recipesApi, tagsApi, type Recipe, type RecipeDetail as RecipeDetailType } from '@pulse/api-client';
import RecipeCard from '../components/RecipeCard';
import RecipeDetail from '../components/RecipeDetail';
import RecipeForm from '../components/RecipeForm';
import Spinner from '../components/Spinner';

type CategoryFilter = '' | 'cocktail' | 'food' | 'main' | 'side' | 'breakfast' | 'dessert';
import type { SortOption } from '../store/settings';

const FOOD_SUBCATEGORIES: [Exclude<CategoryFilter, '' | 'cocktail' | 'food'>, string][] = [
  ['main', 'Main Dishes'],
  ['side', 'Side Dishes'],
  ['breakfast', 'Breakfast'],
  ['dessert', 'Desserts'],
];

const PAGE_SIZE = 50;

type PanelState =
  | { mode: 'none' }
  | { mode: 'detail'; recipeId: number }
  | { mode: 'add' }
  | { mode: 'edit'; recipe: RecipeDetailType };

export default function Library() {
  const defaultSort = useSettingsStore((s) => s.defaultSort);
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isFood   = location.pathname.startsWith('/food');
  const isDrinks = location.pathname.startsWith('/drinks');
  const sub = (searchParams.get('sub') ?? '') as Exclude<CategoryFilter, '' | 'cocktail' | 'food'> | '';

  // Derived from URL — not internal state
  const categoryFilter: CategoryFilter =
    isDrinks ? 'cocktail' :
    (isFood && sub) ? sub :
    isFood ? 'food' : '';

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState('');
  const [showFavorites, setShowFavorites] = useState(false);
  const [madeFilter, setMadeFilter] = useState<'all' | 'made' | 'not_made'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>(defaultSort);
  const [allTags, setAllTags] = useState<string[]>([]);

  const [panel, setPanel] = useState<PanelState>({ mode: 'none' });

  const fetchRecipes = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else { setLoading(true); setFetchError(false); }
    try {
      const data = await recipesApi.getAll({
        type: categoryFilter === 'cocktail' ? 'cocktail' : categoryFilter ? 'food' : 'all',
        subcategory: (categoryFilter && categoryFilter !== 'cocktail' && categoryFilter !== 'food') ? categoryFilter : undefined,
        search: search || undefined,
        favorite: showFavorites || undefined,
        made: madeFilter === 'made' ? true : madeFilter === 'not_made' ? false : undefined,
        tags: selectedTags.length ? selectedTags : undefined,
        sort,
        limit: PAGE_SIZE,
        offset,
      });
      if (append) setRecipes((prev) => [...prev, ...data]);
      else setRecipes(data);
      // Random sort can't paginate consistently (no stable seed), so cap at first page
      setHasMore(data.length === PAGE_SIZE && sort !== 'random');
    } catch {
      if (!append) setFetchError(true);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [location.pathname, sub, search, showFavorites, madeFilter, selectedTags, sort]);

  // N8: fetch recipes and tags in parallel on every filter change
  useEffect(() => {
    setHasMore(true);
    Promise.all([
      fetchRecipes(0, false),
      tagsApi.getAll(isFood ? 'food' : 'cocktail').then(setAllTags).catch(() => {}),
    ]);
  }, [fetchRecipes, refreshKey]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});
  loadMoreRef.current = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchRecipes(recipes.length, true);
  }, [hasMore, loadingMore, loading, recipes.length, fetchRecipes]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreRef.current(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []); // observer created once; loadMoreRef always points to latest callback

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const clearTags = useCallback(() => setSelectedTags([]), []);

  const panelOpen = panel.mode !== 'none';

  useEffect(() => {
    if (panel.mode !== 'detail') return;
    const handler = (e: MouseEvent) => {
      const panelEl = document.querySelector('[data-panel]');
      if (panelEl && !panelEl.contains(e.target as Node)) {
        setPanel({ mode: 'none' });
      }
    };
    const id = setTimeout(() => {
      document.addEventListener('click', handler);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handler);
    };
  }, [panel.mode]);

  return (
    <div className={`flex flex-col h-full overflow-hidden bg-dram-bg text-white ${panelOpen ? 'mr-[420px]' : ''}`}>
        {/* Toolbar */}
        <div className="px-6 pt-5 pb-4 border-b border-dram-border flex-shrink-0">
          {/* Row 1: Search + Add */}
          <div className="flex items-center gap-3 mb-3">
            <input
              type="text"
              placeholder="🔍 Search recipes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
            />
            <button
              onClick={() => setPanel({ mode: 'add' })}
              className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition flex-shrink-0"
            >
              + Add Recipe
            </button>
          </div>

          {/* Row 2: Filters + Sort — isolated in FilterBar so picker state doesn't re-render the grid */}
          <FilterBar
            showFavorites={showFavorites}
            setShowFavorites={setShowFavorites}
            madeFilter={madeFilter}
            setMadeFilter={setMadeFilter}
            selectedTags={selectedTags}
            toggleTag={toggleTag}
            clearTags={clearTags}
            sort={sort}
            setSort={setSort}
            allTags={allTags}
          />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {fetchError ? (
            <div className="bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
              Failed to load recipes. Check your connection and try again.
            </div>
          ) : loading ? (
            <div className="flex justify-center mt-16">
              <Spinner size={10} />
            </div>
          ) : recipes.length === 0 ? (
            <div className="flex flex-col items-center mt-20 text-gray-600">
              <span className="text-5xl mb-3">🍸</span>
              <p className="text-lg">No recipes yet.</p>
              <p className="text-sm mt-1">
                <button onClick={() => setPanel({ mode: 'add' })} className="text-dram-accent hover:underline">
                  Add your first recipe
                </button>
              </p>
            </div>
          ) : (
            <>
              <div
                className={`grid gap-4 ${
                  panelOpen
                    ? 'grid-cols-2 lg:grid-cols-3'
                    : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
                }`}
              >
                {recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    onClick={() => setPanel({ mode: 'detail', recipeId: recipe.id })}
                  />
                ))}
              </div>
              {/* Infinite scroll sentinel */}
              {hasMore && <div ref={sentinelRef} className="h-1" />}
              {loadingMore && (
                <div className="flex justify-center py-6">
                  <Spinner size={6} />
                </div>
              )}
            </>
          )}
        </div>

      {/* Side panel */}
      {panelOpen && (
        <div data-panel className="fixed right-0 top-0 h-full w-[420px] z-10 shadow-2xl">
          {panel.mode === 'detail' && (
            <RecipeDetail
              recipeId={panel.recipeId}
              onClose={() => setPanel({ mode: 'none' })}
              onEdit={(recipe) => setPanel({ mode: 'edit', recipe })}
              onDeleted={() => { setPanel({ mode: 'none' }); refresh(); }}
              onUpdated={refresh}
            />
          )}
          {(panel.mode === 'add' || panel.mode === 'edit') && (
            <RecipeForm
              initialData={panel.mode === 'edit' ? panel.recipe : undefined}
              onSaved={(id) => { setPanel({ mode: 'detail', recipeId: id }); refresh(); }}
              onCancel={() => setPanel({ mode: 'none' })}
            />
          )}
        </div>
      )}
    </div>
  );
}

// FilterBar owns all picker open/close state so toggling dropdowns
// doesn't re-render the recipe grid in the parent.
const FilterBar = memo(function FilterBar({
  showFavorites, setShowFavorites,
  madeFilter, setMadeFilter,
  selectedTags, toggleTag, clearTags,
  sort, setSort,
  allTags,
}: {
  showFavorites: boolean;
  setShowFavorites: (v: (prev: boolean) => boolean) => void;
  madeFilter: 'all' | 'made' | 'not_made';
  setMadeFilter: (v: 'all' | 'made' | 'not_made') => void;
  selectedTags: string[];
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  sort: SortOption;
  setSort: (v: SortOption) => void;
  allTags: string[];
}) {
  const [showMadePicker, setShowMadePicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);

  const anyPickerOpen = showMadePicker || showTagPicker;

  function closeAllPickers() {
    setShowMadePicker(false);
    setShowTagPicker(false);
  }

  useEffect(() => {
    if (!anyPickerOpen) return;
    const id = setTimeout(() => {
      document.addEventListener('click', closeAllPickers, { once: true });
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', closeAllPickers);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPickerOpen]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FilterChip active={showFavorites} onClick={() => { setShowFavorites((v) => !v); closeAllPickers(); }}>
        Favourites
      </FilterChip>
      <div className="relative">
        <FilterChip
          active={madeFilter !== 'all'}
          onClick={() => { setShowMadePicker((v) => !v); setShowTagPicker(false); }}
        >
          {madeFilter === 'made' ? 'Made' : madeFilter === 'not_made' ? 'Not Made' : 'Made'} ▾
        </FilterChip>
        {showMadePicker && (
          <div className="absolute top-9 left-0 z-20 bg-dram-card border border-dram-border rounded-xl p-2 w-32 shadow-xl">
            {[['all', 'All'], ['made', 'Made'], ['not_made', 'Not Made']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setMadeFilter(val as 'all' | 'made' | 'not_made'); setShowMadePicker(false); }}
                className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition ${madeFilter === val ? 'text-dram-accent bg-dram-accent/10' : 'text-gray-400 hover:text-white hover:bg-dram-border'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tag picker */}
      <div className="relative">
        <FilterChip
          active={selectedTags.length > 0}
          onClick={() => { setShowTagPicker((v) => !v); setShowMadePicker(false); }}
        >
          Tags {selectedTags.length > 0 ? `(${selectedTags.length})` : '▾'}
        </FilterChip>
        {showTagPicker && allTags.length > 0 && (
          <div className="absolute top-9 left-0 z-20 bg-dram-card border border-dram-border rounded-xl p-3 w-56 shadow-xl">
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition capitalize ${
                    selectedTags.includes(tag)
                      ? 'border-dram-accent text-dram-accent bg-dram-accent/10'
                      : 'border-dram-border text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            {selectedTags.length > 0 && (
              <button
                onClick={clearTags}
                className="text-xs text-gray-500 hover:text-gray-300 mt-2"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="bg-dram-card border border-dram-border rounded-lg px-3 py-1.5 text-sm text-gray-400 focus:outline-none focus:border-dram-accent"
        >
          <option value="random">Random</option>
          <option value="created_at">Date Added</option>
          <option value="name">A–Z</option>
          <option value="recently_made">Recently Made</option>
          <option value="prep_time">Prep Time</option>
        </select>
      </div>
    </div>
  );
});

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm border transition ${
        active
          ? 'border-dram-accent text-dram-accent bg-dram-accent/10'
          : 'border-dram-border text-gray-400 hover:border-gray-600 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}
