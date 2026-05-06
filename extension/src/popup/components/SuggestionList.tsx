interface Props {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

export default function SuggestionList({ suggestions, onSelect }: Props) {
  return (
    <ul className="qt-suggestions">
      {suggestions.map((s) => (
        // onMouseDown fires before the input's onBlur, keeping the selection reliable
        <li key={s} className="qt-suggestions__item" onMouseDown={() => onSelect(s)}>
          {s}
        </li>
      ))}
    </ul>
  );
}
