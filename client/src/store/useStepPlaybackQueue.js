import { create } from 'zustand';
import { useNotebookStore } from './useNotebookStore.js';

// ---------------------------------------------------------------------------
// Helpers: Gnani Timbre Audio & Browser Speech Synthesis Fallback
// ---------------------------------------------------------------------------

let activeUtterance = null;
let activeAudioElement = null;
let advanceTimeoutId = null;

function estimateReadingTimeMs(text) {
  if (!text) return 2500;
  // Estimate ~130 words per minute for math explanations (approx 460ms per word)
  const words = text.trim().split(/\s+/).length;
  return Math.max(2200, Math.min(words * 460, 12000));
}

function speakText(text, language = 'en-IN', onStart, onEnd) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onStart?.();
    const timeout = setTimeout(() => onEnd?.(), estimateReadingTimeMs(text));
    return () => clearTimeout(timeout);
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language || 'en-IN';
    utterance.rate = 0.95; // Slightly slower, clear cadence for math concepts
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      onStart?.();
    };

    utterance.onend = () => {
      activeUtterance = null;
      onEnd?.();
    };

    utterance.onerror = (err) => {
      console.warn('[SpeechSynthesis notice]', err);
      activeUtterance = null;
      onEnd?.();
    };

    activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);

    return () => {
      if (activeUtterance === utterance) {
        window.speechSynthesis.cancel();
        activeUtterance = null;
      }
    };
  } catch (err) {
    console.warn('[SpeechSynthesis fallback]', err);
    onStart?.();
    const fallbackTimeout = setTimeout(() => onEnd?.(), estimateReadingTimeMs(text));
    return () => clearTimeout(fallbackTimeout);
  }
}

