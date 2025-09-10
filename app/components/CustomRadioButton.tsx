"use client";

interface CustomRadioButtonProps {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export default function CustomRadioButton({
  name,
  value,
  checked,
  onChange,
  label,
  description,
  disabled = false
}: CustomRadioButtonProps) {
  return (
    <label className={`flex items-center gap-3 cursor-pointer group ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      {/* CUSTOM RADIO BUTTON */}
      <div className="relative flex-shrink-0">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="absolute opacity-0 w-0 h-0 pointer-events-none" // COMPLETELY HIDE DEFAULT RADIO BUTTON
        />
        {/* CUSTOM RADIO BUTTON VISUAL */}
        <div className={`
          w-5 h-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center relative
          ${checked 
            ? 'border-purple-500 bg-purple-500' 
            : 'border-slate-400 bg-slate-600 group-hover:border-purple-400 group-hover:bg-slate-500'
          }
          ${disabled ? 'border-slate-600 bg-slate-800' : ''}
        `} style={{
          backgroundColor: checked ? '#8b5cf6' : '#475569',
          boxShadow: checked ? '0 0 0 3px rgba(139, 92, 246, 0.3), 0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
        }}>
          {/* INNER DOT WHEN SELECTED */}
          {checked && (
            <div className="w-2.5 h-2.5 bg-white rounded-full shadow-sm" style={{
              backgroundColor: 'white'
            }}></div>
          )}
        </div>
      </div>
      
      {/* LABEL CONTENT */}
      <div className="flex-1">
        <span className={`font-medium transition-colors ${
          checked ? 'text-slate-100' : 'text-slate-200 group-hover:text-slate-100'
        }`}>
          {label}
        </span>
        {description && (
          <span className="text-slate-400 text-sm ml-2">- {description}</span>
        )}
      </div>
    </label>
  );
}
