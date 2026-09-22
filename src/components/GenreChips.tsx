import { ScrollView, Pressable, StyleSheet, Text } from 'react-native';
import type { Genre } from '@trackzio/shared';
import { colors, TOUCH } from '../theme';

interface Props {
  genres: Genre[] | undefined;
  selected: number | undefined;
  onSelect: (id: number | undefined) => void;
}

/** Horizontally scrolling genre chips. Tapping the selected chip again clears it. */
export function GenreChips({ genres, selected, onSelect }: Props) {
  if (!genres || genres.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel="Genres">
      <Chip label="All" on={selected === undefined} onPress={() => onSelect(undefined)} />
      {genres.map((g) => (
        <Chip key={g.id} label={g.name} on={selected === g.id} onPress={() => onSelect(selected === g.id ? undefined : g.id)} />
      ))}
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    minHeight: TOUCH - 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextOn: { color: colors.accentInk, fontWeight: '700' },
});
