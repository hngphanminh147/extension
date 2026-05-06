import { Search } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onDismissSuggestions: () => void;
}

export default function SearchInput({ value, onChange, onSubmit, onDismissSuggestions }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    } else if (e.key === 'Escape') {
      onDismissSuggestions();
    }
  };

  const handleBlur = () => setTimeout(onDismissSuggestions, 150);

  return (
    <div className="qt-search">
      <input
        type="text"
        className="qt-search__input"
        placeholder="Enter text to translate…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        autoFocus
        spellCheck={false}
        aria-label="Text to translate"
      />
      <button
        className="qt-search__btn"
        onClick={onSubmit}
        aria-label="Translate"
        tabIndex={-1}
      >
        <Search size={15} />
      </button>
    </div>
  );
}
