import { useState } from 'react';

// Owns the Premiumize.ai co-pilot state: enable flag + token + selected model +
// models list + fetching flag, the global AI-busy flag, the subtitle translate
// language, the TV recap panel (open/text/loading/error), the playlist AI-curate
// input, and the floating co-pilot chat (open + messages + input).
//
// NOTE: the AI network calls (fetch models, recap generation, translation, curate,
// chat completions) are handlers in AppContent (credentialed AI fetch); they read
// this state via context.
export function useAiState() {
  const [aiEnabled, setAiEnabled] = useState(() => {
    return localStorage.getItem('premio_ai_enabled') === 'true';
  });
  const [aiToken, setAiToken] = useState(() => {
    return localStorage.getItem('premio_ai_token') || '';
  });
  const [aiModel, setAiModel] = useState(() => {
    return localStorage.getItem('premio_ai_model') || 'gpt-5.4';
  });
  const [aiModelsList, setAiModelsList] = useState(() => {
    const saved = localStorage.getItem('premio_ai_models_list');
    return saved ? JSON.parse(saved) : [
      { id: 'gpt-5.4', name: 'gpt-5.4', owned_by: 'openai' },
      { id: 'gpt-4o', name: 'gpt-4o', owned_by: 'openai' }
    ];
  });
  const [fetchingModels, setFetchingModels] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTranslateLanguage, setAiTranslateLanguage] = useState(() => {
    return localStorage.getItem('premio_ai_translate_language') || '';
  });
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapText, setRecapText] = useState(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState('');
  const [showAICurateInput, setShowAICurateInput] = useState(false);
  const [aiCuratePrompt, setAiCuratePrompt] = useState('');
  const [showAICopilot, setShowAICopilot] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState(() => {
    const saved = localStorage.getItem('premio_ai_copilot_messages');
    return saved ? JSON.parse(saved) : [
      { role: 'assistant', content: 'Hello! I am your Premio AI Co-pilot. How can I help you manage your library or recommend something to stream today?'}
    ];
  });
  const [copilotInput, setCopilotInput] = useState('');

  return {
    aiEnabled, setAiEnabled,
    aiToken, setAiToken,
    aiModel, setAiModel,
    aiModelsList, setAiModelsList,
    fetchingModels, setFetchingModels,
    aiLoading, setAiLoading,
    aiTranslateLanguage, setAiTranslateLanguage,
    recapOpen, setRecapOpen,
    recapText, setRecapText,
    recapLoading, setRecapLoading,
    recapError, setRecapError,
    showAICurateInput, setShowAICurateInput,
    aiCuratePrompt, setAiCuratePrompt,
    showAICopilot, setShowAICopilot,
    copilotMessages, setCopilotMessages,
    copilotInput, setCopilotInput,
  };
}
