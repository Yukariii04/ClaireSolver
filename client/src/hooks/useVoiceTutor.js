/**
 * useVoiceTutor.js
 *
 * Hands-Free Voice & System 1 Gatekeeper Hook for Claire Solver.
 * Streams 16kHz 16-bit Mono Linear PCM from the user's microphone to the AI Engine
 * (/ws/voice WebSocket endpoint). Listens for real-time Gatekeeper decisions:
 * - PAUSE_TUTOR: Immediately halts ghost pen explanation.
 * - TRIGGER_GEMINI: Dispatches claire:summon or triggers onTriggerGemini callback.
 * - IGNORE: Flags student self-talk / muttering without interrupting playback.
 * - tts_audio: Plays synthesized audio synchronized with step-by-step math solver.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStepPlaybackQueue } from '../store/useStepPlaybackQueue.js';
import { useNotebookStore } from '../store/useNotebookStore.js';
import { harvestCanvasContext } from '../lib/harvestCanvasContext.js';

/**
 * Converts Float32Array PCM samples [-1.0, 1.0] to 16-bit signed PCM ArrayBuffer.
 *
 * @param {Float32Array} float32Array
 * @returns {ArrayBuffer}
 */
function convertFloat32ToInt16PCM(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array.buffer;
}

/**
 * Custom React Hook for Hands-Free Voice Gatekeeper and STT/TTS interaction.
 *
 * @param {Object} options
 * @param {Function} [options.onTriggerGemini] - Optional custom callback when Gatekeeper approves summons.
 * @param {string} [options.activePageId] - Active notebook page ID for auto-harvesting canvas context.
 * @param {string} [options.notebookId] - Active notebook ID.
 * @param {string} [options.preferredLanguage='en-IN'] - Spoken language preference.
 * @param {boolean} [options.autoConnect=false] - Whether to connect and listen on mount.
 * @returns {Object} Voice tutor controls and real-time state.
 */
