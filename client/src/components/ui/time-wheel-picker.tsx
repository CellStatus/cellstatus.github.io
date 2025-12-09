import * as React from "react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

interface TimeWheelPickerProps {
  value: string; // "HH:MM" in 24h
  onChange: (value: string) => void;
  label?: string;
}

export const TimeWheelPicker: React.FC<TimeWheelPickerProps> = ({ value, onChange, label }) => {
  // Convert value to 12-hour format
  let [hour, minute] = value.split(":");
  let hourNum = parseInt(hour, 10);
  const isPM = hourNum >= 12;
  let displayHour = hourNum % 12;
  if (displayHour === 0) displayHour = 12;
  const ampm = isPM ? "PM" : "AM";

  const hours = Array.from({ length: 12 }, (_, i) => ((i + 1).toString().padStart(2, "0")));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

  function handleHourChange(h: string) {
    let hNum = parseInt(h, 10);
    if (ampm === "PM" && hNum !== 12) hNum += 12;
    if (ampm === "AM" && hNum === 12) hNum = 0;
    onChange(`${hNum.toString().padStart(2, "0")}:${minute}`);
  }
  function handleMinuteChange(m: string) {
    onChange(`${hourNum.toString().padStart(2, "0")}:${m}`);
  }
  function handleAMPMChange(next: string) {
    let hNum = hourNum;
    if (next === "PM" && hNum < 12) hNum += 12;
    if (next === "AM" && hNum >= 12) hNum -= 12;
    onChange(`${hNum.toString().padStart(2, "0")}:${minute}`);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {label && <span className="text-xs text-muted-foreground mb-1">{label}</span>}
      <div className="flex gap-1 items-center">
        <Select value={displayHour.toString().padStart(2, "0")}
          onValueChange={handleHourChange}>
          <SelectTrigger className="w-12">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hours.map(h => (
              <SelectItem key={h} value={h}>{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="font-mono text-lg">:</span>
        <Select value={minute} onValueChange={handleMinuteChange}>
          <SelectTrigger className="w-12">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {minutes.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ampm} onValueChange={handleAMPMChange}>
          <SelectTrigger className="w-14">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
