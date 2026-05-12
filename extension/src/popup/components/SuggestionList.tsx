interface Props {
  readonly suggestions: string[];
  readonly onSelect: (suggestion: string) => void;
}

export default function SuggestionList({ suggestions, onSelect }: Readonly<Props>) {
  return (
    <ul className="qt-suggestions">
      {suggestions.map((s) => (
        <li key={s} className="qt-suggestions__item">
          {/* onMouseDown fires before the input's onBlur, keeping the selection reliable */}
          <button type="button" onMouseDown={() => onSelect(s)}>
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}
