import { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fontSize } from '../theme';
import type { Recipe } from '../api/client';

interface Props {
  recipe: Recipe;
  onPress: () => void;
}

function RecipeCard({ recipe, onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.card}>
      {recipe.photo_url ? (
        <Image source={{ uri: recipe.photo_url }} style={styles.photo} resizeMode="cover" />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>{recipe.type === 'cocktail' ? '🍸' : '🍽️'}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{recipe.name}</Text>
        <View style={styles.row}>
          <Text style={styles.type}>
            {recipe.type === 'cocktail' ? 'Cocktail' : 'Food'}
            {recipe.subcategory ? ` | ${recipe.subcategory === 'main' ? 'Main' : recipe.subcategory === 'side' ? 'Side' : recipe.subcategory === 'breakfast' ? 'Breakfast' : 'Dessert'}` : ''}
          </Text>
          <View style={styles.indicators}>
            {recipe.last_made && <Text style={styles.check}>✔</Text>}
            {recipe.is_favorite === 1 && <Text style={styles.star}>★</Text>}
          </View>
        </View>
        {recipe.tags.length > 0 && (
          <Text style={styles.tags} numberOfLines={1}>
            {recipe.tags.slice(0, 3).join(' · ')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default memo(RecipeCard);

const styles = StyleSheet.create({
  card: { flex: 1, margin: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  photo: { width: '100%', height: 120 },
  placeholder: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  placeholderIcon: { fontSize: fontSize['3xl'] },
  info: { padding: 8 },
  name: { color: colors.text, fontWeight: '600', fontSize: fontSize.xs, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  type: { color: colors.muted, fontSize: fontSize.xs, textTransform: 'capitalize' },
  indicators: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  star: { color: colors.accent, fontSize: fontSize.xs },
  check: { color: colors.accent, fontSize: fontSize.xs },
  tags: { color: colors.muted, fontSize: fontSize.xs, marginTop: 3 },
});
