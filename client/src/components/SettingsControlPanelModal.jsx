import { useState, useEffect } from 'react';

const STORAGE_KEY = 'clairesolver_settings_v2';

export const DEFAULT_SETTINGS = {
  // General
  studentMode: 'jee_prep',
  preferredLanguage: 'hi-IN',
  autosaveInterval: '15',
  crtScanlines: true,
  // Voice & Speech
  sttEngine: 'gnani_prisma',
  ttsVoice: 'nalini_hinglish',
  speechRate: 1.0,
  speechPitch: 1.0,
  // Gatekeeper
  gatekeeperEngine: 'laya_engine',
  sympyVerification: true,
  maxSteps: 8,
  // Inks & Paper
  paperStyle: 'ruled',
  studentInk: '#0F172A',
  ghostPenInk: '#4338CA',
  strokeWidth: 3,
};

export function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('clairesolver:settings-updated', { detail: settings }));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export default function SettingsControlPanelModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('speech');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [appliedNotice, setAppliedNotice] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(loadSavedSettings());
      setAppliedNotice(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function handleChange(key, val) {
    setSettings((prev) => ({ ...prev, [key]: val }));
    setAppliedNotice(false);
  }

  function handleApply() {
    saveSettings(settings);
    setAppliedNotice(true);
    setTimeout(() => setAppliedNotice(false), 2000);
  }

  function handleSaveAndClose() {
    saveSettings(settings);
    onClose();
  }

  function testVoicePlayback() {
    setIsTestingVoice(true);
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
          settings.preferredLanguage.startsWith('hi')
            ? 'नमस्ते! ClaireSolver तैयार है। चलिए मैथ्स का सवाल हल करते हैं।'
            : 'Hello! ClaireSolver v2.5 is online and ready to solve homework steps.',
        );
        utterance.rate = settings.speechRate;
        utterance.pitch = settings.speechPitch;
        utterance.onend = () => setIsTestingVoice(false);
        utterance.onerror = () => setIsTestingVoice(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setTimeout(() => setIsTestingVoice(false), 1500);
      }
    } catch {
      setIsTestingVoice(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs select-none">
      <div className="w-full max-w-[720px] bg-[#D4D0C8] window-outer-chassis shadow-2xl flex flex-col font-mono text-[#0F172A]">
        {/* Cobalt Gradient Titlebar */}
        <div className="h-7 bg-gradient-to-r from-[#000080] via-[#0845A8] to-[#1084D0] px-2 flex items-center justify-between select-none text-white">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="text-xs">⚙</span>
            <span className="text-xs font-bold tracking-tight truncate drop-shadow">
              AI Tutor Properties &amp; System Config [ClaireSolver v2.5]
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              onClick={onClose}
              className="w-4 h-4 bg-[#D4D0C8] bevel-button text-[#0F172A] flex items-center justify-center text-[10px] font-bold"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="px-2 pt-2 pb-0 flex items-end gap-1 border-b-2 border-white bg-[#D4D0C8]">
          {[
            { id: 'general', label: 'General', icon: '💻' },
            { id: 'speech', label: 'Speech & Voice', icon: '🎙' },
            { id: 'gatekeeper', label: 'Gatekeeper (Laya)', icon: '🛡' },
            { id: 'inks', label: 'Inks & Paper', icon: '✎' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 text-xs font-bold flex items-center gap-1.5 border-t-2 border-l-2 ${isActive
                    ? 'bg-[#D4D0C8] border-white border-r-2 border-r-[#808080] -mb-[2px] z-10 text-[#000080]'
                    : 'bg-[#B8B4AB] border-[#E2DFD8] border-r-2 border-r-[#808080] text-slate-700 hover:bg-[#C8C4BC]'
                  }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Property Sheet Dialog Body */}
        <div className="p-3 bg-[#D4D0C8] flex flex-col gap-3 min-h-[380px] max-h-[75vh] overflow-y-auto text-xs">
          {/* TAB 1: GENERAL */}
          {activeTab === 'general' && (
            <div className="space-y-3">
              <fieldset className="border-2 border-[#808080] p-2.5 pt-1.5 bg-[#D4D0C8]">
                <legend className="px-1 font-bold text-[#000080]">Student Curriculum Profile</legend>
                <div className="space-y-2 mt-1">
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Syllabus &amp; Exam Target:</label>
                    <select
                      value={settings.studentMode}
                      onChange={(e) => handleChange('studentMode', e.target.value)}
                      className="w-full bg-white text-[#0F172A] p-1 bevel-sunken-field text-xs font-mono"
                    >
                      <option value="high_school">CBSE / ICSE / State Board (Classes 9-10)</option>
                      <option value="jee_prep">JEE Main &amp; Advanced / NEET (Classes 11-12)</option>
                      <option value="undergrad">Undergrad Engineering (Calculus &amp; Linear Algebra)</option>
                      <option value="ap_calc">AP Calculus BC / International Baccalaureate</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Primary Tutor Language &amp; Dialect:</label>
                    <select
                      value={settings.preferredLanguage}
                      onChange={(e) => handleChange('preferredLanguage', e.target.value)}
                      className="w-full bg-white text-[#0F172A] p-1 bevel-sunken-field text-xs font-mono"
                    >
                      <option value="hi-IN">Hinglish / Hindi (India) [hi-IN]</option>
                      <option value="en-IN">Indian English [en-IN]</option>
                      <option value="gu-IN">Gujarati [gu-IN]</option>
                      <option value="ta-IN">Tamil [ta-IN]</option>
                      <option value="te-IN">Telugu [te-IN]</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              <fieldset className="border-2 border-[#808080] p-2.5 pt-1.5 bg-[#D4D0C8]">
                <legend className="px-1 font-bold text-[#000080]">Workspace Display &amp; Autosave</legend>
                <div className="space-y-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span>Stroke Autosave Interval:</span>
                    <select
                      value={settings.autosaveInterval}
                      onChange={(e) => handleChange('autosaveInterval', e.target.value)}
                      className="bg-white text-[#0F172A] p-1 bevel-sunken-field text-xs font-mono w-32"
                    >
                      <option value="5">Every 5 Seconds</option>
                      <option value="15">Every 15 Seconds</option>
                      <option value="30">Every 30 Seconds</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={settings.crtScanlines}
                      onChange={(e) => handleChange('crtScanlines', e.target.checked)}
                      className="win-checkbox"
                    />
                    <span className="font-bold">Render CRT Scanline Texture &amp; Bevel Aesthetics</span>
                  </label>
                </div>
              </fieldset>
            </div>
          )}

          {/* TAB 2: SPEECH & VOICE */}
          {activeTab === 'speech' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* STT Box */}
              <fieldset className="border-2 border-[#808080] p-2.5 pt-1.5 bg-[#D4D0C8]">
                <legend className="px-1 font-bold text-[#000080] flex items-center gap-1">
                  <span>🎙</span>
                  <span>Speech-to-Text (STT)</span>
                </legend>
                <div className="space-y-2 mt-1">
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Recognition Engine:</label>
                    <select
                      value={settings.sttEngine}
                      onChange={(e) => handleChange('sttEngine', e.target.value)}
                      className="w-full bg-white text-[#0F172A] p-1 bevel-sunken-field text-xs font-mono"
                    >
                      <option value="gnani_prisma">Gnani Prisma v2.5 [16kHz PCM]</option>
                      <option value="web_speech">Browser Web Speech API [Local Fallback]</option>
                    </select>
                  </div>

                  <div className="pt-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-700">Live Ingestion Level:</span>
                      <span className="text-[10px] font-bold text-[#008000]">-14 dB [ACTIVE]</span>
                    </div>
                    {/* Retro Segmented VU Meter */}
                    <div className="bevel-inset p-1 bg-[#12131A] flex items-center gap-1 h-5">
                      <span className="w-2 h-3 bg-[#39FF14] shadow-[0_0_2px_#39FF14]" />
                      <span className="w-2 h-3 bg-[#39FF14] shadow-[0_0_2px_#39FF14]" />
                      <span className="w-2 h-3 bg-[#39FF14] shadow-[0_0_2px_#39FF14]" />
                      <span className="w-2 h-3 bg-[#39FF14] shadow-[0_0_2px_#39FF14]" />
                      <span className="w-2 h-3 bg-[#39FF14] shadow-[0_0_2px_#39FF14]" />
                      <span className="w-2 h-3 bg-[#00F0FF] shadow-[0_0_2px_#00F0FF]" />
                      <span className="w-2 h-3 bg-[#00F0FF] shadow-[0_0_2px_#00F0FF]" />
                      <span className="w-2 h-3 bg-slate-700 opacity-40" />
                      <span className="w-2 h-3 bg-slate-700 opacity-40" />
                      <span className="w-2 h-3 bg-slate-700 opacity-40" />
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* TTS Box */}
              <fieldset className="border-2 border-[#808080] p-2.5 pt-1.5 bg-[#D4D0C8]">
                <legend className="px-1 font-bold text-[#000080] flex items-center gap-1">
                  <span>🔊</span>
                  <span>Text-to-Speech (TTS)</span>
                </legend>
                <div className="space-y-2 mt-1">
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Voice Model:</label>
                    <select
                      value={settings.ttsVoice}
                      onChange={(e) => handleChange('ttsVoice', e.target.value)}
                      className="w-full bg-white text-[#0F172A] p-1 bevel-sunken-field text-xs font-mono"
                    >
                      <option value="nalini_hinglish">Gnani Timbre [Nalini / Hinglish 24kHz]</option>
                      <option value="neerja_english">Gnani Timbre [Neerja / Indian English]</option>
                      <option value="local_synth">System Default TTS Voice</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center text-[11px]">
                      <span>Speech Speed:</span>
                      <span className="font-bold">{settings.speechRate}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.7"
                      max="1.4"
                      step="0.05"
                      value={settings.speechRate}
                      onChange={(e) => handleChange('speechRate', parseFloat(e.target.value))}
                      className="w-full accent-[#000080]"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={testVoicePlayback}
                      disabled={isTestingVoice}
                      className="bevel-button bg-[#D4D0C8] px-3 py-1 font-bold text-xs flex items-center justify-center gap-1.5 w-full hover:bg-slate-200"
                    >
                      <span>▶</span>
                      <span>{isTestingVoice ? 'Speaking…' : 'Test Audio Playback'}</span>
                    </button>
                  </div>
                </div>
              </fieldset>
            </div>
          )}

          {/* TAB 3: GATEKEEPER */}
          {activeTab === 'gatekeeper' && (
            <div className="space-y-3">
              <fieldset className="border-2 border-[#808080] p-2.5 pt-1.5 bg-[#D4D0C8]">
                <legend className="px-1 font-bold text-[#000080]">System 1 / System 2 Routing Engine</legend>
                <div className="space-y-2.5 mt-1">
                  <div>
                    <label className="block text-[11px] font-bold mb-0.5">Gatekeeper Classification Model:</label>
                    <select
                      value={settings.gatekeeperEngine}
                      onChange={(e) => handleChange('gatekeeperEngine', e.target.value)}
                      className="w-full bg-white text-[#0F172A] p-1 bevel-sunken-field text-xs font-mono"
                    >
                      <option value="laya_engine">Laya Engine [Fast Micro-Classifier &lt;200ms]</option>
                      <option value="local_heuristic">Local Heuristic Rule Gatekeeper [Zero Cost / Offline]</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={settings.sympyVerification}
                      onChange={(e) => handleChange('sympyVerification', e.target.checked)}
                      className="win-checkbox"
                    />
                    <span className="font-bold">Enable SymPy Algebraic Step Equivalence Verification</span>
                  </label>

                  <div className="bevel-inset bg-[#0d0e15] p-2 text-[#00F0FF] text-[11px] leading-relaxed">
                    <p className="text-slate-400 font-bold mb-0.5">&gt; ROUTING TOPOLOGY:</p>
                    <p>• System 1: Conversational / Clarifications → Direct fast voice cache (&lt;300ms)</p>
                    <p>• System 2: Mathematical Derivations → Multimodal Gemini 2.5 Flash + SymPy verification</p>
                  </div>
                </div>
              </fieldset>
            </div>
          )}

          {/* TAB 4: INKS & PAPER */}
          {activeTab === 'inks' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <fieldset className="border-2 border-[#808080] p-2.5 pt-1.5 bg-[#D4D0C8]">
                <legend className="px-1 font-bold text-[#000080]">Paper Rule Style</legend>
                <div className="space-y-2 mt-1">
                  {[
                    { id: 'ruled', label: 'Cyan-Lined Exercise Book (#b9d5f0)', preview: 'ruled-paper' },
                    { id: 'grid', label: 'Isometric Cyber Grid (#00F0FF)', preview: 'cyan-grid-paper' },
                    { id: 'blank', label: 'Clean White Parchment', preview: 'bg-white' },
                  ].map((style) => (
                    <label
                      key={style.id}
                      className={`flex items-center justify-between p-2 cursor-pointer border ${settings.paperStyle === style.id
                          ? 'border-[#000080] bg-blue-50/50 font-bold'
                          : 'border-slate-300 hover:bg-slate-100'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="paperStyle"
                          value={style.id}
                          checked={settings.paperStyle === style.id}
                          onChange={(e) => handleChange('paperStyle', e.target.value)}
                        />
                        <span>{style.label}</span>
                      </div>
                      <div className={`w-8 h-6 border border-slate-400 ${style.preview}`} />
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="border-2 border-[#808080] p-2.5 pt-1.5 bg-[#D4D0C8]">
                <legend className="px-1 font-bold text-[#000080]">Ink Palettes &amp; Pens</legend>
                <div className="space-y-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span>Student Pen Stroke Width:</span>
                    <select
                      value={settings.strokeWidth}
                      onChange={(e) => handleChange('strokeWidth', parseInt(e.target.value, 10))}
                      className="bg-white text-[#0F172A] p-1 bevel-sunken-field text-xs font-mono w-24"
                    >
                      <option value="2">2px (Fine)</option>
                      <option value="3">3px (Medium)</option>
                      <option value="5">5px (Broad)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Student Ink Tint:</span>
                    <input
                      type="color"
                      value={settings.studentInk}
                      onChange={(e) => handleChange('studentInk', e.target.value)}
                      className="w-10 h-6 cursor-pointer border border-[#808080]"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span>AI Ghost Pen Ink Tint:</span>
                    <input
                      type="color"
                      value={settings.ghostPenInk}
                      onChange={(e) => handleChange('ghostPenInk', e.target.value)}
                      className="w-10 h-6 cursor-pointer border border-[#808080]"
                    />
                  </div>
                </div>
              </fieldset>
            </div>
          )}
        </div>

        {/* Bottom Dialog Action Bar */}
        <div className="p-2 bg-[#D4D0C8] border-t border-[#808080] flex items-center justify-between">
          <div className="text-[11px] font-bold text-[#000080]">
            {appliedNotice ? '✓ Settings applied!' : 'CYBER_OS: CONFIG_OK'}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="bevel-button bg-[#000080] text-white px-4 py-1 text-xs font-bold hover:brightness-110"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bevel-button bg-[#D4D0C8] px-4 py-1 text-xs font-bold hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="bevel-button bg-[#D4D0C8] px-4 py-1 text-xs font-bold hover:bg-slate-200"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
