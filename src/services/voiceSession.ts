'use client';

import { inferGoalFromQuestion } from '../utils/goalInference';

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type ToolName = 'analyze_frame' | 'update_memory';

interface PendingToolCall {
  name: ToolName;
  userMessage: string;
}

export interface VoiceSessionConfig {
  sessionId: string;
  memoryContext?: string;
  userGoal?: string;
}

export type VoiceEventType =
  | 'connected'
  | 'disconnected'
  | 'sessionStarted'
  | 'sessionEnded'
  | 'audio'
  | 'text'
  | 'transcript'
  | 'toolUse'
  | 'turnComplete'
  | 'error';

export interface VoiceEvent {
  type: VoiceEventType;
  audio?: ArrayBuffer;
  text?: string;
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown>;
  error?: string;
  isSystem?: boolean;
}

type VoiceEventCallback = (event: VoiceEvent) => void;

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shouldAnalyzeFrame(text: string): boolean {
  return /(what do you see|what's in front|what is in front|do you see|can you see|show me|where is|can you spot|can you find|describe the room|describe the scene|tell me about this place|what's around|look at|check this out)/i.test(text);
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const withSpeech = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };

  return withSpeech.SpeechRecognition || withSpeech.webkitSpeechRecognition || null;
}

export class VoiceSession {
  private config: VoiceSessionConfig;
  private callbacks: VoiceEventCallback[] = [];
  private active = false;
  private capturingAudio = false;
  private recognition: SpeechRecognitionLike | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyzer: AnalyserNode | null = null;
  private pendingToolCalls = new Map<string, PendingToolCall>();
  private history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private speaking = false;
  private restartingRecognition = false;

  constructor(config: VoiceSessionConfig) {
    this.config = config;
  }

  onEvent(callback: VoiceEventCallback): void {
    this.callbacks.push(callback);
  }

  private emit(event: VoiceEvent): void {
    for (const callback of this.callbacks) {
      callback(event);
    }
  }

  async connect(): Promise<void> {
    if (this.active) {
      return;
    }

    this.active = true;
    this.emit({ type: 'connected' });
    this.emit({ type: 'sessionStarted' });
  }

  async disconnect(): Promise<void> {
    this.stopCapture();
    this.interrupt('disconnect');
    this.pendingToolCalls.clear();
    this.history = [];
    this.active = false;
    this.emit({ type: 'sessionEnded' });
    this.emit({ type: 'disconnected' });
  }

