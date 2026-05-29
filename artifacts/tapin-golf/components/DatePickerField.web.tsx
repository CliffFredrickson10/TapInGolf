import React from "react";

interface Props {
  value: Date | null;
  onChange: (date: Date | null) => void;
}

function fmt(date: Date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parse(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const today = fmt(new Date());

export default function DatePickerField({ value, onChange }: Props) {
  return (
    <input
      type="date"
      value={value ? fmt(value) : ""}
      max={today}
      onChange={e => onChange(e.target.value ? parse(e.target.value) : null)}
      style={{
        border: "1.5px solid #d1d5db",
        borderRadius: 10,
        padding: "0 12px",
        height: 46,
        fontSize: 15,
        width: "100%",
        boxSizing: "border-box",
        backgroundColor: "transparent",
        color: "inherit",
        outline: "none",
        fontFamily: "inherit",
      } as React.CSSProperties}
    />
  );
}
