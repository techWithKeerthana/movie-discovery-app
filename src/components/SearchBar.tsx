import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { colors, radius, TOUCH } from '../theme';

interface Props {
  value: string;
  onChange: (q: string) => void;
  debounceMs?: number;
}

/**
 * typing -> (300 ms pause) -> onChange. Rapid keystrokes therefore commit ONE query; the list query key changes once,
 * which cancels any previous in-flight request, so at most one search is ever outstanding.
 */
export function SearchBar({ value, onChange, debounceMs = 300 }: Props) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, debounceMs);
  const lastSent = useRef(value);

  useEffect(() => {
    const q = debounced.trim();
    if (q !== lastSent.current) {
      lastSent.current = q;
      onChange(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Reflect changes we did not make ourselves (e.g. "Clear search and filters").
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setText(value);
    }
  }, [value]);

  const commitNow = () => {
    const q = text.trim();
    lastSent.current = q;
    onChange(q); // the keyboard's Search key skips the debounce
  };

  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={commitNow}
        placeholder="Search movies…"
        placeholderTextColor={colors.muted}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={100}
        accessibilityLabel="Search movies"
      />
      {text.length > 0 && (
        <Pressable
          onPress={() => {
            setText('');
            lastSent.current = '';
            onChange('');
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.clear}
        >
          <Ionicons name="close-circle" size={20} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TOUCH,
    paddingHorizontal: 14,
    borderRadius: radius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10 },
  clear: { padding: 2 },
});