  async startCapture(): Promise<void> {
    if (this.capturingAudio) {
      return;
    }

    try {
      this.audioContext = new AudioContext();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 512;
      source.connect(this.analyzer);

      this.setupSpeechRecognition();
      this.capturingAudio = true;
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Failed to access microphone';
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        errorMessage = 'Microphone API requires a Secure Context (HTTPS or localhost). Please use a secure tunnel for mobile testing.';
      }
      this.emit({
        type: 'error',
        error: errorMessage,
      });
    }
  }

  stopCapture(): void {
    this.capturingAudio = false;

    if (this.recognition) {
      this.restartingRecognition = false;
      this.recognition.stop();
      this.recognition = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.analyzer) {
      this.analyzer.disconnect();
      this.analyzer = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }

  private setupSpeechRecognition(): void {
    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      this.emit({ type: 'error', error: 'Speech recognition is not supported in this browser.' });
      return;
    }

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      if (this.speaking) {
        return;
      }

      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) {
          finalText += result[0]?.transcript || '';
        }
      }

      const normalized = finalText.trim();
      if (!normalized) {
        return;
      }

      void this.sendText(normalized);
    };

    recognition.onerror = (event) => {
      if (event?.error === 'aborted') {
        return;
      }
      this.emit({ type: 'error', error: event?.error || 'Speech recognition failed' });
    };

    recognition.onend = () => {
      if (!this.capturingAudio || this.restartingRecognition || this.speaking) {
        return;
      }

      this.restartingRecognition = true;
      setTimeout(() => {
        this.restartingRecognition = false;
        try {
          recognition.start();
        } catch {
          // Ignore restart races.
        }
      }, 100);
    };

    recognition.start();
    this.recognition = recognition;
  }

  sendText(text: string, isSystem: boolean = false): void {
    if (!this.active) {
      this.emit({ type: 'error', error: 'Not connected' });
      return;
    }

    const message = text.trim();
    if (!message) {
      return;
    }

    this.emit({ type: 'transcript', text: message, isSystem });

    if (shouldAnalyzeFrame(message)) {
      const toolUseId = createId('tool');
      this.pendingToolCalls.set(toolUseId, {
        name: 'analyze_frame',
        userMessage: message,
      });
      this.emit({
        type: 'toolUse',
        toolName: 'analyze_frame',
        toolUseId,
        toolInput: { question: message },
      });
      return;
    }

    const inferredGoal = inferGoalFromQuestion(message);
    if (inferredGoal) {
      const toolUseId = createId('tool');
      this.pendingToolCalls.set(toolUseId, {
        name: 'update_memory',
        userMessage: message,
      });
      this.emit({
        type: 'toolUse',
        toolName: 'update_memory',
        toolUseId,
        toolInput: { userGoal: inferredGoal, observations: [] },
      });
      return;
    }

    void this.respondWithModel(message);
  }

  sendToolResult(toolUseId: string, result: string | Record<string, unknown>): void {
    if (!this.active) {
      return;
    }

    const pending = this.pendingToolCalls.get(toolUseId);
    this.pendingToolCalls.delete(toolUseId);

    const serializedResult = typeof result === 'string' ? result : JSON.stringify(result);
    if (!pending) {
      void this.respondWithModel(serializedResult);
      return;
    }

    if (pending.name === 'analyze_frame') {
      const prompt = `${pending.userMessage}\n\nVisual analysis from the camera:\n${serializedResult}\n\nAnswer in one concise sentence.`;
      void this.respondWithModel(prompt);
      return;
    }

    this.config.userGoal = inferGoalFromQuestion(pending.userMessage) || this.config.userGoal;
    void this.respondWithModel(serializedResult);
  }

  interrupt(reason: string = 'manual'): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
      } catch (e) {
        // Source might have already ended
      }
      this.currentAudioSource = null;
    }

    this.speaking = false;
    this.emit({ type: 'text', text: `[Interrupted: ${reason}]` });
    
    // Resume recognition after interruption if needed
    if (this.capturingAudio && !this.recognition) {
       this.setupSpeechRecognition();
    }
  }

  private async respondWithModel(message: string): Promise<void> {
    try {
      const payload = {
        message,
        history: this.history,
        memoryContext: this.config.memoryContext,
        userGoal: this.config.userGoal,
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error || `Chat request failed (${response.status})`);
      }

      const assistantText = body.text?.trim();
      if (!assistantText) {
        throw new Error('Assistant response was empty.');
      }

      this.history.push({ role: 'user', content: message });
      this.history.push({ role: 'assistant', content: assistantText });
      this.history = this.history.slice(-12);

      this.emit({ type: 'text', text: assistantText });
      this.emit({ type: 'turnComplete' });
      this.speak(assistantText);
    } catch (error) {
      this.emit({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to generate assistant response',
      });
    }
  }

  private async speak(text: string): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    // Set speaking flag immediately to block recognition restarts
    this.speaking = true;

    // Stop recognition to avoid hearing own voice
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch TTS audio');
      }

      const audioData = await response.arrayBuffer();
      
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContext();
      }

      // Resume context if suspended (common in browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const buffer = await this.audioContext.decodeAudioData(audioData);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);

      source.onended = () => {
        this.speaking = false;
        // Restart recognition after a short delay to avoid catching any remaining echo
        setTimeout(() => {
          if (this.capturingAudio && !this.speaking) {
            this.setupSpeechRecognition();
          }
        }, 400);
      };

      // Handle interruption
      this.currentAudioSource = source;
      
      source.start(0);
    } catch (error) {
      console.error('[VoiceSession] TTS playback error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        text: text.slice(0, 50) + '...',
        error
      });
      this.speaking = false;
      if (this.capturingAudio) {
        this.setupSpeechRecognition();
      }
    }
  }

  private currentAudioSource: AudioBufferSourceNode | null = null;

  get connected(): boolean {
    return this.active;
  }

  get capturing(): boolean {
    return this.capturingAudio;
  }

  get analyzerNode(): AnalyserNode | null {
    return this.analyzer;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }
}
