import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

const GlobalDoors = () => {
  const [doorState, setDoorState] = useState('hidden'); // hidden | shutting | shut | opening | buildup
  
  useEffect(() => {
    const handleShut = () => setDoorState('shutting');
    const handleOpen = () => setDoorState('buildup');
    const handleHidden = () => setDoorState('hidden');
    
    window.addEventListener('door-shut', handleShut);
    window.addEventListener('door-open', handleOpen);
    window.addEventListener('door-hide', handleHidden);
    
    return () => {
      window.removeEventListener('door-shut', handleShut);
      window.removeEventListener('door-open', handleOpen);
      window.removeEventListener('door-hide', handleHidden);
    };
  }, []);

  useEffect(() => {
    if (doorState === 'shutting') {
      // After they swing shut, hold state
      setTimeout(() => setDoorState('shut'), 1500);
    } else if (doorState === 'buildup') {
      setTimeout(() => setDoorState('opening'), 600);
    } else if (doorState === 'opening') {
      setTimeout(() => setDoorState('hidden'), 2000);
    }
  }, [doorState]);

  if (doorState === 'hidden') return null;

  return (
    <div className={`fixed inset-0 z-[9999] pointer-events-none flex door-container ${doorState === 'opening' ? 'door-zoom-in' : ''} ${doorState === 'buildup' ? 'doors-glow-active' : ''}`}>
      <div className="door-glow-seam"></div>
      <div className={`screen-flash ${doorState === 'opening' ? 'flash-active' : ''}`}></div>

      <div className={`fixed inset-0 pointer-events-none flex ${doorState === 'opening' || doorState === 'hidden' ? 'door-open' : ''} ${doorState === 'shutting' || doorState === 'shut' || doorState === 'buildup' ? 'door-shut' : 'door-open'}`}>
        <div className="w-1/2 h-full bg-slate-950 border-r-4 border-yellow-600 door-panel left-door flex items-center justify-end pr-4">
           <div className="text-yellow-600 opacity-50"><Sparkles className="w-12 h-12" /></div>
        </div>
        <div className="w-1/2 h-full bg-slate-950 border-l-4 border-yellow-600 door-panel right-door flex items-center justify-start pl-4">
           <div className="text-yellow-600 opacity-50"><Sparkles className="w-12 h-12" /></div>
        </div>
      </div>
    </div>
  );
};

export default GlobalDoors;
