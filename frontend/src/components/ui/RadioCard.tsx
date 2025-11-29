import * as RadioGroup from "@radix-ui/react-radio-group";
import "../ui/RadioCard.css";

interface RadioCardProps {
  id: string;
  name: string;
  value: string;
  thumbnail?: string;
}

export function RadioCard({ id, name, value, thumbnail }: RadioCardProps) {
  return (
    <RadioGroup.Item value={value} className="layer-card">
      <div
        className="layer-card-header"
        style={thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined}
      />
      <div className="layer-card-label">{name}</div>
    </RadioGroup.Item>
  );
}
