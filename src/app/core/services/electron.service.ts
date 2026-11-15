import { Injectable, NgZone } from '@angular/core';

export interface ChatMessage { id: string | number; role: string; content: string; timestamp: string; }
export interface Settings { mode: 'mixed' | 'local'; autonomous: boolean; chatFrequency: 'lively' | 'normal' | 'quiet'; rememberHistory: boolean; }
export interface AutonomyState { state: 'waiting' | 'busy' | 'paused' | 'disabled' | 'chatting'; nextInSeconds: number; frequency: string; }
export interface TaskState { busy: boolean; queued: number; status: string; provider: string; model: string; }
export interface AgentResponse { agent: string; message: string; action?: string | null; timestamp?: string; }
export interface Confirmation { requestId: string; agent: string; command: string; cloud: boolean; expiresAt: number; }
export interface Bootstrap { history: ChatMessage[]; settings: Settings; task: TaskState; autonomy?: AutonomyState; availability: { nvidia: boolean; groq: boolean }; }
interface DesktopPetApi {
  bootstrap(): Promise<Bootstrap>;
  sendMessage(text: string): Promise<boolean>;
  cancel(): Promise<boolean>;
  chatNow(): Promise<boolean>;
  clearHistory(): Promise<boolean>;
  settings(value: Settings): Promise<Settings>;
  confirm(id: string, approved: boolean): Promise<boolean>;
  setInteractive(value: boolean): void;
  drag(phase: 'start' | 'end'): void;
  onHistory(callback: (data: ChatMessage[]) => void): () => void;
  onResponse(callback: (data: AgentResponse) => void): () => void;
  onStatus(callback: (data: { agent: string; status: string }) => void): () => void;
  onTask(callback: (data: TaskState) => void): () => void;
  onAutonomy(callback: (data: AutonomyState) => void): () => void;
  onConfirmation(callback: (data: Confirmation | null) => void): () => void;
}
declare global { interface Window { desktopPet?: DesktopPetApi; } }
@Injectable({ providedIn: 'root' })
export class ElectronService {
  readonly api = window.desktopPet;
  readonly isElectron = Boolean(this.api);
  constructor(private zone: NgZone) {}
  subscribe<T>(event: 'onHistory' | 'onResponse' | 'onStatus' | 'onTask' | 'onAutonomy' | 'onConfirmation', callback: (data: T) => void): () => void {
    if (!this.api) return () => {};
    return (this.api[event] as (fn: (data: T) => void) => () => void)(data => this.zone.run(() => callback(data)));
  }
}
