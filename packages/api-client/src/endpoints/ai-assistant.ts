import { apiClient } from '../client';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantScreenContext {
  screen: string;
  data?: Record<string, unknown>;
}

export type AssistantActionType = 'log_food' | 'update_nutrition_goal';

export interface LogFoodPayload {
  name: string;
  meal: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface UpdateNutritionGoalPayload {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

export interface AssistantAction {
  type: AssistantActionType;
  payload: LogFoodPayload | UpdateNutritionGoalPayload;
}

export interface AssistantResponse {
  type: 'answer' | 'action';
  text: string;
  action?: AssistantAction;
}

export type InsightPeriod = 'morning' | 'afternoon' | 'evening';

export interface DailyInsight {
  text: string;
  period: InsightPeriod;
}

export const assistantApi = {
  send: (
    history: ConversationMessage[],
    message: string,
    context?: AssistantScreenContext
  ): Promise<AssistantResponse> =>
    apiClient.post<AssistantResponse>('/ai/assistant', { history, message, context }).then((r) => r.data),

  getInsight: (): Promise<DailyInsight> =>
    apiClient.get<DailyInsight>('/ai/assistant/insight', { params: { hour: new Date().getHours() } }).then((r) => r.data),
};
