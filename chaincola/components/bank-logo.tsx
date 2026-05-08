import { useMemo, useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import {
  getBankAvatarColour,
  getBankInitials,
  getBankLogoCandidates,
  getBundledBankLogo,
  type BankLogoInput,
} from '@/lib/bank-logos';
import { ThemedText } from '@/components/themed-text';

export type BankLogoProps = {
  bank: BankLogoInput;
  size?: number;
  rounded?: boolean;
};

export function BankLogo({ bank, size = 36, rounded = true }: BankLogoProps) {
  const bundled = useMemo(() => getBundledBankLogo(bank), [bank]);
  const remoteCandidates = useMemo(() => getBankLogoCandidates(bank), [bank]);
  const colour = useMemo(() => getBankAvatarColour(bank), [bank]);
  const initials = useMemo(() => getBankInitials(bank), [bank]);

  // Source list: bundled asset first (if present), then remote URL fallbacks.
  const sources = useMemo<ImageSourcePropType[]>(() => {
    const list: ImageSourcePropType[] = [];
    if (bundled != null) list.push(bundled);
    for (const url of remoteCandidates) list.push({ uri: url });
    return list;
  }, [bundled, remoteCandidates]);

  const [sourceIndex, setSourceIndex] = useState(0);

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: rounded ? size / 2 : 8,
  } as const;

  const currentSource = sources[sourceIndex];

  if (!currentSource) {
    return (
      <View
        style={[
          styles.container,
          containerStyle,
          { backgroundColor: colour },
        ]}
      >
        <ThemedText
          style={[styles.initials, { fontSize: Math.max(11, Math.round(size * 0.4)) }]}
        >
          {initials}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, containerStyle, styles.imageBg]}>
      <Image
        key={sourceIndex}
        source={currentSource}
        style={[styles.image, containerStyle]}
        resizeMode="contain"
        onError={() => setSourceIndex((i) => i + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageBg: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
