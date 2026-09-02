'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GeocodeSuggestion } from '@/app/api/geocode/route';

interface Props {
  label: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  onSelect: (s: GeocodeSuggestion) => void;
  onClear: () => void;
}

export function AddressAutocomplete({
  label,
  placeholder,
  required,
  defaultValue,
  onSelect,
  onClear,
}: Props) {
  const t = useTranslations('calculator');
  const [value, setValue] = useState(defaultValue ?? '');
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const queryRef = useRef('');

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    queryRef.current = q;
    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (queryRef.current !== q) return;
      if (!res.ok) {
        setSuggestions([]);
        return;
      }
      const data: GeocodeSuggestion[] = await res.json();
      if (queryRef.current !== q) return;
      setSuggestions(data);
      setActiveIndex(-1);
    } finally {
      if (queryRef.current === q) setLoading(false);
    }
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
    queryRef.current = '';
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

  const showDropdown = open && value.trim().length >= 3;

  return (
    <div ref={containerRef} className="relative grid gap-2">
      <Label htmlFor="address">{label}</Label>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          id="address"
          required={required}
          autoComplete="off"
          placeholder={placeholder ?? 'Escribe tu calle y número…'}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => value.trim().length >= 3 && setOpen(true)}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-busy={loading}
          aria-controls="address-listbox"
          aria-activedescendant={activeIndex >= 0 ? `address-opt-${activeIndex}` : undefined}
          className="pl-9 pr-9"
        />
        {loading && (
          <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="border-primary/25 border-t-primary block h-4 w-4 animate-spin rounded-full border-2" />
          </span>
        )}
      </div>

      {showDropdown && (
        <ul
          role="listbox"
          id="address-listbox"
          className="bg-popover border-border shadow-card animate-fade-in-up absolute top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border [animation-duration:180ms]"
        >
          {loading && suggestions.length === 0 && (
            <>
              <li className="sr-only" aria-live="polite">
                {t('address_searching')}
              </li>
              {[0, 1, 2].map((i) => (
                <li key={i} aria-hidden className="flex items-center gap-3 px-3.5 py-2.5">
                  <span
                    className="bg-muted h-4 w-4 shrink-0 animate-pulse rounded-full"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                  <span className="grid flex-1 gap-1.5">
                    <span
                      className="bg-muted h-3 animate-pulse rounded"
                      style={{ width: `${70 - i * 12}%`, animationDelay: `${i * 120}ms` }}
                    />
                    <span
                      className="bg-muted/60 h-2 animate-pulse rounded"
                      style={{ width: `${40 - i * 6}%`, animationDelay: `${i * 120 + 60}ms` }}
                    />
                  </span>
                </li>
              ))}
            </>
          )}
          {!loading && suggestions.length === 0 && (
            <li className="text-muted-foreground px-3.5 py-3 text-sm">{t('address_no_results')}</li>
          )}
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              id={`address-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={() => handleSelect(s)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-sm transition-colors ${
                i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              }`}
            >
              <MapPin className="text-secondary mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-medium">{s.shortName}</span>
                {s.commune && <span className="text-muted-foreground ml-1.5">— {s.commune}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