export function useVoiceTutor({
  onTriggerGemini,
  activePageId,
  notebookId,
  preferredLanguage = 'en-IN',
  autoConnect = false,
} = {}) {
  // ---- Live State ----
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [gatekeeperState, setGatekeeperState] = useState('idle'); // 'idle' | 'listening' | 'evaluating' | 'summoned' | 'ignored' | 'paused'
  const [error, setError] = useState(null);

  // ---- Audio & WebSocket References ----
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorNodeRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const currentAudioRef = useRef(null);
  const ignoreTimeoutRef = useRef(null);
  const isMutedRef = useRef(isMuted);

  // Keep mute state ref in sync for the audio processor callback
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  /**
   * Stop active synthesized TTS audio playback
   */
  const stopCurrentTtsAudio = useCallback(() => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch (e) {
        console.warn('[useVoiceTutor] Error stopping TTS audio:', e);
      }
      currentAudioRef.current = null;
    }
  }, []);

  /**
   * Play base64 WAV/MP3 synthesized audio and sync with Ghost Pen playback queue.
   */
  const playSynthesizedAudio = useCallback((audioBase64, mimeType = 'audio/wav', stepNumber = null) => {
    try {
      stopCurrentTtsAudio();

      const audioUrl = `data:${mimeType};base64,${audioBase64}`;
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onplay = () => {
        // Signal queue that voice narration has begun
        useStepPlaybackQueue.setState({ isSpeakingStep: true });
      };

      audio.onended = () => {
        currentAudioRef.current = null;
        if (stepNumber !== null && stepNumber !== undefined) {
          useStepPlaybackQueue.getState().completeStepTTS(stepNumber);
        } else {
          useStepPlaybackQueue.setState({ isSpeakingStep: false });
        }
      };

      audio.onerror = (err) => {
        console.warn('[useVoiceTutor] TTS Audio playback failed:', err);
        currentAudioRef.current = null;
        if (stepNumber !== null && stepNumber !== undefined) {
          useStepPlaybackQueue.getState().completeStepTTS(stepNumber);
        } else {
          useStepPlaybackQueue.setState({ isSpeakingStep: false });
        }
      };

      audio.play().catch((err) => {
        console.warn('[useVoiceTutor] Audio play call rejected:', err);
        currentAudioRef.current = null;
        if (stepNumber !== null && stepNumber !== undefined) {
          useStepPlaybackQueue.getState().completeStepTTS(stepNumber);
        }
      });
    } catch (err) {
      console.error('[useVoiceTutor] playSynthesizedAudio error:', err);
      if (stepNumber !== null && stepNumber !== undefined) {
        useStepPlaybackQueue.getState().completeStepTTS(stepNumber);
      }
    }
  }, [stopCurrentTtsAudio]);

  /**
   * Dispatches claire:summon with harvested visual context from the page.
   */
  const triggerSummon = useCallback(
    async (mode, text) => {
      setGatekeeperState('summoned');

      if (typeof onTriggerGemini === 'function') {
        onTriggerGemini({ mode: mode || 'solve', transcript: text || transcript });
        return;
      }

      const targetPageId =
        activePageId ||
        useStepPlaybackQueue.getState().activePageId ||
        useNotebookStore.getState().activePageId ||
        'page_1';

      const targetNotebookId =
        notebookId ||
        useStepPlaybackQueue.getState().notebookId ||
        useNotebookStore.getState().activeNotebook?.id ||
        null;

      try {
        const harvested = await harvestCanvasContext(targetPageId);
        window.dispatchEvent(
          new CustomEvent('claire:summon', {
            detail: {
              action: mode || 'solve',
              query: text || transcript,
              pageId: targetPageId,
              notebookId: targetNotebookId,
              boundingBox: null,
              fullPageBase64: harvested.fullPageBase64,
              croppedTargetBase64: harvested.croppedTargetBase64,
              preferredLanguage,
            },
          })
        );
      } catch (err) {
        console.warn('[useVoiceTutor] harvestCanvasContext failed on voice summon, falling back:', err);
        window.dispatchEvent(
          new CustomEvent('claire:summon', {
            detail: {
              action: mode || 'solve',
              query: text || transcript,
              pageId: targetPageId,
              notebookId: targetNotebookId,
              boundingBox: null,
              fullPageBase64: '',
              croppedTargetBase64: '',
              preferredLanguage,
            },
          })
        );
      }
    },
    [activePageId, notebookId, onTriggerGemini, preferredLanguage, transcript]
  );

  /**
   * Cleanly teardown audio pipeline and media stream tracks.
   */
  const cleanUpAudioContext = useCallback(() => {
    if (processorNodeRef.current) {
      try {
        processorNodeRef.current.disconnect();
      } catch (e) {
        // ignore disconnect errors
      }
      processorNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // ignore disconnect errors
      }
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {
        // ignore track stop errors
      }
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // ignore close errors
      }
      audioContextRef.current = null;
    }
  }, []);

  /**
   * Stop listening, disconnect microphone, and close WebSocket.
   */
  const stopListening = useCallback(() => {
    cleanUpAudioContext();

    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
      } catch (e) {
        // ignore close errors
      }
      wsRef.current = null;
    }

    if (ignoreTimeoutRef.current) {
      clearTimeout(ignoreTimeoutRef.current);
      ignoreTimeoutRef.current = null;
    }

    setIsListening(false);
    setGatekeeperState('idle');
  }, [cleanUpAudioContext]);

  /**
   * Start microphone capture at 16kHz linear PCM and connect to /ws/voice.
   */
  const startListening = useCallback(async () => {
    stopListening();
    setError(null);

    // 1. Resolve WebSocket Endpoint
    const rawAiUrl =
      import.meta.env?.VITE_AI_WS_URL ||
      import.meta.env?.VITE_AI_URL ||
      'ws://localhost:8000';

    let wsVoiceUrl = rawAiUrl.replace(/^http/, 'ws');
    if (!wsVoiceUrl.endsWith('/ws/voice')) {
      wsVoiceUrl = `${wsVoiceUrl.replace(/\/$/, '')}/ws/voice`;
    }

    try {
      // 2. Request 16kHz Mono Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 3. Connect WebSocket to /ws/voice
      const ws = new WebSocket(wsVoiceUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setIsListening(true);
        setGatekeeperState('listening');
        // Announce client context session
        ws.send(
          JSON.stringify({
            type: 'init_voice_session',
            preferredLanguage,
            activePageId: activePageId || 'page_1',
            notebookId: notebookId || null,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);

            // Handle live speech transcript
            if (data.type === 'transcript' || data.transcript !== undefined) {
              setTranscript(data.transcript || '');
            }

            // Gatekeeper state signals
            if (data.type === 'gatekeeper_status' && data.status) {
              setGatekeeperState(data.status);
            }

            // Decision: PAUSE_TUTOR
            const isPause =
              data.decision === 'PAUSE_TUTOR' ||
              data.type === 'PAUSE_TUTOR' ||
              data.action === 'PAUSE_TUTOR';

            if (isPause) {
              setGatekeeperState('paused');
              useStepPlaybackQueue.getState().pausePlayback('Student voice interruption');
              stopCurrentTtsAudio();
              return;
            }

            // Decision: TRIGGER_GEMINI
            const isTrigger =
              data.decision === 'TRIGGER_GEMINI' ||
              data.type === 'TRIGGER_GEMINI' ||
              data.action === 'TRIGGER_GEMINI';

            if (isTrigger) {
              triggerSummon(data.mode || 'solve', data.transcript || transcript);
              return;
            }

            // Decision: IGNORE
            const isIgnore =
              data.decision === 'IGNORE' ||
              data.type === 'IGNORE' ||
              data.action === 'IGNORE';

            if (isIgnore) {
              setGatekeeperState('ignored');
              if (ignoreTimeoutRef.current) clearTimeout(ignoreTimeoutRef.current);
              ignoreTimeoutRef.current = setTimeout(() => {
                setGatekeeperState((prev) => (prev === 'ignored' ? 'listening' : prev));
              }, 1500);
              return;
            }

            // Synthesized TTS Audio Delivery
            const isTts =
              data.type === 'tts_audio' ||
              data.action === 'tts_audio' ||
              Boolean(data.audio_base64 || data.audio);

            if (isTts) {
              const audioPayload = data.audio_base64 || data.audio || data.payload;
              if (audioPayload) {
                playSynthesizedAudio(
                  audioPayload,
                  data.mimeType || 'audio/wav',
                  data.step_number || data.stepNumber
                );
              }
            }
          }
        } catch (msgErr) {
          console.error('[useVoiceTutor] WebSocket message handling error:', msgErr);
        }
      };

      ws.onerror = (err) => {
        console.warn('[useVoiceTutor] WebSocket error:', err);
        setError('Voice connection error.');
      };

      ws.onclose = () => {
        setIsListening(false);
        setGatekeeperState('idle');
      };

      // 4. Setup Web Audio API AudioContext & ScriptProcessor
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      // 1024 frames buffer (at 16000Hz = ~64ms per chunk, 2048 bytes per Int16 frame)
      const bufferSize = 1024;
      const processorNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorNodeRef.current = processorNode;

      processorNode.onaudioprocess = (audioProcessingEvent) => {
        if (isMutedRef.current) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const channelData = inputBuffer.getChannelData(0); // Mono channel 0 Float32

        // Convert Float32 [-1.0, 1.0] to 16-bit linear PCM
        const pcmBuffer = convertFloat32ToInt16PCM(channelData);

        // Stream binary 16-bit PCM chunk over WebSocket
        try {
          wsRef.current.send(pcmBuffer);
        } catch (sendErr) {
          console.warn('[useVoiceTutor] Send PCM error:', sendErr);
        }
      };

      sourceNode.connect(processorNode);
      // Connect processor to destination so processing clock ticks (mute gain prevents feedback)
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      processorNode.connect(silentGain);
      silentGain.connect(audioCtx.destination);
    } catch (err) {
      console.error('[useVoiceTutor] Failed to start microphone:', err);
      setError(err.message || 'Microphone access denied.');
      stopListening();
    }
  }, [
    activePageId,
    notebookId,
    preferredLanguage,
    playSynthesizedAudio,
    stopCurrentTtsAudio,
    stopListening,
    transcript,
    triggerSummon,
  ]);

  /**
   * Toggles microphone transmission mute state.
   */
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }
      return next;
    });
  }, []);

  // Auto-connect if requested
  useEffect(() => {
    if (autoConnect) {
      startListening();
    }
    return () => {
      stopListening();
      stopCurrentTtsAudio();
    };
  }, [autoConnect, startListening, stopListening, stopCurrentTtsAudio]);

  return {
    isListening,
    isMuted,
    transcript,
    gatekeeperState,
    error,
    startListening,
    stopListening,
    toggleMute,
    playSynthesizedAudio,
    stopCurrentTtsAudio,
  };
}

export default useVoiceTutor;
