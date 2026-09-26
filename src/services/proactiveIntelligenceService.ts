import { storageService } from './storageService';
import { useSevenStore } from '../store/useSevenStore';
import { fetchLiveBriefing } from './liveInfoService';

export interface ProactiveSignal {
  id: string;
  createdAt: number;
  type: 'commitment' | 'weather' | 'calendar' | 'priority' | 'system';
  title: string;
  detail: string;
  confidence: number;
  urgency: 'low' | 'medium' | 'high';
  dismissed?: boolean;
  source: string;
}

const FILE = `${storageService.getDocumentDirectory()}proactive_signals.json`;
class ProactiveIntelligenceService {
  private signals: ProactiveSignal[] = [];
  private loaded = false;
  private async load(): Promise<void> {
    if (this.loaded) return; this.loaded = true;
    try { const info = await storageService.getInfo(FILE); if (info.exists) this.signals = JSON.parse(await storageService.readAsString(FILE)); } catch { this.signals = []; }
  }
  private async persist(): Promise<void> { await storageService.writeAsString(FILE, JSON.stringify(this.signals.slice(0, 100), null, 2)); }

  async analyze(): Promise<ProactiveSignal[]> {
    await this.load();
    const state = useSevenStore.getState();
    if (state.config.proactiveIntelligenceEnabled === false) return this.getSignals();
    const next: ProactiveSignal[] = [];
    const userMessages = state.chatHistory.filter((message) => message.sender === 'user').slice(-40);
    const patterns = /\b(i will|i need to|remind me to|je vais|je dois|rappelle-moi de)\b/i;
    userMessages.filter((message) => patterns.test(message.text)).slice(-5).forEach((message) => next.push({
      id: `commitment-${message.id}`, createdAt: Date.now(), type: 'commitment', title: 'Open commitment', detail: message.text.slice(0, 220), confidence: .82, urgency: 'medium', source: 'conversation',
    }));
    try {
      const briefing = await fetchLiveBriefing(state.config.language || 'en');
      if (briefing.weather && (briefing.weather.windKmh >= 45 || /storm|orage|rain|pluie/i.test(briefing.weather.condition))) next.push({
        id: `weather-${new Date().toISOString().slice(0, 10)}`, createdAt: Date.now(), type: 'weather', title: 'Weather attention', detail: `${briefing.weather.condition}, wind ${briefing.weather.windKmh} km/h in ${briefing.weather.location}.`, confidence: .9, urgency: briefing.weather.windKmh >= 65 ? 'high' : 'medium', source: 'Open-Meteo',
      });
    } catch { /* Offline is not an alert. */ }
    const existing = new Map(this.signals.map((signal) => [signal.id, signal]));
    next.forEach((signal) => existing.set(signal.id, { ...signal, dismissed: existing.get(signal.id)?.dismissed }));
    this.signals = [...existing.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    await this.persist();
    return this.getSignals();
  }
  async getSignals(): Promise<ProactiveSignal[]> { await this.load(); return this.signals.filter((signal) => !signal.dismissed); }
  async dismiss(id: string): Promise<void> { await this.load(); this.signals = this.signals.map((signal) => signal.id === id ? { ...signal, dismissed: true } : signal); await this.persist(); }
}
export const proactiveIntelligenceService = new ProactiveIntelligenceService();
