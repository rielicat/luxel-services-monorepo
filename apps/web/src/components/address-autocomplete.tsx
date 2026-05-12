'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GeocodeSuggestion } from '@/app/api/geocode/route';

interface Props {
  label: string;
  placeholder?: string;
  required?: boolean;
  onSelect: (s: GeocodeSuggestion) => void;
  onClear: () => void;
}

export function AddressAutocomplete({ label, placeholder, required, onSelect, onClear }: Props) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data: GeocodeSuggestion[] = await res.json();
    setSuggestions(data);
    setOpen(data.length > 0);
    setActiveIndex(-1);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onClear();
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(e.target.value), 300);
  };

  const handleSelect = (s: GeocodeSuggestion) => {
    setValue(s.shortName + (s.commune ? `, ${s.commune}` : ''));
    setOpen(false);
    setSuggestions([]);
    onSelect(s);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative grid gap-2">
      <Label htmlFor="address">{label}</Label>
      <Input
        id="address"
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-haspopup="listbox"
      />
      {open && (
        <ul
          role="listbox"
          className="bg-background border-border absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={() => handleSelect(s)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIndex ? 'bg-accent' : 'hover:bg-muted'
              }`}
            >
              <span className="font-medium">{s.shortName}</span>
              {s.commune && <span className="text-muted-foreground ml-1.5">— {s.commune}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
