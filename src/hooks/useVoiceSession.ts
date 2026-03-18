'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { VoiceSession, VoiceEvent, VoiceSessionConfig } from '../services/voiceSession';

export interface UseVoiceSessionReturn {
  /** Start the voice session */
  startSession: () => Promise<void>;
  /** End the voice session */
  endSession: () => Promise<void>;
  /** Toggle microphone capture */
  toggleCapture: () => Promise<void>;
  /** Send text (fallback when mic unavailable or for system instructions) */
  sendText: (text: string, isSystem?: boolean) => void;
  /** Send a tool result back to the assistant session */
  sendToolResult: (toolUseId: string, result: string | Record<string, unknown>) => void;
  /** Interrupt current playback */
  interrupt: (reason?: string) => void;
  /** Whether connected to the WebSocket */
  isConnected: boolean;
  /** Whether microphone is capturing */
  isCapturing: boolean;
  /** Current transcription from voice input */
  transcript: string;
  /** Last text response */
  lastResponse: string;
  /** Last tool call info */
  lastToolCall: { name: string; input: Record<string, unknown>; toolUseId: string } | null;
  /** Voice events log (last 20) */
  eventLog: VoiceEvent[];
  /** Audio analyzer node for VAD */
  analyzer: AnalyserNode | null;
  /** Whether the session is grounded and ready for interaction */
  isGrounded: boolean;
  /** Whether the assistant is currently speaking */
  isSpeaking: boolean;
  /** Current error */
  error: string | null;
}

export function useVoiceSession(
  sessionId: string,
  options?: { memoryContext?: string; userGoal?: string }
): UseVoiceSessionReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [lastToolCall, setLastToolCall] = useState<{ name: string; input: Record<string, unknown>; toolUseId: string } | null>(null);
  const [eventLog, setEventLog] = useState<VoiceEvent[]>([]);
  const [isGrounded, setIsGrounded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzer, setAnalyzer] = useState<AnalyserNode | null>(null);
  const sessionRef = useRef<VoiceSession | null>(null);

  const addEvent = useCallback((event: VoiceEvent) => {
    setEventLog((prev) => [...prev.slice(-19), event]);
  }, []);

  const startSession = useCallback(async () => {
    try {
      setError(null);

      const config: VoiceSessionConfig = {
        sessionId,
        memoryContext: options?.memoryContext,
        userGoal: options?.userGoal,
      };

      const session = new VoiceSession(config);
      sessionRef.current = session;

      const appendWithSpace = (prev: string, next: string) => {
        if (!prev) return next;
        if (!next) return prev;
        const needsSpace = !/\s$/.test(prev) && !/^\s/.test(next);
        return needsSpace ? `${prev} ${next}` : `${prev}${next}`;
      };

      session.onEvent((event: VoiceEvent) => {
        addEvent(event);

        switch (event.type) {
          case 'connected':
            setIsConnected(true);
            break;

          case 'disconnected':
            setIsConnected(false);
            setIsCapturing(false);
            break;

          case 'sessionStarted':
            setIsGrounded(true);
            break;

          case 'text':
            if (event.text) {
              const text = event.text;
              setLastResponse((prev) => appendWithSpace(prev, text));
            }
            break;

          case 'transcript':
            if (event.text && !event.isSystem) {
              const text = event.text;
              setTranscript((prev) => appendWithSpace(prev, text));
            }
            break;

          case 'toolUse':
            if (event.toolName && event.toolUseId) {
              setLastToolCall({
                name: event.toolName,
                input: event.toolInput || {},
                toolUseId: event.toolUseId,
              });
            }
            break;

          case 'turnComplete':
            break;

          case 'error':
            setError(event.error || 'Unknown voice error');
            break;
        }
      });

      await session.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start voice session');
    }
  }, [sessionId, addEvent, options]);

  const endSession = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.disconnect();
      sessionRef.current = null;
    }
    setIsConnected(false);
    setIsCapturing(false);
    setIsGrounded(false);
  }, []);

  const toggleCapture = useCallback(async () => {
    if (!sessionRef.current) return;

    if (isCapturing) {
      sessionRef.current.stopCapture();
      setIsCapturing(false);
      setAnalyzer(null);
    } else {
      try {
        await sessionRef.current.startCapture();
        setIsCapturing(true);
        setAnalyzer(sessionRef.current.analyzerNode);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start microphone capture');
      }
    }
  }, [isCapturing]);

  const sendText = useCallback((text: string, isSystem: boolean = false) => {
    if (sessionRef.current) {
      sessionRef.current.sendText(text, isSystem);
    }
  }, []);

  const sendToolResult = useCallback((toolUseId: string, result: string | Record<string, unknown>) => {
    if (sessionRef.current) {
      sessionRef.current.sendToolResult(toolUseId, result);
    }
  }, []);

  const interrupt = useCallback((reason: string = 'manual') => {
    if (sessionRef.current) {
      sessionRef.current.interrupt(reason);
    }
  }, []);

  // Barge-in check (VAD)
  useEffect(() => {
    if (!isCapturing || !analyzer || !isConnected) return;

    let rafVolume: number;
    let rafStatus: number;

    const checkVolume = () => {
      // Barge-in is now handled by pausing recognition in VoiceSession.ts
      // during speech playback, which is more reliable than VAD-based interruption.
      rafVolume = requestAnimationFrame(checkVolume);
    };
    rafVolume = requestAnimationFrame(checkVolume);

    const checkStatus = () => {
      if (sessionRef.current) {
        setIsSpeaking(sessionRef.current.isSpeaking);
      }
      rafStatus = requestAnimationFrame(checkStatus);
    };
    rafStatus = requestAnimationFrame(checkStatus);

    return () => {
      cancelAnimationFrame(rafVolume);
      cancelAnimationFrame(rafStatus);
    };
  }, [isCapturing, analyzer, isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect().catch(console.error);
      }
    };
  }, []);

  return {
    startSession,
    endSession,
    toggleCapture,
    sendText,
    sendToolResult,
    interrupt,
    isConnected,
    isCapturing,
    isGrounded,
    isSpeaking,
    transcript,
    lastResponse,
    lastToolCall,
    eventLog,
    analyzer,
    error,
  };
}
