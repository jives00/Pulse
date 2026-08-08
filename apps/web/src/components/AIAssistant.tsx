import { useEffect, useRef, useState } from 'react';
import { assistantApi, type ConversationMessage, type AssistantAction } from '@pulse/api-client';
import { useAssistantStore } from '../store/assistantStore';
import { useFeature } from './FeatureGate';

function defaultMeal(): string {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 20) return 'dinner';
  return 'snack';
}

interface Bubble {
  role: 'user' | 'assistant';
  text: string;
}

function MessageBubble({ bubble }: { bubble: Bubble }) {
  const isUser = bubble.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-dram-accent text-black font-medium rounded-br-sm'
            : 'bg-dram-card border border-dram-border text-white rounded-bl-sm'
        }`}
      >
        {bubble.text}
      </div>
    </div>
  );
}

export default function AIAssistant() {
  const { screenContext } = useAssistantStore();
  const nutritionEnabled = useFeature('nutrition');

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ConversationMessage[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function handleOpen() {
    setHistory([]);
    setBubbles([]);
    setError(null);
    setInput('');
    setOpen(true);
  }

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bubbles]);

  async function executeAction(action: AssistantAction) {
    // Actions are executed via the existing API using the api-client
    // Import inline to avoid circular deps
    const { logApi, nutritionTargetsApi } = await import('@pulse/api-client');
    if (action.type === 'log_food') {
      if (!nutritionEnabled) return;
      const p = action.payload as { name: string; meal?: string; calories: number; proteinG: number; carbsG: number; fatG: number };
      await logApi.logInline({
        name: p.name,
        meal: p.meal || defaultMeal(),
        calories: p.calories,
        protein_g: p.proteinG,
        carbs_g: p.carbsG,
        fat_g: p.fatG,
      });
    } else if (action.type === 'update_nutrition_goal') {
      const p = action.payload as { calories: number; proteinG: number; carbsG: number; fatG: number };
      await nutritionTargetsApi.save({
        calories: p.calories,
        proteinG: p.proteinG,
        carbsG: p.carbsG,
        fatG: p.fatG,
      });
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userBubble: Bubble = { role: 'user', text };
    const userMsg: ConversationMessage = { role: 'user', content: text };
    const nextHistory = [...history, userMsg];

    setBubbles((prev) => [...prev, userBubble]);
    setHistory(nextHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await assistantApi.send(history, text, screenContext ?? undefined);
      const assistantMsg: ConversationMessage = { role: 'assistant', content: response.text };
      setBubbles((prev) => [...prev, { role: 'assistant', text: response.text }]);
      setHistory([...nextHistory, assistantMsg]);

      if (response.type === 'action' && response.action) {
        await executeAction(response.action);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-dram-accent text-white flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
        aria-label="Open AI Assistant"
      >
        <span className="text-lg">✦</span>
      </button>

      {/* Sheet */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 pointer-events-auto"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative pointer-events-auto w-full max-w-md h-[70vh] mr-0 mb-0 lg:mr-6 lg:mb-6 bg-dram-card rounded-t-2xl lg:rounded-2xl flex flex-col shadow-2xl border border-dram-border overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-dram-border shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-dram-accent">✦</span>
                <span className="text-sm font-semibold text-white">Pulse Assistant</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                ✕
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {bubbles.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
                  <span className="text-3xl">✦</span>
                  <p className="text-sm text-center text-slate-400">Ask me about nutrition, workouts, or log a meal.</p>
                </div>
              )}
              {bubbles.map((b, i) => (
                <MessageBubble key={i} bubble={b} />
              ))}
              {loading && (
                <div className="flex justify-start mb-2">
                  <div className="bg-dram-surface2 rounded-2xl rounded-bl-sm px-4 py-2.5">
                    <div className="flex gap-1 items-center h-4">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              {error && <p className="text-xs text-red-400 text-center py-1">{error}</p>}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-dram-border px-3 py-2 flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask something…"
                rows={1}
                className="flex-1 resize-none bg-dram-bg border border-dram-border rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-dram-accent max-h-24 overflow-y-auto"
                style={{ minHeight: '38px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-full bg-dram-accent text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
