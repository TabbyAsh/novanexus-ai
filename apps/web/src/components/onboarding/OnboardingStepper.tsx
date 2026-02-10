'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboarding, STEP_INFO, OnboardingStep } from '@/contexts/OnboardingContext';

interface OnboardingStepperProps {
  showWelcome?: boolean;
  compact?: boolean;
}

export default function OnboardingStepper({ showWelcome = true, compact = false }: OnboardingStepperProps) {
  const { state, startGuidedMode, skipOnboarding, isStepComplete, getNextStep, totalSteps } = useOnboarding();
  const [isExpanded, setIsExpanded] = useState(!compact);

  const nextStep = getNextStep();
  const completedCount = state.completedSteps.length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  // Don't show if all steps complete
  if (completedCount >= totalSteps) {
    return null;
  }

  // Compact view for sidebar/header
  if (compact) {
    return (
      <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            <div>
              <p className="text-white font-medium text-sm">Getting Started</p>
              <p className="text-gray-400 text-xs">{completedCount}/{totalSteps} complete</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                className="h-full bg-gradient-to-r from-cyan-500 to-purple-500"
              />
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-cyan-400 hover:text-cyan-300 text-sm"
            >
              {isExpanded ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        
        <AnimatePresence>
          {isExpanded && nextStep && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 pt-4 border-t border-white/10"
            >
              <Link href={STEP_INFO[nextStep].href}>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{STEP_INFO[nextStep].icon}</span>
                    <div>
                      <p className="text-white text-sm font-medium">Next: {STEP_INFO[nextStep].title}</p>
                      <p className="text-gray-400 text-xs">{STEP_INFO[nextStep].description}</p>
                    </div>
                  </div>
                  <span className="text-cyan-400">→</span>
                </div>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full welcome view for dashboard
  if (showWelcome && !state.hasSeenOnboarding) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 border border-cyan-500/40 rounded-2xl p-8"
      >
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">NovaNexus</span>
          </h2>
          <p className="text-gray-300">
            Complete your first trading loop in under 3 minutes — no setup required.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {(['opportunities', 'thesis', 'decision', 'simulate', 'paper', 'review'] as OnboardingStep[]).map((step, i) => (
            <div
              key={step}
              className={`p-4 rounded-xl ${
                isStepComplete(step)
                  ? 'bg-green-500/20 border border-green-500/40'
                  : 'bg-white/5 border border-white/10'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{STEP_INFO[step].icon}</span>
                <span className="text-xs text-gray-400">Step {i + 1}</span>
              </div>
              <p className="text-white text-sm font-medium">{STEP_INFO[step].title}</p>
              {isStepComplete(step) && (
                <span className="text-green-400 text-xs">✓ Complete</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={startGuidedMode}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
          >
            Start Guided Run →
          </button>
          <button
            onClick={skipOnboarding}
            className="px-6 py-3 rounded-xl border border-white/20 text-gray-300 hover:bg-white/5 transition"
          >
            Explore on my own
          </button>
        </div>
      </motion.div>
    );
  }

  // Progress bar view for returning users
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">🚀</span>
          <div>
            <p className="text-white font-medium">Getting Started</p>
            <p className="text-gray-400 text-sm">{completedCount} of {totalSteps} steps complete</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!state.isGuidedMode && (
            <button
              onClick={startGuidedMode}
              className="text-cyan-400 hover:text-cyan-300 text-sm"
            >
              Start Guided Run
            </button>
          )}
          <button
            onClick={skipOnboarding}
            className="text-gray-500 hover:text-gray-400 text-sm"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5 }}
          className="h-full bg-gradient-to-r from-cyan-500 to-purple-500"
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {(['opportunities', 'thesis', 'decision', 'simulate', 'paper', 'review'] as OnboardingStep[]).map((step, i) => {
          const isComplete = isStepComplete(step);
          const isCurrent = step === nextStep;
          return (
            <Link key={step} href={STEP_INFO[step].href} className="flex-1">
              <div
                className={`p-2 rounded-lg text-center transition ${
                  isComplete
                    ? 'bg-green-500/20 border border-green-500/40'
                    : isCurrent
                    ? 'bg-cyan-500/20 border border-cyan-500/40'
                    : 'bg-white/5 border border-white/10 hover:bg-white/10'
                }`}
              >
                <span className="text-lg block">{STEP_INFO[step].icon}</span>
                <span className={`text-xs ${isComplete ? 'text-green-400' : isCurrent ? 'text-cyan-400' : 'text-gray-500'}`}>
                  {isComplete ? '✓' : i + 1}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Next step CTA */}
      {nextStep && state.isGuidedMode && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <Link href={STEP_INFO[nextStep].href}>
            <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 transition">
              <div className="flex items-center gap-3">
                <span className="text-xl">{STEP_INFO[nextStep].icon}</span>
                <div>
                  <p className="text-white font-medium">Next: {STEP_INFO[nextStep].title}</p>
                  <p className="text-gray-400 text-sm">{STEP_INFO[nextStep].description}</p>
                </div>
              </div>
              <span className="text-cyan-400 font-semibold">Go →</span>
            </div>
          </Link>
        </div>
      )}
    </motion.div>
  );
}

// Upgrade CTA component shown after completing the loop
export function UpgradeCTA({ visible = true }: { visible?: boolean }) {
  const { state } = useOnboarding();
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  // Show after completing at least 3 steps or the full loop
  const showUpgrade = state.completedSteps.length >= 3;
  if (!showUpgrade) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-green-500/20 via-emerald-500/20 to-cyan-500/20 border border-green-500/40 rounded-2xl p-6"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-green-500/20 rounded-xl">
            <span className="text-3xl">🚀</span>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-1">Ready to Trade Live?</h3>
            <p className="text-gray-300 mb-4">
              Connect your Alpaca account with one click to trade with real capital.
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/settings"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all"
              >
                Trade with My Account →
              </Link>
              <button
                onClick={() => setDismissed(true)}
                className="px-4 py-3 rounded-xl border border-white/20 text-gray-300 hover:bg-white/5 transition"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-500 hover:text-gray-400"
        >
          ✕
        </button>
      </div>

      {/* Pro benefits */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <p className="text-gray-400 text-sm mb-3">Pro unlocks:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: '🔗', text: 'Personal Broker' },
            { icon: '📊', text: 'Portfolio Analytics' },
            { icon: '📈', text: 'Deeper History' },
            { icon: '📤', text: 'Export Data' },
          ].map((item) => (
            <div key={item.text} className="flex items-center gap-2 text-gray-300 text-sm">
              <span>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
