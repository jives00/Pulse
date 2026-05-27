import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useColors } from '../hooks/useColors';
import { useVoice } from '../hooks/useVoice';
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
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();
  const { screenContext } = useAssistantStore();
  const { transcript, listening, voiceError, start: startListening, cancel: cancelListening } = useVoice();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Fill input field when voice transcript arrives
  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  // Surface voice recognition errors
  useEffect(() => {
    if (voiceError) setError(voiceError);
  }, [voiceError]);

  function handleOpen() {
    setHistory([]);
    setError(null);
    setInput('');
    setOpen(true);
  }

  function handleClose() {
    cancelListening();
    Speech.stop();
    // Blur first so keyboard dismisses before the modal slide-out animation,
    // preventing the double-render flicker on Android.
    inputRef.current?.blur();
    setOpen(false);
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
        const payload = {
          calories: p.calories ?? 0,
          carbsG: p.carbsG ?? 0,
          proteinG: p.proteinG ?? 0,
          fatG: p.fatG ?? 0,
        };
        await saveNutritionGoals(token, payload);
      }
    } catch {
      setError('Action failed. Please try again.');
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || !token) return;

    // Stop any in-progress speech before sending
    Speech.stop();

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

      if (speechEnabled && response.text) {
        Speech.speak(response.text, { language: 'en-US', rate: 1.0 });
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

  const showSend = input.trim().length > 0 && !loading;

  return (
    <>
      <TouchableOpacity style={[fabStyles.fab, { backgroundColor: c.accent }]} onPress={handleOpen} activeOpacity={0.85}>
        <Ionicons name="sparkles" size={22} color="#fff" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          style={[sheetStyles.container, { backgroundColor: c.bg }]}
          behavior="padding"
        >
          {/* Header */}
          <View style={[sheetStyles.header, { borderBottomColor: c.border, paddingTop: insets.top + 16 }]}>
            <Text style={[sheetStyles.title, { color: c.text }]}>Pulse Assistant</Text>
            <View style={sheetStyles.headerActions}>
              <TouchableOpacity
                onPress={() => {
                  const next = !speechEnabled;
                  setSpeechEnabled(next);
                  if (!next) Speech.stop();
                }}
                style={sheetStyles.ttsBtn}
              >
                <Ionicons
                  name={speechEnabled ? 'volume-high' : 'volume-mute'}
                  size={22}
                  color={speechEnabled ? c.accent : c.muted}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose}>
                <Ionicons name="close" size={24} color={c.muted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Messages */}
          <FlatList
            ref={listRef}
            style={sheetStyles.messageListFlex}
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
                <Text style={[sheetStyles.emptyHint, { color: c.muted }]}>Tap the mic button to speak, or type below.</Text>
              </View>
            }
          />

          {error && (
            <Text style={[sheetStyles.errorText, { color: c.error }]}>{error}</Text>
          )}

          {/* Input row */}
          <View style={[sheetStyles.inputRow, { borderTopColor: c.border, backgroundColor: c.bg, paddingBottom: insets.bottom + 12 }]}>
            <TextInput
              ref={inputRef}
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
              <ActivityIndicator color={c.accent} style={sheetStyles.actionBtn} />
            ) : showSend ? (
              <TouchableOpacity
                style={[sheetStyles.actionBtn, { backgroundColor: c.accent }]}
                onPress={handleSend}
              >
                <Ionicons name="arrow-up" size={18} color="#fff" />
              </TouchableOpacity>
            ) : listening ? (
              <TouchableOpacity
                style={[sheetStyles.actionBtn, { backgroundColor: '#e53935' }]}
                onPress={cancelListening}
                activeOpacity={0.7}
              >
                <Ionicons name="stop" size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[sheetStyles.actionBtn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]}
                onPress={startListening}
                activeOpacity={0.7}
              >
                <Ionicons name="mic" size={18} color={c.accent} />
              </TouchableOpacity>
            )}
          </View>

        </KeyboardAvoidingView>
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
    bottom: 88,
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
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ttsBtn: {
    padding: 2,
  },
  messageListFlex: {
    flex: 1,
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
  emptyHint: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: 40,
    opacity: 0.6,
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
    paddingTop: 12,
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
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
