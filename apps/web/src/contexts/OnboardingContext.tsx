'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type OnboardingStep = 
  | 'opportunities'
  | 'thesis'
  | 'decision'
  | 'simulate'
  | 'paper'
  | 'review'
  | 'complete';

export interface OnboardingState {
  isNewUser: boolean;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  isGuidedMode: boolean;
  hasSeenOnboarding: boolean;
}

interface OnboardingContextType {
  state: OnboardingState;
  startGuidedMode: () => void;
  completeStep: (step: OnboardingStep) => void;
  skipOnboarding: () => void;
  resetOnboarding: () => void;
  isStepComplete: (step: OnboardingStep) => boolean;
  getNextStep: () => OnboardingStep | null;
  getStepNumber: (step: OnboardingStep) => number;
  totalSteps: number;
}

const STEPS_ORDER: OnboardingStep[] = [
  'opportunities',
  'thesis',
  'decision',
  'simulate',
  'paper',
  'review',
];

const STORAGE_KEY = 'nova_onboarding_state';

const defaultState: OnboardingState = {
  isNewUser: true,
  currentStep: 'opportunities',
  completedSteps: [],
  isGuidedMode: false,
  hasSeenOnboarding: false,
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setState(parsed);
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    setIsLoaded(true);
  }, []);

  // Save state to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        // Ignore localStorage errors
      }
    }
  }, [state, isLoaded]);

  const startGuidedMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isGuidedMode: true,
      hasSeenOnboarding: true,
      currentStep: prev.completedSteps.length > 0 
        ? STEPS_ORDER[Math.min(prev.completedSteps.length, STEPS_ORDER.length - 1)]
        : 'opportunities',
    }));
  }, []);

  const completeStep = useCallback((step: OnboardingStep) => {
    setState((prev) => {
      const completedSteps = prev.completedSteps.includes(step)
        ? prev.completedSteps
        : [...prev.completedSteps, step];
      
      const stepIndex = STEPS_ORDER.indexOf(step);
      const nextStep = stepIndex < STEPS_ORDER.length - 1 
        ? STEPS_ORDER[stepIndex + 1] 
        : 'complete';
      
      const allComplete = completedSteps.length >= STEPS_ORDER.length;
      
      return {
        ...prev,
        completedSteps,
        currentStep: nextStep,
        isNewUser: !allComplete,
        isGuidedMode: allComplete ? false : prev.isGuidedMode,
      };
    });
  }, []);

  const skipOnboarding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isGuidedMode: false,
      hasSeenOnboarding: true,
    }));
  }, []);

  const resetOnboarding = useCallback(() => {
    setState(defaultState);
  }, []);

  const isStepComplete = useCallback((step: OnboardingStep) => {
    return state.completedSteps.includes(step);
  }, [state.completedSteps]);

  const getNextStep = useCallback((): OnboardingStep | null => {
    for (const step of STEPS_ORDER) {
      if (!state.completedSteps.includes(step)) {
        return step;
      }
    }
    return null;
  }, [state.completedSteps]);

  const getStepNumber = useCallback((step: OnboardingStep): number => {
    return STEPS_ORDER.indexOf(step) + 1;
  }, []);

  const value: OnboardingContextType = {
    state,
    startGuidedMode,
    completeStep,
    skipOnboarding,
    resetOnboarding,
    isStepComplete,
    getNextStep,
    getStepNumber,
    totalSteps: STEPS_ORDER.length,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

export const STEP_INFO: Record<OnboardingStep, { title: string; description: string; icon: string; href: string }> = {
  opportunities: {
    title: "Today's Opportunities",
    description: 'See ranked opportunities from AI analysis',
    icon: '🎯',
    href: '/dashboard/screener',
  },
  thesis: {
    title: 'Create Thesis',
    description: 'Generate a trade thesis with entry/exit points',
    icon: '💡',
    href: '/dashboard/thesis',
  },
  decision: {
    title: 'Decision Card',
    description: 'Create a decision artifact with confidence',
    icon: '🎴',
    href: '/dashboard/decision-cards',
  },
  simulate: {
    title: 'Run Simulation',
    description: 'Test your strategy with Monte Carlo analysis',
    icon: '🎲',
    href: '/dashboard/simulator',
  },
  paper: {
    title: 'Paper Execute',
    description: 'Execute with paper trading to test risk-free',
    icon: '📄',
    href: '/dashboard/trading',
  },
  review: {
    title: 'Review Progress',
    description: 'Track your decisions and calibration',
    icon: '📊',
    href: '/dashboard/review',
  },
  complete: {
    title: 'Loop Complete!',
    description: 'You completed the full money loop',
    icon: '🎉',
    href: '/dashboard',
  },
};
