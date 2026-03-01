import React from 'react';

interface CyberInputProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  placeholder?: string;
  type?: 'text' | 'textarea' | 'select' | 'number';
  options?: { value: string; label: string }[];
  name: string;
  list?: string;
}

const CyberInput: React.FC<CyberInputProps> = ({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = 'text', 
  options,
  name,
  list
}) => {
  const inputClasses = "w-full bg-[#0A0E27] border border-[#00D9FF]/30 text-white p-3 font-mono focus:outline-none focus:border-[#00D9FF] focus:shadow-[0_0_10px_rgba(0,217,255,0.3)] transition-all";

  return (
    <div className="mb-4">
      <label className="block text-[#00D9FF] font-mono text-xs mb-1 uppercase tracking-tighter">
        {label}
      </label>
      
      {type === 'textarea' ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={4}
          className={inputClasses}
        />
      ) : type === 'select' ? (
        <select
          name={name}
          value={value}
          onChange={onChange}
          className={inputClasses}
        >
          {options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={inputClasses}
          list={list}
        />
      )}
    </div>
  );
};

export default CyberInput;