'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { VoiceSession, VoiceEvent, VoiceSessionConfig } from '../services/voiceSession';

const BARGE_IN_GRACE_MS = 900;
const BARGE_IN_COOLDOWN_MS = 1500;
const BARGE_IN_RMS_THRESHOLD = 0.08;
const BARGE_IN_REQUIRED_FRAMES = 4;

export interface UseVoiceSessionReturn {
  /** Start the voice session */
  startSession: () => Promise<void>;
  /** End the voice session */
  endSession: () => Promise<void>;
  /** Toggle microphone capture */
  toggleCapture: () => Promise<void>;
  /** Send text (fallback when mic unavailable) */
  sendText: (text: string) => void;
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
            if (event.text) {
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

  const sendText = useCallback((text: string) => {
    if (sessionRef.current) {
      sessionRef.current.sendText(text);
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

  const lastInterruptRef = useRef<number>(0);
  const assistantSpeechStartedRef = useRef<number>(0);

  // Barge-in check (VAD)
  useEffect(() => {
    if (!isCapturing || !analyzer || !isConnected) return;

    let rafVolume: number;
    let rafStatus: number;
    const timeDomainData = new Uint8Array(analyzer.fftSize);
    let wasSpeaking = false;
    let loudFrames = 0;

    const getRms = () => {
      analyzer.getByteTimeDomainData(timeDomainData);
      let sumSquares = 0;
      for (let i = 0; i < timeDomainData.length; i++) {
        const centered = (timeDomainData[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      return Math.sqrt(sumSquares / timeDomainData.length);
    };

    const checkVolume = () => {
      if (sessionRef.current) {
        const currentlySpeaking = sessionRef.current.isSpeaking;
        const now = Date.now();

        if (currentlySpeaking && !wasSpeaking) {
          assistantSpeechStartedRef.current = now;
          loudFrames = 0;
        }

        if (!currentlySpeaking) {
          loudFrames = 0;
        }

        const pastGraceWindow = now - assistantSpeechStartedRef.current >= BARGE_IN_GRACE_MS;
        const cooldownFinished = now - lastInterruptRef.current >= BARGE_IN_COOLDOWN_MS;

        // Barge-in is disabled to prevent self-interruption.
        // The assistant will now speak until completion regardless of detected input volume.
        /*
        if (currentlySpeaking && pastGraceWindow && cooldownFinished) {
          const rms = getRms();
          if (rms >= BARGE_IN_RMS_THRESHOLD) {
            loudFrames += 1;
          } else {
            loudFrames = Math.max(0, loudFrames - 1);
          }

          if (loudFrames >= BARGE_IN_REQUIRED_FRAMES) {
            sessionRef.current.interrupt('barge-in');
            lastInterruptRef.current = now;
            loudFrames = 0;
          }
        }
        */

        wasSpeaking = currentlySpeaking;
      }
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
