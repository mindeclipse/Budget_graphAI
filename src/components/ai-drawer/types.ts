import {
  AIAnalysisResponse,
  SupportedGeminiModel,
  ChatMessage,
  AIChatFinancialContext,
} from "@/types/ai";

export interface AIAnalysisDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: AIAnalysisResponse | null;
  isLoading: boolean;
  selectedModel: SupportedGeminiModel;
  onModelChange: (model: SupportedGeminiModel) => void;
  onReanalyze: () => void;
  initialPrompt?: string;
  financialContext: AIChatFinancialContext;
}
