'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X, FileText, Shield } from 'lucide-react';

interface DisclaimerProps {
  variant?: 'banner' | 'modal' | 'inline';
  onAccept?: () => void;
}

export function TradingDisclaimer({ variant = 'inline' }: DisclaimerProps) {
  if (variant === 'inline') {
    return (
      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <p className="text-xs text-amber-400/80">
          <strong>Risk Disclaimer:</strong> Trading involves substantial risk of loss. Past performance
          is not indicative of future results. This platform provides educational tools only and does
          not constitute financial advice. Always do your own research and consult a licensed financial
          advisor before making investment decisions.
        </p>
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-400/80">
            Trading involves risk. This platform is for educational purposes only. Not financial advice.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

interface ToSModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline?: () => void;
}

export function ToSModal({ isOpen, onAccept, onDecline }: ToSModalProps) {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [accepted, setAccepted] = useState(false);

  if (!isOpen) return null;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isBottom) setHasScrolled(true);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-gray-800 flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <FileText className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Terms of Service</h2>
            <p className="text-sm text-gray-400">Please review and accept to continue</p>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-5 text-sm text-gray-300 space-y-4"
          onScroll={handleScroll}
        >
          <h3 className="font-semibold text-white">1. Acceptance of Terms</h3>
          <p>
            By accessing and using Nova Enterprises ("the Platform"), you agree to be bound by these
            Terms of Service. If you do not agree to these terms, please do not use the Platform.
          </p>

          <h3 className="font-semibold text-white">2. Educational Purpose Only</h3>
          <p>
            The Platform provides educational tools and simulated trading environments. All information,
            analyses, and recommendations provided are for educational purposes only and do not
            constitute financial, investment, or trading advice.
          </p>

          <h3 className="font-semibold text-white">3. Risk Disclosure</h3>
          <p>
            Trading in financial markets involves substantial risk of loss. You should only trade with
            capital you can afford to lose. Past performance is not indicative of future results.
          </p>

          <h3 className="font-semibold text-white">4. No Guarantees</h3>
          <p>
            We make no guarantees regarding the accuracy, completeness, or reliability of any
            information, analysis, or AI-generated content on the Platform. Users are responsible for
            conducting their own research and due diligence.
          </p>

          <h3 className="font-semibold text-white">5. AI-Generated Content</h3>
          <p>
            The Platform uses artificial intelligence to generate trade theses and analyses. AI-generated
            content may contain errors or inaccuracies. Users should verify all information independently
            before making any trading decisions.
          </p>

          <h3 className="font-semibold text-white">6. User Responsibilities</h3>
          <p>
            Users are solely responsible for their trading decisions and any resulting gains or losses.
            Users agree to consult with qualified financial advisors before making investment decisions.
          </p>

          <h3 className="font-semibold text-white">7. Privacy</h3>
          <p>
            We collect and process personal data in accordance with our Privacy Policy. By using the
            Platform, you consent to such processing.
          </p>

          <h3 className="font-semibold text-white">8. Subscription and Billing</h3>
          <p>
            Paid subscriptions are billed in advance on a monthly or annual basis. Refunds are provided
            in accordance with our Refund Policy.
          </p>

          <h3 className="font-semibold text-white">9. Limitation of Liability</h3>
          <p>
            To the maximum extent permitted by law, Nova Enterprises shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages resulting from your use
            of or inability to use the Platform.
          </p>

          <h3 className="font-semibold text-white">10. Changes to Terms</h3>
          <p>
            We reserve the right to modify these Terms at any time. Continued use of the Platform after
            any changes constitutes acceptance of the new Terms.
          </p>

          <div className="pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500">Last updated: January 2025</p>
          </div>
        </div>

        <div className="p-5 border-t border-gray-800 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-300">
              I have read and agree to the Terms of Service and understand the risks involved in trading.
            </span>
          </label>

          <div className="flex gap-3">
            {onDecline && (
              <button
                onClick={onDecline}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
              >
                Decline
              </button>
            )}
            <button
              onClick={onAccept}
              disabled={!accepted || !hasScrolled}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition"
            >
              Accept & Continue
            </button>
          </div>

          {!hasScrolled && (
            <p className="text-xs text-gray-500 text-center">Please scroll to read the full terms</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function useToSAcceptance() {
  const [hasAccepted, setHasAccepted] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem('nova_tos_accepted');
    if (accepted === 'true') {
      setHasAccepted(true);
    } else {
      setHasAccepted(false);
      setShowModal(true);
    }
  }, []);

  const acceptToS = () => {
    localStorage.setItem('nova_tos_accepted', 'true');
    localStorage.setItem('nova_tos_accepted_at', new Date().toISOString());
    setHasAccepted(true);
    setShowModal(false);
  };

  return { hasAccepted, showModal, acceptToS, setShowModal };
}
