import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, Search, Plus, MessageSquare, Clock, 
  MapPin, Check, X, AlertCircle, Image as ImageIcon, Sparkles 
} from 'lucide-react';
import { UserAccount, ProductItem, ChatContact } from '../types';
import { 
  getActiveStoreProducts, 
  saveNewStoreProduct, 
  getTodayProductPostsCount,
  DAILY_PRODUCT_LIMIT
} from '../utils/appDatabase';
import { 
  subscribeToStoreProducts, 
  publishCloudStoreProduct,
  resetCloudStoreProducts 
} from '../utils/cloudSync';
import { compressImageToDataUrl } from '../utils/imageCompressor';

interface StoreViewProps {
  currentUser: UserAccount;
  onChatSeller?: (contact: ChatContact, initialMessage: string) => void;
}

export const StoreView: React.FC<StoreViewProps> = ({ 
  currentUser,
  onChatSeller
}) => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Upload Product Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productAmount, setProductAmount] = useState('');
  const [productPhotoUrl, setProductPhotoUrl] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load active products (auto-filters out items older than 1 month / 30 days) and subscribe to Firestore
  const loadProducts = () => {
    const list = getActiveStoreProducts();
    setProducts(list);
  };

  useEffect(() => {
    loadProducts();

    // Subscribe to products posted across other devices via Firestore
    const unsubscribe = subscribeToStoreProducts((cloudProducts) => {
      if (cloudProducts.length > 0) {
        setProducts(prev => {
          const map = new Map<string, ProductItem>();
          prev.forEach(p => map.set(p.id, p));
          cloudProducts.forEach(p => map.set(p.id, p));
          return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const todayPostsCount = getTodayProductPostsCount(currentUser.displayName);

  // Filter products by search
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sellerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.sellerUsername && p.sellerUsername.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
    p.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle Photo Selection from Device: Compresses to pure Base64 Data URL so it is stored directly in Firestore
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressImageToDataUrl(file, 800, 800, 0.8);
      setProductPhotoUrl(dataUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setProductPhotoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Product Submission (Rule: 3 products per day only)
  const handleSubmitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!productName.trim()) {
      setUploadError('Please enter a product name.');
      return;
    }
    if (!productDescription.trim()) {
      setUploadError('Please provide a short description.');
      return;
    }
    const amountNum = parseFloat(productAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setUploadError('Please enter a valid amount in Naira (₦).');
      return;
    }
    if (!productPhotoUrl) {
      setUploadError('Please upload or select a photo of your product.');
      return;
    }

    setIsSubmitting(true);

    const result = saveNewStoreProduct(
      {
        name: productName,
        description: productDescription,
        priceNgn: amountNum,
        image: productPhotoUrl
      },
      currentUser
    );

    setIsSubmitting(false);

    if (!result.success) {
      setUploadError(result.error || 'Failed to post product.');
      return;
    }

    // Publish to cloud Firestore so all other devices see it
    if (result.product) {
      publishCloudStoreProduct(result.product);
    }

    // Success
    setToastMessage(`"${productName}" is now live on the store! Valid for 30 days.`);
    setTimeout(() => setToastMessage(null), 4000);

    // Reset Form & Close Modal
    setProductName('');
    setProductDescription('');
    setProductAmount('');
    setProductPhotoUrl('');
    setShowUploadModal(false);
    loadProducts();
  };

  // Chat Seller Action (Replaces Buy Button as requested)
  const handleChatSeller = (prod: ProductItem) => {
    const contact: ChatContact = {
      id: prod.sellerId || 'seller_' + prod.sellerName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      name: prod.sellerName,
      username: prod.sellerUsername || `@${prod.sellerName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      avatar: prod.sellerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      lastMessage: `Inquiry on ${prod.name} (₦${prod.priceNgn.toLocaleString()})`,
      time: 'Just now',
      unreadCount: 0,
      online: true,
      state: prod.location.split(',')[1]?.trim() || 'Nigeria',
      lga: prod.location.split(',')[0]?.trim() || ''
    };

    const initialMsg = `Hello @${contact.username.replace('@', '')}, I saw your product "${prod.name}" listed for ₦${prod.priceNgn.toLocaleString()} on I-pay-online Store. I would like to buy it! Is it currently available?`;

    if (onChatSeller) {
      onChatSeller(contact, initialMsg);
    } else {
      setToastMessage(`Opening chat with seller ${prod.sellerName}...`);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Calculate days remaining until 1 month expiration
  const getDaysRemaining = (expiresAt: number) => {
    const msLeft = expiresAt - Date.now();
    const days = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return days;
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50 pb-24 p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-600 text-white text-xs font-semibold flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:bg-emerald-700 rounded-full">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Store Header & Plus Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-gray-200 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">I-pay-online Store</h2>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              Marketplace
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Browse products, chat sellers directly, or post up to {DAILY_PRODUCT_LIMIT} products per day (listings active for 1 month).
          </p>
        </div>

        {/* Action Button: Post Product */}
        <div className="flex items-center space-x-2 self-start sm:self-auto shrink-0">
          <button
            onClick={() => {
              setUploadError(null);
              setShowUploadModal(true);
            }}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Post Product</span>
            <span className="ml-1 text-[10px] bg-emerald-700/80 px-1.5 py-0.5 rounded-md font-mono">
              {todayPostsCount}/{DAILY_PRODUCT_LIMIT}
            </span>
          </button>
        </div>
      </div>

      {/* Search Bar & Daily Limit Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by name, description, seller, or city..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 shadow-2xs"
          />
        </div>

        {/* Posting Rule Indicator */}
        <div className="px-3 py-1.5 bg-white rounded-xl border border-gray-200 text-[11px] text-gray-600 flex items-center space-x-2 shrink-0 self-start sm:self-auto shadow-2xs">
          <Clock className="w-3.5 h-3.5 text-emerald-600" />
          <span>
            Today: <strong>{todayPostsCount}/{DAILY_PRODUCT_LIMIT} posted</strong> (Max {DAILY_PRODUCT_LIMIT} daily)
          </span>
        </div>

      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 space-y-3 shadow-2xs">
          <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="text-sm font-bold text-gray-800">No active products found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {searchQuery 
              ? `No products matching "${searchQuery}". Try another keyword.` 
              : 'Be the first to post a product on I-pay-online Store! Tap "+ Post Product" above.'}
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-emerald-700 transition"
          >
            Post a Product
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((prod) => {
            const daysLeft = getDaysRemaining(prod.expiresAt);
            const isMine = prod.sellerId === currentUser.id || prod.sellerName.toLowerCase() === currentUser.displayName.toLowerCase();

            return (
              <div 
                key={prod.id} 
                className="bg-white rounded-3xl overflow-hidden border border-gray-200 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Photo with expiration tag */}
                  <div className="relative h-48 sm:h-52 bg-emerald-950/5 overflow-hidden flex items-center justify-center">
                    {prod.image ? (
                      <img 
                        src={prod.image} 
                        alt={prod.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-emerald-800/50 space-y-1">
                        <ShoppingBag className="w-10 h-10" />
                        <span className="text-[10px] font-bold">Verified Product</span>
                      </div>
                    )}

                    {/* Expiration badge (Disappears after 1 month) */}
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold flex items-center space-x-1 shadow-sm">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>{daysLeft}d left (1mo rule)</span>
                    </div>

                    {isMine && (
                      <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold uppercase shadow-sm">
                        Your Post
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-2.5">
                    
                    <div>
                      <h3 className="font-bold text-sm text-gray-900 line-clamp-1 leading-snug">
                        {prod.name}
                      </h3>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {prod.description || 'Verified product available for immediate purchase on I-pay-online.'}
                      </p>
                    </div>

                    {/* Price in Naira */}
                    <div className="flex items-baseline space-x-2">
                      <span className="text-base sm:text-lg font-black text-emerald-700">
                        ₦{prod.priceNgn.toLocaleString()}
                      </span>
                      {prod.originalPriceNgn && (
                        <span className="text-xs text-gray-400 line-through">
                          ₦{prod.originalPriceNgn.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Seller details & Location */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                      <div className="flex items-center space-x-1.5 truncate">
                        <span className="font-semibold text-gray-900 truncate">
                          {prod.sellerName}
                        </span>
                        {prod.sellerUsername && (
                          <span className="text-emerald-700 font-mono text-[10px]">
                            {prod.sellerUsername}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1 text-gray-400 shrink-0 ml-1">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        <span className="truncate max-w-[100px]">{prod.location}</span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* ACTION: Chat Seller (Replaces Buy Button as requested) */}
                <div className="p-4 pt-0">
                  <button
                    onClick={() => handleChatSeller(prod)}
                    className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-200 hover:border-emerald-600 rounded-2xl text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer shadow-2xs group"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-700 group-hover:text-white transition" />
                    <span>Chat Seller to Buy</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* POST PRODUCT MODAL (Photo, Name, Description, Amount - Max 3/day) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl space-y-5 my-auto animate-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">Post a Product for Sale</h3>
                <p className="text-xs text-gray-500">
                  Listings are browsable by all users and stay active for 1 month.
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Daily limit banner */}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between">
              <span>Daily limit: <strong>3 products per day</strong></span>
              <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg">
                {todayPostsCount} / 3 posted today
              </span>
            </div>

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitProduct} className="space-y-4">
              
              {/* 1. Upload Photo */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  Product Photo (Upload from device or choose camera)
                </label>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />

                {productPhotoUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border border-gray-200 h-40 bg-black/5 flex items-center justify-center">
                    <img
                      src={productPhotoUrl}
                      alt="Selected preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setProductPhotoUrl('')}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-black"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="h-32 border-2 border-dashed border-gray-200 hover:border-emerald-500 rounded-2xl bg-gray-50 hover:bg-emerald-50/40 transition flex flex-col items-center justify-center space-y-2 cursor-pointer text-gray-500 hover:text-emerald-700"
                  >
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                    <span className="text-xs font-semibold">Tap to upload photo from your device</span>
                    <span className="text-[10px] text-gray-400">JPG, PNG, WebP supported</span>
                  </div>
                )}
              </div>

              {/* 2. Product Name */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700">
                  Product Name
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Wireless Noise-Cancelling Earpods"
                  className="w-full px-3.5 py-2.5 text-xs border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* 3. Description */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700">
                  Description
                </label>
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="State product condition, specifications, warranty, delivery details..."
                  rows={3}
                  className="w-full px-3.5 py-2 text-xs border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* 4. Amount in Naira */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700">
                  Amount / Price (₦ Naira)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">
                    ₦
                  </span>
                  <input
                    type="number"
                    min="100"
                    step="50"
                    value={productAmount}
                    onChange={(e) => setProductAmount(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full pl-8 pr-4 py-2.5 text-xs border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono font-semibold"
                    required
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="w-1/3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || todayPostsCount >= DAILY_PRODUCT_LIMIT}
                  className={`w-2/3 py-2.5 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer ${
                    todayPostsCount >= DAILY_PRODUCT_LIMIT
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isSubmitting ? 'Posting...' : 'Post'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
