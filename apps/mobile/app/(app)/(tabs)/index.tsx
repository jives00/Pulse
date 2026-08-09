import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';
import { getRecipes, getTags, type Recipe } from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { useSettingsStore } from '../../../src/store/settings';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import FilterChip from '../../../src/components/FilterChip';
import RecipeCard from '../../../src/components/RecipeCard';
import Spinner from '../../../src/components/Spinner';

type CategoryFilter = '' | 'cocktail' | 'prepackaged' | 'main' | 'side' | 'breakfast' | 'dessert';

const CATEGORY_LABELS: Record<string, string> = {
  '': 'Category', cocktail: 'Cocktail', prepackaged: 'Prepackaged',
  main: 'Main Dish', side: 'Side Dish', breakfast: 'Breakfast', dessert: 'Dessert',
};

// Approximate card height for getItemLayout (photo 120 + info ~86 + margins 8)
const CARD_HEIGHT = 220;
const PAGE_SIZE = 50;

type DropdownConfig = {
  key: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
  current: string;
};

export default function LibraryScreen() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const { defaultSort } = useSettingsStore();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('');
  const [showFaves, setShowFaves] = useState(false);
  const [madeFilter, setMadeFilter] = useState<'all' | 'made' | 'not_made'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState(defaultSort);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [dropdown, setDropdown] = useState<DropdownConfig | null>(null);
  const swipe = useSwipeNav('recipes');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecipes = useCallback(async (searchVal: string, offset = 0, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const data = await getRecipes(token, {
        type: categoryFilter === 'cocktail' ? 'cocktail' : categoryFilter === 'prepackaged' ? 'prepackaged' : categoryFilter ? 'food' : 'all',
        subcategory: (categoryFilter && categoryFilter !== 'cocktail' && categoryFilter !== 'prepackaged') ? categoryFilter : undefined,
        search: searchVal,
        favorite: showFaves,
        made: madeFilter === 'made' ? true : madeFilter === 'not_made' ? false : undefined,
        tags: selectedTags,
        sort,
        limit: PAGE_SIZE,
        offset,
      });
      if (append) setRecipes((prev) => [...prev, ...data]);
      else setRecipes(data);
      // Random sort can't paginate consistently (no stable seed), so cap at first page
      setHasMore(data.length === PAGE_SIZE && sort !== 'random');
    } catch { } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, categoryFilter, showFaves, madeFilter, selectedTags, sort]);

  useEffect(() => { getTags(token).then(setAllTags).catch(() => {}); }, [token]);

  useEffect(() => {
    setHasMore(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchRecipes(search, 0, false), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [fetchRecipes, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRecipes(search, 0, false).catch(() => {});
    setRefreshing(false);
  }, [fetchRecipes, search]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchRecipes(search, recipes.length, true);
  }, [hasMore, loadingMore, loading, fetchRecipes, search, recipes.length]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  function openDropdown(config: DropdownConfig) {
    setShowTagPicker(false);
    setDropdown(config);
  }

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.container} {...swipe.panHandlers}>
      <View style={styles.header}>
        <Text style={styles.title}>My Recipes</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/recipe/edit')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchInputWrap}>
          <TextInput style={styles.search} placeholder="Search recipes…" placeholderTextColor={c.muted} value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClear}>
              <Text style={styles.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => openDropdown({
            key: 'sort',
            current: sort,
            options: [
              { label: 'Random', value: 'random' },
              { label: 'Date Added', value: 'created_at' },
              { label: 'A–Z', value: 'name' },
              { label: 'Recently Made', value: 'recently_made' },
              { label: 'Prep Time', value: 'prep_time' },
            ],
            onSelect: (v) => setSort(v as typeof sort),
          })}
        >
          <Text style={styles.sortBtnText}>
            {sort === 'name' ? 'A–Z' : sort === 'recently_made' ? 'Recent' : sort === 'prep_time' ? 'Prep' : sort === 'created_at' ? 'Date' : '⇅'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label={`${CATEGORY_LABELS[categoryFilter]} ▾`}
          active={categoryFilter !== ''}
          onPress={() => openDropdown({
            key: 'category',
            current: categoryFilter,
            options: [
              { label: 'All', value: '' },
              { label: 'Cocktail', value: 'cocktail' },
              { label: 'Prepackaged', value: 'prepackaged' },
              { label: 'Main Dish', value: 'main' },
              { label: 'Side Dish', value: 'side' },
              { label: 'Breakfast', value: 'breakfast' },
              { label: 'Dessert', value: 'dessert' },
            ],
            onSelect: (v) => setCategoryFilter(v as CategoryFilter),
          })}
        />
        <FilterChip label="Favs" active={showFaves} onPress={() => setShowFaves((v) => !v)} />
        <FilterChip
          label={madeFilter === 'made' ? 'Made ▾' : madeFilter === 'not_made' ? 'Not Made ▾' : 'Made ▾'}
          active={madeFilter !== 'all'}
          onPress={() => openDropdown({
            key: 'made',
            current: madeFilter,
            options: [{ label: 'All', value: 'all' }, { label: 'Made', value: 'made' }, { label: 'Not Made', value: 'not_made' }],
            onSelect: (v) => setMadeFilter(v as 'all' | 'made' | 'not_made'),
          })}
        />
        <FilterChip
          label={`Tags${selectedTags.length ? ` (${selectedTags.length})` : ' ▾'}`}
          active={selectedTags.length > 0}
          onPress={() => { setDropdown(null); setShowTagPicker((v) => !v); }}
        />
        {selectedTags.map((tag) => <FilterChip key={tag} label={`${tag} ✕`} active onPress={() => toggleTag(tag)} />)}
      </View>

      {showTagPicker && (
        <View style={styles.tagPicker}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRowContent}>
            {allTags.map((tag) => <FilterChip key={tag} label={tag} active={selectedTags.includes(tag)} onPress={() => toggleTag(tag)} />)}
          </ScrollView>
        </View>
      )}

      {loading ? <Spinner /> : recipes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No recipes yet</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/recipe/edit')} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>Add your first recipe</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => String(r.id)}
          numColumns={2}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => <RecipeCard recipe={item} onPress={() => router.push(`/(app)/recipe/${item.id}`)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          getItemLayout={(_data, index) => ({
            length: CARD_HEIGHT,
            offset: CARD_HEIGHT * Math.floor(index / 2),
            index,
          })}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={c.accent} />
            </View>
          ) : null}
        />
      )}

      {/* Filter dropdown modal */}
      <Modal visible={!!dropdown} transparent animationType="fade" onRequestClose={() => setDropdown(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setDropdown(null)}>
          <View style={styles.dropdownMenu}>
            {dropdown?.options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.dropdownOption, dropdown.current === opt.value && styles.dropdownOptionActive]}
                onPress={() => { dropdown.onSelect(opt.value); setDropdown(null); }}
              >
                <Text style={[styles.dropdownOptionText, dropdown.current === opt.value && styles.dropdownOptionTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    title: { color: c.text, fontSize: fontSize['2xl'], fontWeight: 'bold' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logoutBtn: { paddingVertical: 4, paddingHorizontal: 2 },
    logoutText: { color: c.muted, fontSize: fontSize.sm },
    addBtn: { backgroundColor: c.accent, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    addBtnText: { color: c.bg, fontSize: fontSize.xl, fontWeight: 'bold', lineHeight: 28 },
    searchWrap: { paddingHorizontal: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
    searchInputWrap: { flex: 1, position: 'relative', flexDirection: 'row', alignItems: 'center' },
    search: { flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, paddingRight: 36, color: c.text },
    searchClear: { position: 'absolute', right: 12 },
    searchClearText: { color: c.muted, fontSize: fontSize.sm },
    sortBtn: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
    sortBtnText: { color: c.muted, fontSize: fontSize.sm },
    filterRow: { paddingHorizontal: 16, paddingVertical: 4, marginBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    filterRowContent: { alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
    tagPicker: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.card, borderRadius: 12, height: 56 },
    grid: { padding: 4 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: c.muted, fontSize: fontSize.base, marginBottom: 16 },
    emptyBtn: { backgroundColor: c.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
    emptyBtnText: { color: c.bg, fontWeight: '600' },
    loadingMore: { paddingVertical: 20, alignItems: 'center' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    dropdownMenu: { backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, minWidth: 180, overflow: 'hidden' },
    dropdownOption: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    dropdownOptionActive: { backgroundColor: `${c.accent}18` },
    dropdownOptionText: { color: c.muted, fontSize: fontSize.sm },
    dropdownOptionTextActive: { color: c.accent, fontWeight: '600' },
  });
}
