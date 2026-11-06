import { Image } from 'expo-image';
import { Search, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BottomSheet } from '@/components';
import { useThemeColors } from '@/theme';

import { searchGifs, type Gif } from './klipy';

const GAP = 8;

/** Split gifs into two balanced columns (masonry) for the given column width. */
function toColumns(gifs: Gif[], colWidth: number): [Gif[], Gif[]] {
  const cols: [Gif[], Gif[]] = [[], []];
  const heights = [0, 0];
  for (const g of gifs) {
    const h = (colWidth * g.previewHeight) / (g.previewWidth || 1);
    const target = heights[0] <= heights[1] ? 0 : 1;
    cols[target].push(g);
    heights[target] += h + GAP;
  }
  return cols;
}

function GifCell({
  gif,
  width,
  onPick,
}: {
  gif: Gif;
  width: number;
  onPick: (g: Gif) => void;
}) {
  const c = useThemeColors();
  const height = (width * gif.previewHeight) / (gif.previewWidth || 1);
  return (
    <Pressable onPress={() => onPick(gif)} style={{ marginBottom: GAP }}>
      <Image
        source={gif.previewUrl}
        style={{ width, height, borderRadius: 10, backgroundColor: c.surfaceRaised }}
        contentFit="cover"
        transition={120}
        accessibilityLabel={gif.description}
      />
    </Pressable>
  );
}

export function GifPicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (gif: Gif) => void;
}) {
  const c = useThemeColors();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colWidth, setColWidth] = useState(0);
  const seq = useRef(0);

  // Debounced search; empty query → trending. seq guards against stale responses.
  useEffect(() => {
    if (!visible) return;
    const mySeq = ++seq.current;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchGifs(query)
        .then((res) => {
          if (seq.current !== mySeq) return;
          setGifs(res);
          setLoading(false);
        })
        .catch((e) => {
          if (seq.current !== mySeq) return;
          setError(e instanceof Error ? e.message : 'Could not load GIFs.');
          setLoading(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, visible]);

  const [left, right] = colWidth > 0 ? toColumns(gifs, colWidth) : [[], []];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ height: 460 }}>
        {/* search bar */}
        <View
          className="mb-md flex-row items-center gap-sm rounded-full px-md"
          style={{ backgroundColor: c.surfaceRaised, height: 40 }}
        >
          <Search size={18} color={c.textFaint} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search GIFs"
            placeholderTextColor={c.textFaint}
            autoCorrect={false}
            className="flex-1"
            style={{
              color: c.text,
              fontSize: 15,
              paddingVertical: 8,
              ...(({ outlineStyle: 'none' } as unknown) as object),
            }}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={16} color={c.textFaint} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>

        <View
          style={{ flex: 1 }}
          onLayout={(e) => setColWidth((e.nativeEvent.layout.width - GAP) / 2)}
        >
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={c.primary} />
            </View>
          ) : error ? (
            <View className="flex-1 items-center justify-center px-xl">
              <Text className="text-center text-sm text-textMuted">{error}</Text>
            </View>
          ) : gifs.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-sm text-textMuted">No GIFs found</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', gap: GAP }}>
                <View style={{ flex: 1 }}>
                  {left.map((g) => (
                    <GifCell key={g.id} gif={g} width={colWidth} onPick={onPick} />
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  {right.map((g) => (
                    <GifCell key={g.id} gif={g} width={colWidth} onPick={onPick} />
                  ))}
                </View>
              </View>
            </ScrollView>
          )}
        </View>

        <Text className="mt-xs text-center text-xs text-textFaint">Powered by KLIPY</Text>
      </View>
    </BottomSheet>
  );
}
