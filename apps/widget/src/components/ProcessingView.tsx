import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import usePolling from '../hooks/usePolling';

const ProcessingView: React.FC = () => {
  const [progress, setProgress] = useState(0);
  const { userImage, jobId, tenantId } = useStore();
  
  // Initialize polling
  usePolling(tenantId!, jobId);

  // Realistic AI Timing Progress Simulator
  useEffect(() => {
    let active = true;
    
    const simulateProgress = () => {
      if (!active) return;
      
      setProgress((prev) => {
        if (prev >= 99) return 99; // Hold at 99% until polling returns success
        
        let increment = 0;
        let nextDelay = 500;
        
        if (prev < 45) {
          // Fast startup uploading files
          increment = Math.floor(Math.random() * 8) + 4;
          nextDelay = Math.floor(Math.random() * 300) + 200;
        } else if (prev < 75) {
          // AI rendering starts
          increment = Math.floor(Math.random() * 3) + 1;
          nextDelay = Math.floor(Math.random() * 600) + 400;
        } else if (prev < 92) {
          // Heavy styling pass
          increment = Math.random() > 0.3 ? 1 : 0;
          nextDelay = Math.floor(Math.random() * 1000) + 800;
        } else {
          // Finetuning compliment & background
          increment = Math.random() > 0.8 ? 1 : 0;
          nextDelay = Math.floor(Math.random() * 1500) + 1000;
        }
        
        setTimeout(simulateProgress, nextDelay);
        return Math.min(prev + increment, 99);
      });
    };

    // Trigger initial loop
    setTimeout(simulateProgress, 100);

    return () => {
      active = false;
    };
  }, []);

  // Compute text label dynamically based on progress
  let stepText = "Uploading your photo...";
  if (progress >= 35 && progress < 82) {
    stepText = "Generating your look...";
  } else if (progress >= 82) {
    stepText = "Adding finishing touches...";
  }

  return (
    <div className="tryon-flex tryon-flex-col tryon-items-center tryon-justify-center tryon-h-full tryon-p-6 tryon-text-center tryon-bg-slate-50/50">
      
      {/* Visual Image Scanning Card */}
      <div className="tryon-relative tryon-w-44 tryon-h-56 tryon-mb-6 tryon-rounded-2xl tryon-overflow-hidden tryon-shadow-lg tryon-border tryon-border-slate-100 tryon-bg-white tryon-glow-container">
        {userImage ? (
          <img
            src={userImage}
            className="tryon-w-full tryon-h-full tryon-object-cover tryon-transition-all tryon-duration-700 tryon-blur-[0.5px]"
            alt="Selfie"
          />
        ) : (
          <div className="tryon-w-full tryon-h-full tryon-bg-slate-100 tryon-flex tryon-items-center tryon-justify-center">
            <Sparkles className="tryon-w-8 tryon-h-8 tryon-text-slate-300 tryon-animate-pulse" />
          </div>
        )}
        
        {/* Futuristic Laser Scan Line */}
        <div className="tryon-scan-line" />
        
        {/* Soft Radial Gradient Vignette Overlay */}
        <div className="tryon-absolute tryon-inset-0 tryon-bg-gradient-to-t tryon-from-slate-900/40 tryon-to-transparent" />
      </div>
      
      {/* Progress Feel Details */}
      <div className="tryon-w-full tryon-max-w-xs tryon-space-y-4">
        
        {/* Smooth step text transitions using CSS fadeInUp */}
        <div className="tryon-h-7 tryon-overflow-hidden">
          <h3 
            key={stepText} 
            className="tryon-text-sm tryon-font-semibold tryon-text-slate-800 tryon-fade-in-up"
          >
            {stepText}
          </h3>
        </div>

        {/* Realistic Progress Bar */}
        <div className="tryon-w-full tryon-h-1.5 tryon-bg-slate-100 tryon-rounded-full tryon-overflow-hidden tryon-relative">
          <div 
            style={{ width: `${progress}%` }} 
            className="tryon-h-full tryon-bg-gradient-to-r tryon-from-cyan-500 tryon-to-blue-600 tryon-rounded-full tryon-transition-all tryon-duration-500 tryon-ease-out"
          />
        </div>

        {/* Dynamic percentage display */}
        <div className="tryon-flex tryon-justify-between tryon-items-center tryon-text-[11px] tryon-text-slate-400 font-medium px-0.5">
          <span>Virtual Try-On Engine</span>
          <span className="tryon-text-cyan-600 tryon-font-bold">{progress}%</span>
        </div>
      </div>
      
      <p className="tryon-mt-8 tryon-text-[11px] tryon-text-slate-400 tryon-max-w-[240px] tryon-leading-relaxed">
        AI model is tailoring the look. Usually takes 15-25 seconds to compile.
      </p>
    </div>
  );
};

export default ProcessingView;
