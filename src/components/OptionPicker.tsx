import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, TOUCH } from '../theme';

export interface Option<T extends string | number> {
  value: T | undefined;
  label: string;
}

interface Props<T extends string | number> {
  label: string;
  options: Option<T>[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  disabled?: boolean;
  /** Shown instead of the selected option's label (e.g. "Relevance" while a search overrides the sort). */
  displayOverride?: string;
}

/** React Native has no <select>; this is a button that opens a bottom-sheet list. */
export function OptionPicker<T extends string | number>({ label, options, value, onChange, disabled = false, displayOverride }: Props<T>) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = displayOverride ?? options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current}`}
        accessibilityState={{ disabled }}
        style={[styles.trigger, disabled && styles.disabled]}
      >
        <Text style={styles.triggerLabel}>{label}</Text>
        <View style={styles.triggerValue}>
          <Text style={styles.triggerText} numberOfLines={1}>
            {current}
          </Text>
          {!disabled && <Ionicons name="chevron-down" size={14} color={colors.muted} />}
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.sheetTitle}>{label}</Text>
          <FlatList
            data={options}
            keyExtractor={(o) => String(o.value ?? 'any')}
            initialNumToRender={12}
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={styles.option}
                >
                  <Text style={[styles.optionText, selected && styles.optionSelected]}>{item.label}</Text>
                  {selected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: TOUCH,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    minWidth: 96,
    flexGrow: 1,
    flexBasis: 96,
  },
  disabled: { opacity: 0.6 },
  triggerLabel: { color: colors.muted, fontSize: 11 },
  triggerValue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  triggerText: { color: colors.text, fontSize: 14, flexShrink: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '65%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 14,
    paddingHorizontal: 8,
  },
  sheetTitle: { color: colors.muted, fontSize: 13, textAlign: 'center', marginBottom: 6 },
  option: { minHeight: TOUCH + 4, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius },
  optionText: { color: colors.text, fontSize: 16 },
  optionSelected: { color: colors.accent, fontWeight: '700' },
});
