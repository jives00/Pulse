import { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fontSize, type Colors } from '../theme';
import { useColors } from '../hooks/useColors';
import type { Recipe } from '../api/client';

interface Props {
  recipe: Recipe;
  onPress: () => void;
}

function RecipeCard({ recipe, onPress }: Props) {
  const c = useColors();
  const styles = makeStyles(c);
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

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: { flex: 1, margin: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    photo: { width: '100%', height: 120 },
    placeholder: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: c.border },
    placeholderIcon: { fontSize: fontSize['3xl'] },
    info: { padding: 8 },
    name: { color: c.text, fontWeight: '600', fontSize: fontSize.sm, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    type: { color: c.muted, fontSize: fontSize.sm, textTransform: 'capitalize' },
    indicators: { flexDirection: 'row', gap: 4, alignItems: 'center' },
    star: { color: c.accent, fontSize: fontSize.sm },
    check: { color: c.accent, fontSize: fontSize.sm },
    tags: { color: c.muted, fontSize: fontSize.sm, marginTop: 3 },
  });
}
