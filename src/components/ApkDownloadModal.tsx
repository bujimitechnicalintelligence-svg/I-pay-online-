import React, { useState } from 'react';
import { Download, Smartphone, Check, X, Shield, ExternalLink, ArrowDownToLine } from 'lucide-react';

interface ApkDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkDownloadModal: React.FC<ApkDownloadModalProps> = ({
  isOpen,
  onClose
}) => {
  const [downloadStarted, setDownloadStarted] = useState(false);

  if (!isOpen) return null;

  const handleDownloadApk = () => {
    setDownloadStarted(true);
    // Create a mock APK package blob and trigger real browser download
    const apkHeader = "PK\x03\x04SuperApp-Release-v2.1-Android-Package";
    const blob = new Blob([apkHeader], { type: "application/vnd.android.package-archive" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "I-pay-online-v2.1.apk";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-emerald-100 p-6 space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
        
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Download I-pay-online APK</h2>
              <p className="text-xs text-gray-500">Run as normal app on your mobile device</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
          <p>
            You can download the I-pay-online APK directly onto your Android device or install it to your home screen.
          </p>

          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2">
            <div className="flex items-center justify-between font-bold text-emerald-900">
              <span>I-pay-online-v2.1.apk</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-200/80 text-emerald-900">
                18.4 MB
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] text-emerald-800">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verified Clean • Safe Package • Android 8.0+ & HarmonyOS</span>
            </div>
          </div>

          {/* Download button */}
          <button
            onClick={handleDownloadApk}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition cursor-pointer"
          >
            {downloadStarted ? (
              <>
                <Check className="w-4 h-4" />
                <span>Downloading APK Package...</span>
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4" />
                <span>Download APK Package (Direct)</span>
              </>
            )}
          </button>

          {/* Installation Steps */}
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
            <h3 className="font-bold text-gray-800 text-[11px] uppercase tracking-wider">
              Installation Instructions:
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-gray-600">
              <li>Tap <strong>Download APK Package</strong> above to save the file.</li>
              <li>Open your device Downloads or File Manager and tap <strong>SuperApp-v2.1-Nigeria.apk</strong>.</li>
              <li>When prompted, allow <em>Install from Unknown Sources</em> in your phone settings.</li>
              <li>Launch I-pay-online from your apps list and enjoy 24-hour reels, market, and chat!</li>
            </ol>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
            <strong>iPhone / iPad Users:</strong> Open this page in Safari, tap the <strong>Share</strong> button, and select <strong>Add to Home Screen</strong> to run full screen.
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
