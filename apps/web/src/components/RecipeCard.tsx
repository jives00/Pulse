import { memo } from 'react';
import type { Recipe } from '../../../../packages/api-client/src/index';

interface Props {
  recipe: Recipe;
  onClick: () => void;
}

function RecipeCard({ recipe, onClick }: Props) {
  const isFav = Boolean(recipe.is_favorite);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="bg-dram-card rounded-xl overflow-hidden cursor-pointer border border-dram-border hover:border-dram-accent/50 transition group"
    >
      {/* Photo */}
      <div className="aspect-square bg-dram-card relative overflow-hidden">
        {recipe.photo_url ? (
          <img
            src={recipe.photo_url}
            alt={recipe.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl opacity-30">
              {recipe.type === 'cocktail' ? '🍸' : '🍴'}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-white text-sm leading-snug line-clamp-2">{recipe.name}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-dram-muted text-sm capitalize">
            {recipe.type === 'cocktail' ? 'Cocktail' : 'Food'}
            {recipe.subcategory && (
              <span> | {recipe.subcategory === 'main' ? 'Main Dish' : recipe.subcategory === 'side' ? 'Side Dish' : recipe.subcategory === 'breakfast' ? 'Breakfast' : recipe.subcategory === 'prepackaged' ? 'Prepackaged' : 'Desserts & Snacks'}</span>
            )}
          </p>
          {(isFav || recipe.last_made) && (
            <div className="flex gap-1 text-dram-accent text-sm">
              {recipe.last_made && <span>✔</span>}
              {isFav && <span>★</span>}
            </div>
          )}
        </div>
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {recipe.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-sm border border-dram-accent/40 text-dram-accent rounded-full px-2 py-0.5 capitalize"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(RecipeCard);
