import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const PriceDriftBanner = ({ components, oldTotal, newTotal }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !components || components.length === 0) return null;

  const driftedComponents = components.filter(comp => {
    // Only check if it was previously saved (priceAtLastSave exists and > 0)
    // and if the live price differs from the saved price.
    if (comp.priceAtLastSave && comp.mpnId && comp.mpnId.price) {
      return Number(comp.priceAtLastSave) !== Number(comp.mpnId.price);
    }
    return false;
  });

  if (driftedComponents.length === 0) return null;

  return (
    <div className="mb-6 border border-amber-200 bg-amber-50 text-amber-900 shadow-sm relative rounded-lg p-4 flex items-start">
      <AlertTriangle className="h-5 w-5 text-amber-600 mr-3 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h5 className="text-amber-800 font-bold mb-2">Price Drift Detected</h5>
        <div className="text-amber-700 space-y-2 text-sm">
          <p>The following component prices have changed since this recipe was last saved:</p>
          <ul className="list-disc pl-5 space-y-1">
            {driftedComponents.map(comp => {
              const dateStr = comp.mpnId.priceUpdatedAt 
                ? new Date(comp.mpnId.priceUpdatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : 'recently';
              
              return (
                <li key={comp._id || comp.mpnId._id}>
                  Price for <strong>{comp.mpnId.mpnCode}</strong> ({comp.mpnId.vendorId?.name || 'Vendor'}) changed on {dateStr} — was ₹{comp.priceAtLastSave?.toFixed(2)}, now ₹{comp.mpnId.price?.toFixed(2)}.
                </li>
              );
            })}
          </ul>
          <div className="mt-3 font-semibold pt-2 border-t border-amber-200/50">
            Cost recalculated: total is now ₹{(newTotal || 0).toFixed(2)} (was ₹{(oldTotal || 0).toFixed(2)}).
          </div>
        </div>
      </div>
      <button 
        onClick={() => setDismissed(true)}
        className="text-amber-500 hover:text-amber-800 transition-colors ml-4"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default PriceDriftBanner;
