import React, { useState, useRef } from 'react';
import { Plus, Upload, X, Check, Video, AlertCircle, Camera, Loader2 } from 'lucide-react';
import { UserAccount } from '../types';
import { saveNewVideo } from '../utils/videoStorage';
import { storeMediaBlob, dispatchNotification } from '../utils/appDatabase';
import { publishCloudVideoReel } from '../utils/cloudSync';

interface UploadReelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  onVideoUploaded: () => void;
}

// Helper to read File as Base64 Data URL reliably
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export const UploadReelModal: React.FC<UploadReelModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onVideoUploaded
}) => {
  const [videoTitle, setVideoTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('Processing...');
  const [videoBase64, setVideoBase64] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle Video file selection with strict 1-minute limit (no pass if > 60s)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDurationError(null);
    if (!e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    
    // Check if it is a video file
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|webm|m4v|3gp|avi|mkv)$/i)) {
      setDurationError('Please select or capture a valid video file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (captureInputRef.current) captureInputRef.current.value = '';
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Verifying video length (max 1 min)...');

    const tempUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = tempUrl;

    tempVideo.onloadedmetadata = async () => {
      const duration = tempVideo.duration;

      // RULE: Videos must not exceed 1 minute (60 seconds)
      if (duration > 60) {
        const mins = Math.floor(duration / 60);
        const secs = Math.floor(duration % 60);
        setDurationError(
          `Video exceeds 1-minute limit: Selected video is ${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}. Videos must be 1 minute or less.`
        );
        setSelectedFile(null);
        setPreviewUrl(null);
        setVideoBlobUrl(null);
        setMediaId(null);
        setVideoDuration(null);
        setIsProcessing(false);
        URL.revokeObjectURL(tempUrl);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (captureInputRef.current) captureInputRef.current.value = '';
        return;
      }

      // Passed 1-minute limit
      setVideoDuration(Math.round(duration));
      setSelectedFile(file);

      if (!videoTitle) {
        setVideoTitle(file.name ? file.name.replace(/\.[^/.]+$/, '') : `Video by ${currentUser.displayName}`);
      }

      // Store in device storage for instant playback
      try {
        const newMediaId = 'reel_vid_' + Date.now();
        const storedBlobUrl = await storeMediaBlob(newMediaId, file);
        setMediaId(newMediaId);
        setVideoBlobUrl(storedBlobUrl);

        // Read Base64 Data URL for cross-device sync
        readFileAsDataUrl(file).then((b64) => {
          if (b64) setVideoBase64(b64);
        });

        // Generate video thumbnail
        tempVideo.currentTime = Math.min(1.0, duration / 2);
        tempVideo.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 480;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
              const thumb = canvas.toDataURL('image/jpeg', 0.85);
              setPreviewUrl(thumb);
            }
          } catch {
            setPreviewUrl(storedBlobUrl);
          }
          setIsProcessing(false);
        };
      } catch {
        setVideoBlobUrl(tempUrl);
        setPreviewUrl(tempUrl);
        setIsProcessing(false);
      }
    };

    tempVideo.onerror = () => {
      setDurationError('Could not read video format. Please choose an MP4, WebM, or MOV video.');
      setIsProcessing(false);
      URL.revokeObjectURL(tempUrl);
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoTitle.trim()) {
      setDurationError('Please enter a title for your video.');
      return;
    }
    if (!selectedFile && !mediaId) {
      setDurationError('Please select or capture a video file (1 minute or less).');
      return;
    }
    if (videoDuration && videoDuration > 60) {
      setDurationError('Cannot post: Video exceeds 1-minute maximum limit.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Saving video in app...');

    let base64ToUpload = videoBase64;
    if (!base64ToUpload && selectedFile) {
      setProcessingStatus('Optimizing video for all devices...');
      base64ToUpload = await readFileAsDataUrl(selectedFile);
    }

    // Save video in local app database immediately for 0ms playback on this phone
    const saved = saveNewVideo({
      title: videoTitle.trim(),
      creator: currentUser.displayName,
      creatorAvatar: currentUser.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.displayName)}`,
      thumbnailUrl: previewUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
      videoUrl: videoBlobUrl || undefined,
      mediaId: mediaId || undefined,
      durationSeconds: videoDuration || 30,
      isLocalDbVideo: true,
      soundTitle: 'Original Audio - ' + currentUser.displayName,
      tags: ['#IpayOnline', `#${currentUser.state || 'Community'}`, '#Reels']
    });

    setProcessingStatus('Publishing to database for all devices...');
    // Sync to database so any other device can download once and save in their app
    await publishCloudVideoReel(saved, base64ToUpload);

    dispatchNotification({
      title: 'Video Reel Published 🎥',
      body: `"${videoTitle.trim()}" is now published and active for 24 hours.`,
      type: 'post'
    });

    setIsProcessing(false);
    onVideoUploaded();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4 my-auto animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-gray-950">Publish 24-Hour Video</h3>
              <p className="text-[11px] text-gray-500">Visible for 24 hours • Max 1 minute</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {durationError && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 flex items-start space-x-2 text-xs text-red-700 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{durationError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Reel Title */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Video Title / Caption *
            </label>
            <input
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="What is this video about?"
              maxLength={120}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          {/* Device Video File / Camera Inputs */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Capture or Select Video (1 Minute or Less) *
            </label>
            
            {/* Native file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
              id="reel_file_input"
            />

            {/* Direct Camera Capture input */}
            <input
              ref={captureInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
              id="reel_capture_input"
            />

            {!selectedFile ? (
              <div className="grid grid-cols-2 gap-3">
                {/* Option 1: Record / Capture Camera */}
                <button
                  type="button"
                  onClick={() => captureInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl bg-emerald-50/50 hover:bg-emerald-50 transition cursor-pointer text-center space-y-2 group"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">
                      Record Video
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Capture with camera
                    </p>
                  </div>
                </button>

                {/* Option 2: Select from device gallery */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-gray-200 hover:border-emerald-500 rounded-2xl bg-gray-50 hover:bg-emerald-50/40 transition cursor-pointer text-center space-y-2 group"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-200 text-gray-700 group-hover:bg-emerald-100 group-hover:text-emerald-700 flex items-center justify-center transition">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">
                      Choose Video
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      From phone storage
                    </p>
                  </div>
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 truncate">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Video className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-bold text-gray-900 truncate">
                        {selectedFile.name || 'Captured Video'}
                      </p>
                      <p className="text-[11px] text-emerald-700 font-semibold">
                        {videoDuration !== null ? `${videoDuration}s` : 'Analyzing...'} • Within 1 min limit ✅
                      </p>
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setVideoBlobUrl(null);
                      setMediaId(null);
                      setVideoDuration(null);
                      setVideoBase64('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                      if (captureInputRef.current) captureInputRef.current.value = '';
                    }}
                    className="text-gray-400 hover:text-red-500 p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Video Preview thumbnail */}
                {previewUrl && (
                  <div className="w-full h-36 rounded-xl overflow-hidden bg-black relative">
                    <img 
                      src={previewUrl} 
                      alt="Video preview" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isProcessing || !selectedFile || (videoDuration !== null && videoDuration > 60)}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold text-xs tracking-wide shadow-md transition cursor-pointer flex items-center justify-center space-x-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{processingStatus}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Publish Video</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
