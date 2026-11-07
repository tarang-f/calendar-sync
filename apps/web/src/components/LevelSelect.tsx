import { input } from "@/components/ui";
import { RULE_LEVEL_INFO, RULE_LEVELS, type RuleLevel } from "@/server/setup/types";

export function LevelSelect({ id, defaultValue = "busy" }: { id: string; defaultValue?: RuleLevel }) {
  return (
    <select id={id} name="level" defaultValue={defaultValue} className={input}>
      {RULE_LEVELS.map((l) => (
        <option key={l} value={l}>
          {RULE_LEVEL_INFO[l].label}
        </option>
      ))}
    </select>
  );
}
