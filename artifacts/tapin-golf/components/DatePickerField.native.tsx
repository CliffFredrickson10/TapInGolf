import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  value: Date | null;
  onChange: (date: Date | null) => void;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(date: Date) {
  return `${date.getDate().toString().padStart(2,"0")} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export default function DatePickerField({ value, onChange }: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={{ color: value ? colors.foreground : colors.mutedForeground, fontSize: 15 }}>
          {value ? fmt(value) : "Select date of birth"}
        </Text>
      </TouchableOpacity>

      {open && Platform.OS === "android" && (
        <DateTimePicker
          value={value ?? new Date(1985, 0, 1)}
          mode="date"
          display="default"
          maximumDate={new Date()}
          minimumDate={new Date(1920, 0, 1)}
          onChange={(_, date) => { setOpen(false); if (date) onChange(date); }}
        />
      )}

      {open && Platform.OS === "ios" && (
        <Modal transparent animationType="slide">
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={[styles.done, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={value ?? new Date(1985, 0, 1)}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              minimumDate={new Date(1920, 0, 1)}
              onChange={(_, date) => { if (date) onChange(date); }}
              style={{ width: "100%" }}
              themeVariant="light"
            />
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, height: 46, justifyContent: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, elevation: 12 },
  header: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  done: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
