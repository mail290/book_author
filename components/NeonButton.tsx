
import React from 'react';

interface NeonButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'cyan' | 'magenta' | 'lime';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}

const NeonButton: React.FC<NeonButtonProps> = ({ 
  children, 
  onClick, 
  variant = 'cyan', 
  className = '', 
  type = 'button',
  disabled = false
}) => {
  const baseClasses = "px-6 py-2 font-mono uppercase tracking-widest text-sm font-bold border-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    cyan: "border-[#00D9FF] text-[#00D9FF] shadow-[0_0_5px_rgba(0,217,255,0.5)] hover:bg-[#00D9FF] hover:text-[#0A0E27] hover:shadow-[0_0_20px_rgba(0,217,255,0.8)]",
    magenta: "border-[#FF006E] text-[#FF006E] shadow-[0_0_5px_rgba(255,0,110,0.5)] hover:bg-[#FF006E] hover:text-white hover:shadow-[0_0_20px_rgba(255,0,110,0.8)]",
    lime: "border-[#FFBE0B] text-[#FFBE0B] shadow-[0_0_5px_rgba(255,190,11,0.5)] hover:bg-[#FFBE0B] hover:text-[#0A0E27] hover:shadow-[0_0_20px_rgba(255,190,11,0.8)]",
  };

  return (
    <button 
      type={type}
      onClick={onClick} 
      disabled={disabled}
      className={`${baseClasses} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export default NeonButton;
