import * as RadioGroup from "@radix-ui/react-radio-group";
import "../ui/RadioCard.css";

interface RadioCardProps {
  id: string;
  name: string;
  value: string;
}

export function RadioCard({ id, name, value }: RadioCardProps) {
  return (
    <RadioGroup.Item value={value} className="layer-card">
      <div className={`layer-card-preview ${id}-preview`} />
      <span className="layer-card-label">{name}</span>
    </RadioGroup.Item>
  );
}
