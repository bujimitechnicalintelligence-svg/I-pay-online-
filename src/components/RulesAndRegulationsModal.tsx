import React, { useState } from 'react';
import { Shield, BookOpen, Video, ShoppingBag, MessageSquare, Check, X, ArrowRight, Lock } from 'lucide-react';

interface RulesAndRegulationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export const RulesAndRegulationsModal: React.FC<RulesAndRegulationsModalProps> = ({
  isOpen,
  onClose,
  onAccept
}) => {
  const [agreed, setAgreed] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-emerald-100 flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">I-pay-online Rules & Regulations</h2>
              <p className="text-xs text-gray-500">Terms of service, community guidelines & platform ethics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
            aria-label="Close rules"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Long Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-gray-600 leading-relaxed">
          
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950">
            <p className="font-semibold text-emerald-900 mb-1">
              Welcome to the I-pay-online Ecosystem
            </p>
            <p className="text-xs text-emerald-800">
              I-pay-online is a multi-service platform combining 24-Hour Short Video Clips with offline caching, an Author Marketplace, Product Sales, and Real-Time Chats. Before completing your registration, you must review and accept our rules and policies.
            </p>
          </div>

          {/* Section 1: Short Videos */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-gray-900 font-semibold">
              <Video className="w-4 h-4 text-emerald-600" />
              <span>1. Short Video Clips & 24-Hour Lifecycle Regulations</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-gray-600 text-xs">
              <li><strong>24-Hour Expiration Rule:</strong> All posted reels automatically disappear from the app and database after 24 hours unless a user chooses to cache them in their device storage.</li>
              <li><strong>Offline Watching & Low Bandwidth:</strong> Users can cache videos to watch offline without using bandwidth. You can uncache anytime to free device storage.</li>
              <li><strong>Safety & Respect:</strong> Content containing harassment, hate speech, dangerous stunts, explicit adult material, or defamatory statements is strictly prohibited.</li>
              <li><strong>Originality & Algorithmic Integrity:</strong> Creators must own distribution rights. Manipulating views or likes through bots leads to immediate suspension.</li>
            </ul>
          </div>

          {/* Section 2: Author Market */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-gray-900 font-semibold">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <span>2. Author & Literary Market Regulations</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-gray-600 text-xs">
              <li><strong>Intellectual Property:</strong> Authors must guarantee that published literary works, poetry, or educational manuscripts are genuine intellectual property. Plagiarism is prohibited.</li>
              <li><strong>Fair Pricing & Royalties:</strong> All prices listed in Nigerian Naira (₦) or foreign currency must be transparent with zero hidden fees. Author royalties are disbursed securely.</li>
              <li><strong>Reader Protection:</strong> Digital previews and synopses must accurately reflect the published book. Fraudulent sales will result in full refunds to buyers.</li>
            </ul>
          </div>

          {/* Section 3: Product Sales */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-gray-900 font-semibold">
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              <span>3. Product Sales & E-Commerce Regulations</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-gray-600 text-xs">
              <li><strong>Authentic Merchandise:</strong> Sellers must only offer genuine, working products (including mobile handsets, earpods, electronics, fashion, and accessories). Counterfeits are banned.</li>
              <li><strong>Order Fulfillment & Logistics:</strong> Merchants are bound to deliver items within the stated timeframe across Nigerian States and LGAs with verified tracking.</li>
              <li><strong>Consumer Rights:</strong> Buyers are entitled to a mandatory 7-day return policy for defective products or misdescribed items.</li>
            </ul>
          </div>

          {/* Section 4: Chats & Messaging */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-gray-900 font-semibold">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <span>4. Chats & Communication Regulations</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-gray-600 text-xs">
              <li><strong>Privacy & Security:</strong> Chats between users, authors, and merchants are encrypted. Sharing unauthorized private numbers, passwords, or personal credentials is prohibited.</li>
              <li><strong>Anti-Spam & Zero Harassment:</strong> Unsolicited promotional spam, scam proposals, or hostile behavior in direct messaging will trigger immediate restriction.</li>
              <li><strong>Professional Commerce Interactions:</strong> Dealings regarding products and book orders should be conducted with mutual respect.</li>
            </ul>
          </div>

          {/* Section 5: Account & Password Security */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-gray-900 font-semibold">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>5. Account Governance & Security Rules</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-gray-600 text-xs">
              <li><strong>Single Provider Verification:</strong> A user can only continue with a Google, iPhone (Apple), or Microsoft account that is not already registered in the I-pay-online database.</li>
              <li><strong>Password Complexity:</strong> Passwords must be at least 8 characters long, containing a strong mix of letters, numbers, and special symbols.</li>
              <li><strong>5-Attempt Security Lockout:</strong> Any account with 5 consecutive incorrect password entries will be locked for 12 hours for security, unless verified through the Forget Password procedure.</li>
              <li><strong>Persistent Session:</strong> The system remembers your login session so you remain connected across app launches until you explicitly choose to log out.</li>
            </ul>
          </div>

        </div>

        {/* Footer with Checkbox and Action */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <label className="flex items-center space-x-3 cursor-pointer select-none text-xs text-gray-700">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
            />
            <span className="font-medium">
              I have read, understood, and accept all Super App Rules & Regulations
            </span>
          </label>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="w-1/2 sm:w-auto px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              onClick={onAccept}
              disabled={!agreed}
              className={`w-1/2 sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition shadow-sm ${
                agreed
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-emerald-200'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <span>Accept and Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