function playStepAudio(step, language = 'en-IN', onStart, onEnd) {
  if (step?.tts_audio_base64) {
    try {
      if (activeAudioElement) {
        activeAudioElement.pause();
        activeAudioElement = null;
      }
      const audio = new Audio(`data:audio/wav;base64,${step.tts_audio_base64}`);
      activeAudioElement = audio;

      audio.onplay = () => {
        onStart?.();
      };
      audio.onended = () => {
        activeAudioElement = null;
        onEnd?.();
      };
      audio.onerror = () => {
        activeAudioElement = null;
        speakText(step.tts_speech || step.margin_note, language, onStart, onEnd);
      };

      audio.play().catch(() => {
        activeAudioElement = null;
        speakText(step.tts_speech || step.margin_note, language, onStart, onEnd);
      });

      return () => {
        if (activeAudioElement === audio) {
          audio.pause();
          activeAudioElement = null;
        }
      };
    } catch {
      return speakText(step.tts_speech || step.margin_note, language, onStart, onEnd);
    }
  }

  const textToSpeak = step.tts_speech || step.margin_note || 'Step';
  return speakText(textToSpeak, language, onStart, onEnd);
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------

export const useStepPlaybackQueue = create((set, get) => ({
  // ---- State --------------------------------------------------------------
  stepsQueue: [],
  currentStepIndex: -1,
  playbackState: 'idle', // 'idle' | 'playing' | 'paused' | 'completed'
  activePageId: null,
  notebookId: null,
  language: 'en-IN',

  isWritingStep: false,
  isSpeakingStep: false,
  isPaused: false,
  pausedReason: null,

  // Map of step_number -> 'pending' | 'writing' | 'completed'
  stepStatusMap: {},
  mistakeNote: null,

  // ---- Actions ------------------------------------------------------------

  setMistakeNote: (note) => set({ mistakeNote: note }),

  /**
   * Start sequential playback for a list of SolutionStep objects.
   */
  startPlayback: (steps, { pageId, notebookId, language = 'en-IN' } = {}) => {
    if (advanceTimeoutId) {
      clearTimeout(advanceTimeoutId);
      advanceTimeoutId = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (!steps || steps.length === 0) {
      set({
        stepsQueue: [],
        currentStepIndex: -1,
        playbackState: 'idle',
        activePageId: pageId || null,
        notebookId: notebookId || null,
        stepStatusMap: {},
        isWritingStep: false,
        isSpeakingStep: false,
        isPaused: false,
        pausedReason: null,
      });
      return;
    }

    const initialStatusMap = {};
    steps.forEach((step, idx) => {
      const num = step.step_number || idx + 1;
      initialStatusMap[num] = idx === 0 ? 'writing' : 'pending';
    });

    set({
      stepsQueue: steps,
      currentStepIndex: 0,
      playbackState: 'playing',
      activePageId: pageId || null,
      notebookId: notebookId || null,
      language: language || 'en-IN',
      isWritingStep: true,
      isSpeakingStep: true,
      isPaused: false,
      pausedReason: null,
      stepStatusMap: initialStatusMap,
    });

    // Start speaking the first step
    const firstStep = steps[0];
    playStepAudio(
      firstStep,
      language,
      () => set({ isSpeakingStep: true }),
      () => get().completeStepTTS(firstStep.step_number || 1),
    );
  },

  /**
   * Pause playback (e.g. when student clicks Ask Why or interrupts).
   */
  pausePlayback: (reason = 'Student requested clarification') => {
    if (advanceTimeoutId) {
      clearTimeout(advanceTimeoutId);
      advanceTimeoutId = null;
    }
    if (activeAudioElement) {
      try { activeAudioElement.pause(); } catch {}
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
    set({
      isPaused: true,
      playbackState: 'paused',
      pausedReason: reason,
    });
  },

  /**
   * Resume playback from the paused state.
   */
  resumePlayback: () => {
    if (activeAudioElement) {
      try { activeAudioElement.play(); } catch {}
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
    set({
      isPaused: false,
      playbackState: 'playing',
      pausedReason: null,
    });

    const { isWritingStep, isSpeakingStep } = get();
    // If both finished while paused, advance immediately
    if (!isWritingStep && !isSpeakingStep) {
      get().advanceStep();
    }
  },

  /**
   * Stop and reset playback to idle.
   */
  stopPlayback: () => {
    if (advanceTimeoutId) {
      clearTimeout(advanceTimeoutId);
      advanceTimeoutId = null;
    }
    if (activeAudioElement) {
      try {
        activeAudioElement.pause();
        activeAudioElement = null;
      } catch {}
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    set({
      playbackState: 'idle',
      currentStepIndex: -1,
      isWritingStep: false,
      isSpeakingStep: false,
      isPaused: false,
      pausedReason: null,
    });
  },

  /**
   * Called by GhostPenStep when its left-to-right reveal animation completes.
   */
  completeStepWriting: (stepNumber) => {
    const { isPaused, isSpeakingStep } = get();
    set({ isWritingStep: false });

    // If audio is also done (or not speaking) and not paused, advance to next step
    if (!isSpeakingStep && !isPaused) {
      get().advanceStep();
    }
  },

  /**
   * Called when TTS audio finishes for the current step.
   */
  completeStepTTS: (stepNumber) => {
    const { isPaused, isWritingStep } = get();
    set({ isSpeakingStep: false });

    // If writing is also done and not paused, advance to next step
    if (!isWritingStep && !isPaused) {
      get().advanceStep();
    }
  },

  /**
   * Advances from currentStepIndex to currentStepIndex + 1 after 400ms pause.
   */
  advanceStep: () => {
    const {
      currentStepIndex,
      stepsQueue,
      stepStatusMap,
      notebookId,
      activePageId,
      language,
    } = get();

    if (currentStepIndex < 0 || currentStepIndex >= stepsQueue.length) {
      set({ playbackState: 'completed', currentStepIndex: -1 });
      return;
    }

    const finishedStep = stepsQueue[currentStepIndex];
    const finishedNum = finishedStep.step_number || currentStepIndex + 1;

    // Mark current step completed in local map
    const updatedStatusMap = {
      ...stepStatusMap,
      [finishedNum]: 'completed',
    };

    // Save completed step to RTDB if store action is available
    if (notebookId && activePageId) {
      try {
        const notebookStore = useNotebookStore.getState();
        if (typeof notebookStore.appendAiStep === 'function') {
          notebookStore.appendAiStep(notebookId, activePageId, finishedStep).catch((err) => {
            console.warn('[appendAiStep RTDB background sync]', err);
          });
        }
      } catch (err) {
        console.warn('[Sync AI step error]', err);
      }
    }

    // Wait 400ms before starting the next step
    if (advanceTimeoutId) clearTimeout(advanceTimeoutId);
    advanceTimeoutId = setTimeout(() => {
      advanceTimeoutId = null;
      const nextIndex = currentStepIndex + 1;

      if (nextIndex >= stepsQueue.length) {
        set({
          currentStepIndex: -1,
          playbackState: 'completed',
          isWritingStep: false,
          isSpeakingStep: false,
          stepStatusMap: updatedStatusMap,
        });
        return;
      }

      const nextStep = stepsQueue[nextIndex];
      const nextNum = nextStep.step_number || nextIndex + 1;
      updatedStatusMap[nextNum] = 'writing';

      set({
        currentStepIndex: nextIndex,
        stepStatusMap: updatedStatusMap,
        isWritingStep: true,
        isSpeakingStep: true,
      });

      // Speak next step
      playStepAudio(
        nextStep,
        language,
        () => set({ isSpeakingStep: true }),
        () => get().completeStepTTS(nextNum),
      );
    }, 400);

    set({ stepStatusMap: updatedStatusMap });
  },

  /**
   * Interrupt the Ghost Pen mid-solution to ask for clarification.
   */
  interruptAndAskWhy: (step) => {
    get().pausePlayback('Student clicked Ask Why');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('claire:ask_why', {
          detail: {
            step,
            currentStepIndex: get().currentStepIndex,
            pageId: get().activePageId,
            notebookId: get().notebookId,
          },
        }),
      );
    }
  },
}));
