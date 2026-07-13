import { useEffect, useMemo, useState } from 'react';
import { Activity, Radar, Shield, ChevronRight } from 'lucide-react';

const INTRO_STORAGE_KEY = 'netsentinel-launch-intro-seen';
const INTRO_STEPS = [
  {
    icon: Radar,
    label: 'Observe',
    title: 'Centralise les signaux reseau et systeme',
    description: 'NetSentinel agrege logs, events, telemetrie et etat agent dans une meme console SOC.',
  },
  {
    icon: Activity,
    label: 'Detect',
    title: 'Repere les anomalies et evenements critiques',
    description: 'Le moteur de detection met en avant les flux suspects, incidents et ecarts de posture.',
  },
  {
    icon: Shield,
    label: 'Respond',
    title: 'Cadre l investigation et le deploiement des agents',
    description: 'L application relie assets, enrollement agent, stockage Elastic et supervision continue.',
  },
];

export function LaunchIntro() {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const alreadySeen = window.localStorage.getItem(INTRO_STORAGE_KEY) === 'true';
    if (!alreadySeen) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible || closing) return undefined;

    const startedAt = Date.now();
    const totalDuration = 5400;
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(elapsed / totalDuration, 1);
      setProgress(ratio * 100);
      setActiveStep(Math.min(Math.floor(ratio * INTRO_STEPS.length), INTRO_STEPS.length - 1));
      if (ratio >= 1) {
        handleClose();
      }
    }, 80);

    return () => window.clearInterval(tick);
  }, [visible, closing]);

  const currentStep = useMemo(() => INTRO_STEPS[activeStep], [activeStep]);

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(INTRO_STORAGE_KEY, 'true');
    }
    window.setTimeout(() => {
      setVisible(false);
    }, 420);
  };

  if (!visible) return null;

  const CurrentIcon = currentStep.icon;

  return (
    <div className={`launch-intro ${closing ? 'launch-intro--closing' : ''}`}>
      <div className="launch-intro__backdrop topo-pattern" />
      <div className="launch-intro__grid cyber-grid" />

      <div className="launch-intro__shell">
        <div className="launch-intro__brand animate-slide-up">
          <div className="launch-intro__mark glow-teal">
            <Shield className="h-7 w-7" />
          </div>
          <div>
            <p className="launch-intro__eyebrow">NetSentinel AI</p>
            <h1 className="launch-intro__title">Cyber defense orchestration for your SOC.</h1>
          </div>
        </div>

        <div className="launch-intro__panel glass-panel noise-overlay animate-scale-in">
          <div className="launch-intro__status">
            <span className="launch-intro__status-dot" />
            <span>Initialisation de la plateforme</span>
          </div>

          <div className="launch-intro__hero">
            <div className="launch-intro__copy">
              <div className="launch-intro__step-tag">{currentStep.label}</div>
              <h2>{currentStep.title}</h2>
              <p>{currentStep.description}</p>
            </div>

            <div className="launch-intro__signal">
              <div className="launch-intro__signal-core">
                <CurrentIcon className="h-10 w-10" />
              </div>
              <div className="launch-intro__ring launch-intro__ring--one" />
              <div className="launch-intro__ring launch-intro__ring--two" />
              <div className="launch-intro__ring launch-intro__ring--three" />
            </div>
          </div>

          <div className="launch-intro__cards">
            {INTRO_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={step.label}
                  className={`launch-intro__card ${index === activeStep ? 'is-active' : ''}`}
                >
                  <StepIcon className="h-4 w-4" />
                  <div>
                    <strong>{step.label}</strong>
                    <span>{step.title}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="launch-intro__footer">
            <div className="launch-intro__progress">
              <div className="launch-intro__progress-bar" style={{ width: `${progress}%` }} />
            </div>

            <button type="button" className="launch-intro__cta" onClick={handleClose}>
              Entrer dans l application
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LaunchIntro;
