import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme';

interface Props {
  url: string | null;
  title: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Posters come in many shapes. A fixed 2:3 box with `contentFit="cover"` keeps every card the same size whatever the
 * source image's aspect ratio, and a missing or broken poster falls back to a title tile instead of a blank hole.
 */
export function PosterImage({ url, title, style }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  return (
    <View style={[styles.box, style]}>
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          recyclingKey={url}
          onError={() => setFailed(true)}
          accessibilityLabel={`${title} poster`}
        />
      ) : (
        <View style={styles.fallback} accessibilityLabel={`${title} (no poster available)`}>
          <Text style={styles.fallbackText} numberOfLines={5}>
            {title}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { aspectRatio: 2 / 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#20253a' },
  fallbackText: { color: colors.muted, fontWeight: '600', textAlign: 'center' },
});
