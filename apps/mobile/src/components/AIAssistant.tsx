import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { fontSize } from '../theme';
import { useAuthStore } from '../store/auth';
import { useAssistantStore } from '../store/assistant';
import {
  sendAssistantMessage,
  logInline,
  saveNutritionGoals,
  type AssistantMessage,
  type AssistantAction,
} from '../api/client';

function defaultMeal(): string {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 20) return 'dinner';
  return 'snack';
}

interface BubbleProps {
  msg: AssistantMessage;
  isUser: boolean;
  bubbleBg: string;
  textColor: string;
}

function Bubble({ msg, isUser, bubbleBg, textColor }: BubbleProps) {
  return (
    <View style={[styles.bubble, { alignSelf: isUser ? 'flex-end' : 'flex-start', backgroundColor: bubbleBg }]}>
      <Text style={[styles.bubbleText, { color: textColor }]}>{msg.content}</Text>
    </View>
  );
}

export default function AIAssistant() {
  const c = useColors();
  const { token } = useAuthStore();
  const { screenContext } = useAssistantStore();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  function handleOpen() {
    setHistory([]);
    setError(null);
    setInput('');
    setOpen(true);
  }

  async function executeAction(action: AssistantAction) {
    if (!token) return;
    const p = action.payload as Record<string, number>;
    try {
      if (action.type === 'log_food') {
        await logInline(token, {
          name: String(action.payload['name' as keyof typeof action.payload] ?? 'Food'),
          meal: String(action.payload['meal' as keyof typeof action.payload] || defaultMeal()),
          calories: p.calories ?? 0,
          protein_g: p.proteinG ?? 0,
          carbs_g: p.carbsG ?? 0,
          fat_g: p.fatG ?? 0,
        });
      } else if (action.type === 'update_nutrition_goal') {
        await saveNutritionGoals(token, {
          calories: p.calories ?? 0,
          proteinG: p.proteinG ?? 0,
          carbsG: p.carbsG ?? 0,
          fatG: p.fatG ?? 0,
        });
      }
    } catch {
      setError('Action failed. Please try again.');
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || !token) return;

    const userMsg: AssistantMessage = { role: 'user', content: text };
    const nextHistory = [...history, userMsg];
    setHistory(nextHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await sendAssistantMessage(token, {
        history,
        message: text,
        context: screenContext ?? undefined,
      });

      const assistantMsg: AssistantMessage = { role: 'assistant', content: response.text };
      setHistory([...nextHistory, assistantMsg]);

      if (response.type === 'action' && response.action) {
        await executeAction(response.action);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  useEffect(() => {
    if (history.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [history.length]);

  return (
    <>
      <TouchableOpacity style={[fabStyles.fab, { backgroundColor: c.accent }]} onPress={handleOpen} activeOpacity={0.85}>
        <Ionicons name="sparkles" size={22} color="#fff" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[sheetStyles.container, { backgroundColor: c.bg }]}>
          {/* Header */}
          <View style={[sheetStyles.header, { borderBottomColor: c.border }]}>
            <Text style={[sheetStyles.title, { color: c.text }]}>Pulse Assistant</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Ionicons name="close" size={24} color={c.muted} />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <FlatList
            ref={listRef}
            data={history}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <Bubble
                msg={item}
                isUser={item.role === 'user'}
                bubbleBg={item.role === 'user' ? c.accent : c.card}
                textColor={c.text}
              />
            )}
            contentContainerStyle={sheetStyles.messageList}
            ListEmptyComponent={
              <View style={sheetStyles.emptyContainer}>
                <Ionicons name="sparkles-outline" size={36} color={c.muted} />
                <Text style={[sheetStyles.emptyText, { color: c.muted }]}>Ask me about nutrition, workouts, or log a meal.</Text>
              </View>
            }
          />

          {error && (
            <Text style={[sheetStyles.errorText, { color: c.error }]}>{error}</Text>
          )}

          {/* Input row */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[sheetStyles.inputRow, { borderTopColor: c.border, backgroundColor: c.bg }]}>
              <TextInput
                style={[sheetStyles.input, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
                placeholder="Ask something…"
                placeholderTextColor={c.muted}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
              />
              {loading ? (
                <ActivityIndicator color={c.accent} style={sheetStyles.sendBtn} />
              ) : (
                <TouchableOpacity
                  style={[sheetStyles.sendBtn, { backgroundColor: c.accent, opacity: input.trim() ? 1 : 0.4 }]}
                  onPress={handleSend}
                  disabled={!input.trim()}
                >
                  <Ionicons name="arrow-up" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 4,
    marginHorizontal: 16,
  },
  bubbleText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    zIndex: 100,
  },
});

const sheetStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  messageList: {
    flexGrow: 1,
    paddingVertical: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
