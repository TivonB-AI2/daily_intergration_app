import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/aiProviders";

export function AiProviderSelect({
  value,
  onChange,
  className,
}: {
  value: AiProviderId;
  onChange: (id: AiProviderId) => void;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const id = v as AiProviderId;
        if (AI_PROVIDERS.some((p) => p.id === id)) onChange(id);
      }}
    >
      <SelectTrigger className={className ?? "w-48"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AI_PROVIDERS.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
