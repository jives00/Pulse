import { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { createRecipe, deleteRecipe, getPhotoUploadUrl, getRecipe, getRecipeBarcode, scrapeRecipe, parseRecipeText, setRecipeBarcode, updateRecipe, uploadPhotoToS3, uploadPhotoFromUrl, type Ingredient, type RecipeDetail } from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import Spinner from '../../../src/components/Spinner';

const TYPES = ['cocktail', 'food', 'prepackaged'] as const;
const ABV_LEVELS = ['low', 'medium', 'strong'];

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const styles = makeStyles(c);
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [importTab, setImportTab] = useState<'url' | 'paste'>('url');
  const [importing, setImporting] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [type, setType] = useState<'cocktail' | 'food' | 'prepackaged'>('cocktail');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [glassType, setGlassType] = useState('');
  const [abvLevel, setAbvLevel] = useState('');
  const [calories, setCalories] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [fatG, setFatG] = useState('');
  const [fiberG, setFiberG] = useState('');
  const [sodiumMg, setSodiumMg] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', quantity: null, unit: null }]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [recipeId, setRecipeId] = useState<number | null>(id ? Number(id) : null);
  const [barcode, setBarcode] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    if (!isNew && id) {
      Promise.all([
        getRecipe(token, Number(id)),
        getRecipeBarcode(token, Number(id)).catch(() => ({ barcode: null })),
      ]).then(([r, barcodeRes]: [RecipeDetail, { barcode: string | null }]) => {
        setType(r.type as any); setName(r.name); setDescription(r.description || ''); setNotes(r.notes || '');
        setSource(r.source || ''); setPrepTime(r.prep_time ? String(r.prep_time) : '');
        setCookTime(r.cook_time ? String(r.cook_time) : ''); setServings(r.servings ? String(r.servings) : ''); setGlassType(r.glass_type || '');
        setSubcategory((r as any).subcategory || '');
        setAbvLevel(r.abv_level || ''); setTags(r.tags); setExistingPhotoUrl(r.photo_url || null);
        setCalories(r.calories ? String(r.calories) : ''); setCarbsG(r.carbs_g ? String(r.carbs_g) : '');
        setProteinG(r.protein_g ? String(r.protein_g) : ''); setFatG(r.fat_g ? String(r.fat_g) : '');
        setFiberG(r.fiber_g ? String(r.fiber_g) : ''); setSodiumMg(r.sodium_mg ? String(r.sodium_mg) : '');
        setIngredients(r.ingredients.length ? r.ingredients : [{ name: '', quantity: null, unit: null }]);
        setSteps(r.steps.length ? r.steps.map((s) => s.instruction) : ['']);
        setBarcode(barcodeRes.barcode ?? '');
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [id]);

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const scraped = await scrapeRecipe(token, importUrl.trim(), type);
      setName(scraped.name || ''); setType(scraped.type || type); setDescription(scraped.description || '');
      setSource(scraped.source || importUrl); setPrepTime(scraped.prep_time ? String(scraped.prep_time) : '');
      setCookTime(scraped.cook_time ? String(scraped.cook_time) : ''); setGlassType(scraped.glass_type || '');
      setSubcategory((scraped as any).subcategory || '');
      setIngredients(scraped.ingredients?.length ? scraped.ingredients : [{ name: '', quantity: null, unit: null }]);
      setSteps(scraped.steps?.length ? scraped.steps : ['']); setTags(scraped.suggested_tags || []);
      if (scraped.photo_url) { setPhotoUrlInput(scraped.photo_url); setPhotoUri(null); }
      setCalories(scraped.calories ? String(scraped.calories) : ''); setCarbsG(scraped.carbs_g ? String(scraped.carbs_g) : '');
      setProteinG(scraped.protein_g ? String(scraped.protein_g) : ''); setFatG(scraped.fat_g ? String(scraped.fat_g) : '');
      setFiberG(scraped.fiber_g ? String(scraped.fiber_g) : ''); setSodiumMg(scraped.sodium_mg ? String(scraped.sodium_mg) : '');
    } catch (e: any) {
      Alert.alert('Import failed', e.message || 'Could not import from this URL');
    } finally { setImporting(false); }
  }

  async function handleParseText() {
    if (!pasteText.trim()) return;
    setImporting(true);
    try {
      const scraped = await parseRecipeText(token, pasteText.trim(), type);
      setName(scraped.name || ''); setType(scraped.type || type); setDescription(scraped.description || '');
      setPrepTime(scraped.prep_time ? String(scraped.prep_time) : '');
      setCookTime(scraped.cook_time ? String(scraped.cook_time) : ''); setGlassType(scraped.glass_type || '');
      setSubcategory((scraped as any).subcategory || '');
      setIngredients(scraped.ingredients?.length ? scraped.ingredients : [{ name: '', quantity: null, unit: null }]);
      setSteps(scraped.steps?.length ? scraped.steps : ['']); setTags(scraped.suggested_tags || []);
      setCalories((scraped as any).calories ? String((scraped as any).calories) : '');
      setCarbsG((scraped as any).carbs_g ? String((scraped as any).carbs_g) : '');
      setProteinG((scraped as any).protein_g ? String((scraped as any).protein_g) : '');
      setFatG((scraped as any).fat_g ? String((scraped as any).fat_g) : '');
      setFiberG((scraped as any).fiber_g ? String((scraped as any).fiber_g) : '');
      setSodiumMg((scraped as any).sodium_mg ? String((scraped as any).sodium_mg) : '');
      setPasteText('');
    } catch (e: any) {
      Alert.alert('Parse failed', e.message || 'Could not parse recipe text');
    } finally { setImporting(false); }
  }


  async function openScanner() {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) { Alert.alert('Permission required', 'Camera access is needed to scan barcodes.'); return; }
    }
    setScannerVisible(true);
  }

  async function handlePickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      const data = { type, name: name.trim(), description: description || undefined, notes: notes || undefined,
        source: source || undefined, prep_time: prepTime ? Number(prepTime) : undefined,
        cook_time: cookTime ? Number(cookTime) : undefined, servings: servings ? Number(servings) : undefined, glass_type: glassType || undefined,
        abv_level: abvLevel || undefined,
        subcategory: subcategory || undefined,
        calories: calories ? Number(calories) : undefined,
        carbs_g: carbsG ? Number(carbsG) : undefined,
        protein_g: proteinG ? Number(proteinG) : undefined,
        fat_g: fatG ? Number(fatG) : undefined,
        fiber_g: fiberG ? Number(fiberG) : undefined,
        sodium_mg: sodiumMg ? Number(sodiumMg) : undefined,
        ingredients: ingredients.filter((i) => i.name.trim()),
        steps: steps.filter((s) => s.trim()), tags };
      let savedId = recipeId;
      if (isNew || !savedId) { const r = await createRecipe(token, data); savedId = r.id; setRecipeId(savedId); }
      else { await updateRecipe(token, savedId, data); }
      if ((type === 'prepackaged' || type === 'food') && barcode.trim() && savedId) {
        await setRecipeBarcode(token, savedId, barcode.trim()).catch(() => {});
      }
      if (photoUri && savedId) {
        const contentType = 'image/jpeg';
        const { uploadUrl, key } = await getPhotoUploadUrl(token, savedId, contentType);
        await uploadPhotoToS3(uploadUrl, photoUri, contentType);
        await updateRecipe(token, savedId, { type, name: name.trim(), photo_key: key });
      } else if (photoUrlInput.trim() && savedId) {
        await uploadPhotoFromUrl(token, savedId, photoUrlInput.trim());
      }
      router.back();
    } catch (e: any) { Alert.alert('Save failed', e.message || 'Could not save recipe'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!recipeId) return;
    Alert.alert('Delete recipe?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteRecipe(token, recipeId).catch(() => {}); router.back(); router.back(); } },
    ]);
  }

  function updateIngredient(index: number, field: keyof Ingredient, value: string) {
    setIngredients((prev) => prev.map((ing, i) => i === index ? { ...ing, [field]: field === 'quantity' ? (value ? Number(value) : null) : value || null } : ing));
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  }

  if (loading) return <Spinner />;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>{isNew ? 'Add Recipe' : 'Edit Recipe'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}><Text style={styles.save}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.form}>
          <View style={styles.importTabRow}>
            <TouchableOpacity onPress={() => setImportTab('url')} style={[styles.importTabBtn, importTab === 'url' && styles.importTabBtnActive]}>
              <Text style={[styles.importTabText, importTab === 'url' && styles.importTabTextActive]}>URL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setImportTab('paste')} style={[styles.importTabBtn, importTab === 'paste' && styles.importTabBtnActive]}>
              <Text style={[styles.importTabText, importTab === 'paste' && styles.importTabTextActive]}>Paste Text</Text>
            </TouchableOpacity>
          </View>
          {importTab === 'url' ? (
            <View style={styles.importRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Paste a recipe URL…" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} value={importUrl} onChangeText={setImportUrl} />
              <TouchableOpacity onPress={handleImport} disabled={importing} style={styles.importBtn}>
                <Text style={styles.importBtnText}>{importing ? '…' : 'Import'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <TextInput
                style={[styles.input, { height: 120, textAlignVertical: 'top', paddingTop: 10 }]}
                placeholder="Paste a recipe here — ingredients, steps, any format…"
                placeholderTextColor={c.muted}
                multiline
                value={pasteText}
                onChangeText={setPasteText}
              />
              <TouchableOpacity onPress={handleParseText} disabled={importing || !pasteText.trim()} style={[styles.importBtn, { marginTop: 8, alignSelf: 'flex-start' }]}>
                <Text style={styles.importBtnText}>{importing ? '…' : 'Parse Recipe'}</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.label}>Photo</Text>
          <TouchableOpacity onPress={handlePickPhoto} style={styles.photoPicker}>
            {photoUri || existingPhotoUrl || photoUrlInput ? (
              <Image source={{ uri: photoUri || photoUrlInput || existingPhotoUrl! }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            ) : <Text style={styles.photoPlaceholderText}>📷 Tap to upload from device</Text>}
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { marginTop: 6 }]}
            placeholder="…or paste an image URL"
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={photoUrlInput}
            onChangeText={(v) => { setPhotoUrlInput(v); setPhotoUri(null); }}
          />


          <Text style={styles.label}>Type</Text>
          <View style={styles.row}>
            {TYPES.map((t) => (
              <TouchableOpacity key={t} onPress={() => setType(t)} style={[styles.typeBtn, type === t && styles.typeBtnActive]}>
                <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Name *</Text>
          <TextInput style={styles.input} placeholder="Recipe name" placeholderTextColor={c.muted} value={name} onChangeText={setName} />

          <Text style={styles.label}>Description</Text>
          <TextInput style={[styles.input, styles.multiline]} placeholder="Optional" placeholderTextColor={c.muted} multiline numberOfLines={2} value={description} onChangeText={setDescription} />

          {type === 'cocktail' && <>
            <Text style={styles.label}>Glass Type</Text>
            <TextInput style={styles.input} placeholder="e.g. Rocks, Coupe" placeholderTextColor={c.muted} value={glassType} onChangeText={setGlassType} />
            <Text style={styles.label}>ABV Level</Text>
            <View style={styles.row}>
              {ABV_LEVELS.map((level) => (
                <TouchableOpacity key={level} onPress={() => setAbvLevel(level === abvLevel ? '' : level)} style={[styles.typeBtn, abvLevel === level && styles.typeBtnActive]}>
                  <Text style={[styles.typeBtnText, abvLevel === level && styles.typeBtnTextActive]}>{level}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>}

          {type === 'food' && (
            <>
              <Text style={styles.label}>Category</Text>
              <View style={styles.row}>
                {(['', 'main', 'side', 'breakfast', 'dessert'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSubcategory(cat)}
                    style={[styles.catBtn, subcategory === cat && styles.catBtnActive]}
                  >
                    <Text style={[styles.catBtnText, subcategory === cat && styles.catBtnTextActive]}>
                      {cat === '' ? 'None' : cat === 'main' ? 'Main' : cat === 'side' ? 'Side' : cat === 'breakfast' ? 'Breakfast' : 'Dessert'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.row, { marginTop: 8 }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Prep (min)</Text>
                  <TextInput style={styles.input} placeholder="0" placeholderTextColor={c.muted} keyboardType="numeric" value={prepTime} onChangeText={setPrepTime} />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Cook (min)</Text>
                  <TextInput style={styles.input} placeholder="0" placeholderTextColor={c.muted} keyboardType="numeric" value={cookTime} onChangeText={setCookTime} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Servings</Text>
                  <TextInput style={styles.input} placeholder="1" placeholderTextColor={c.muted} keyboardType="numeric" value={servings} onChangeText={setServings} />
                </View>
              </View>
            </>
          )}

          {type === 'prepackaged' && (
            <>
              <Text style={styles.label}>Servings</Text>
              <TextInput style={[styles.input, { width: 100 }]} placeholder="1" placeholderTextColor={c.muted} keyboardType="numeric" value={servings} onChangeText={setServings} />
              <Text style={styles.label}>Barcode</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="e.g. 012345678901" placeholderTextColor={c.muted} keyboardType="number-pad" value={barcode} onChangeText={setBarcode} />
                <TouchableOpacity onPress={openScanner} style={styles.scanBtn}>
                  <Text style={styles.scanBtnText}>📷 Scan</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {(type === 'food' || type === 'prepackaged') && <>
            <Text style={styles.label}>Nutrition (per serving)</Text>
            <View style={styles.nutritionGrid}>
              {([
                { label: 'Calories (kcal)', value: calories, set: setCalories },
                { label: 'Carbs (g)', value: carbsG, set: setCarbsG },
                { label: 'Protein (g)', value: proteinG, set: setProteinG },
                { label: 'Fat (g)', value: fatG, set: setFatG },
                { label: 'Fiber (g)', value: fiberG, set: setFiberG },
                { label: 'Sodium (mg)', value: sodiumMg, set: setSodiumMg },
              ] as { label: string; value: string; set: (v: string) => void }[]).map(({ label, value, set }) => (
                <View key={label} style={styles.nutritionCell}>
                  <Text style={styles.nutritionLabel}>{label}</Text>
                  <TextInput style={styles.input} placeholder="—" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={value} onChangeText={set} />
                </View>
              ))}
            </View>
          </>}

          {type === 'cocktail' && <>
            <Text style={styles.label}>Nutrition (per serving, optional)</Text>
            <View style={styles.nutritionGrid}>
              {([
                { label: 'Calories (kcal)', value: calories, set: setCalories },
                { label: 'Carbs (g)', value: carbsG, set: setCarbsG },
                { label: 'Protein (g)', value: proteinG, set: setProteinG },
                { label: 'Fat (g)', value: fatG, set: setFatG },
                { label: 'Fiber (g)', value: fiberG, set: setFiberG },
                { label: 'Sodium (mg)', value: sodiumMg, set: setSodiumMg },
              ] as { label: string; value: string; set: (v: string) => void }[]).map(({ label, value, set }) => (
                <View key={label} style={styles.nutritionCell}>
                  <Text style={styles.nutritionLabel}>{label}</Text>
                  <TextInput style={styles.input} placeholder="—" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={value} onChangeText={set} />
                </View>
              ))}
            </View>
          </>}

          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Ingredients</Text>
            <TouchableOpacity onPress={() => setIngredients([...ingredients, { name: '', quantity: null, unit: null }])}>
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {ingredients.map((ing, i) => (
            <View key={i} style={[styles.row, { marginBottom: 8 }]}>
              <TextInput style={[styles.input, styles.qtyInput]} placeholder="Qty" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={ing.quantity ? String(ing.quantity) : ''} onChangeText={(v) => updateIngredient(i, 'quantity', v)} />
              <TextInput style={[styles.input, styles.unitInput]} placeholder="Unit" placeholderTextColor={c.muted} value={ing.unit || ''} onChangeText={(v) => updateIngredient(i, 'unit', v)} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ingredient" placeholderTextColor={c.muted} value={ing.name} onChangeText={(v) => updateIngredient(i, 'name', v)} />
              {ingredients.length > 1 && <TouchableOpacity onPress={() => setIngredients(ingredients.filter((_, idx) => idx !== i))} style={styles.deleteBtn}><Text style={styles.deleteBtnText}>✕</Text></TouchableOpacity>}
            </View>
          ))}

          <View style={[styles.sectionHeader, { marginTop: 8 }]}>
            <Text style={styles.label}>Steps</Text>
            <TouchableOpacity onPress={() => setSteps([...steps, ''])}><Text style={styles.addLink}>+ Add</Text></TouchableOpacity>
          </View>
          {steps.map((step, i) => (
            <View key={i} style={[styles.row, { marginBottom: 8, alignItems: 'flex-start' }]}>
              <Text style={styles.stepNum}>{i + 1}.</Text>
              <TextInput style={[styles.input, styles.multiline, { flex: 1 }]} placeholder={`Step ${i + 1}`} placeholderTextColor={c.muted} multiline value={step} onChangeText={(v) => setSteps((prev) => prev.map((s, idx) => idx === i ? v : s))} />
              {steps.length > 1 && <TouchableOpacity onPress={() => setSteps(steps.filter((_, idx) => idx !== i))} style={[styles.deleteBtn, { marginTop: 10 }]}><Text style={styles.deleteBtnText}>✕</Text></TouchableOpacity>}
            </View>
          ))}

          <Text style={[styles.label, { marginTop: 8 }]}>Tags</Text>
          <View style={styles.tagsWrap}>
            {tags.map((tag) => (
              <TouchableOpacity key={tag} onPress={() => setTags(tags.filter((t) => t !== tag))} style={styles.tag}>
                <Text style={styles.tagText}>{tag} ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Add tag" placeholderTextColor={c.muted} value={tagInput} onChangeText={setTagInput} onSubmitEditing={addTag} />
            <TouchableOpacity onPress={addTag} style={styles.addTagBtn}><Text style={styles.addLink}>Add</Text></TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: 8 }]}>Notes</Text>
          <TextInput style={[styles.input, styles.multiline]} placeholder="Personal notes, substitutions…" placeholderTextColor={c.muted} multiline numberOfLines={3} value={notes} onChangeText={setNotes} />

          <Text style={styles.label}>Source</Text>
          <TextInput style={[styles.input, { marginBottom: 24 }]} placeholder="e.g. Death & Co., Dad's recipe" placeholderTextColor={c.muted} value={source} onChangeText={setSource} />

          {!isNew && (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteRecipeBtn}>
              <Text style={styles.deleteRecipeBtnText}>Delete recipe</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Barcode scanner modal */}
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
            onBarcodeScanned={({ data }) => {
              setBarcode(data);
              setScannerVisible(false);
            }}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
          </View>
          <TouchableOpacity style={styles.scannerClose} onPress={() => setScannerVisible(false)}>
            <Text style={styles.scannerCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  headerTitle: { color: c.text, fontWeight: '600', fontSize: fontSize.base },
  cancel: { color: c.muted, fontSize: fontSize.sm },
  save: { color: c.accent, fontWeight: '600', fontSize: fontSize.sm },
  form: { padding: 16 },
  label: { color: c.muted, fontSize: fontSize.sm, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: fontSize.sm, marginBottom: 12 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  importTabRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  importTabBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  importTabBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
  importTabText: { color: c.muted, fontSize: fontSize.sm, fontWeight: '600' },
  importTabTextActive: { color: c.bg },
  importRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  importBtn: { backgroundColor: c.accent, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  importBtnText: { color: c.bg, fontWeight: '600', fontSize: fontSize.sm },
  photoPicker: { height: 140, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 12 },
  photoPlaceholderText: { color: c.muted, fontSize: fontSize.sm },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: c.border, marginRight: 8 },
  typeBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
  typeBtnText: { color: c.muted, fontSize: fontSize.sm, textTransform: 'capitalize', fontWeight: '600' },
  typeBtnTextActive: { color: c.bg },
  catBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: c.border, marginRight: 6 },
  catBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
  catBtnText: { color: c.muted, fontSize: fontSize.sm, fontWeight: '600' },
  catBtnTextActive: { color: c.bg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  addLink: { color: c.accent, fontSize: fontSize.sm, fontWeight: '600' },
  qtyInput: { width: 56, marginRight: 6 },
  unitInput: { width: 60, marginRight: 6 },
  deleteBtn: { padding: 8 },
  deleteBtnText: { color: c.error, fontSize: fontSize.base },
  stepNum: { color: c.accent, fontWeight: 'bold', fontSize: fontSize.sm, width: 20, paddingTop: 10 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tag: { borderWidth: 1, borderColor: c.accent, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: c.accent, fontSize: fontSize.sm },
  addTagBtn: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginLeft: 8 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  imageGridCell: { width: '31%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: c.card },
  nutritionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  nutritionCell: { width: '30%', flexGrow: 1 },
  nutritionLabel: { color: c.muted, fontSize: 13, marginBottom: 4 },
  deleteRecipeBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 16 },
  deleteRecipeBtnText: { color: c.error, fontSize: fontSize.sm },
  scanBtn: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  scanBtnText: { color: c.accent, fontSize: fontSize.sm, fontWeight: '600' },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scannerFrame: { width: 260, height: 160, borderWidth: 2, borderColor: c.accent, borderRadius: 12, backgroundColor: 'transparent' },
  scannerClose: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  scannerCloseText: { color: '#fff', fontSize: fontSize.base, fontWeight: '600' },
  });
}
