import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  PanResponder,
  Alert,
  ScrollView,
} from 'react-native';
import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '@cova/shared';
import { useAppStore } from '../../store';

const { width: SW, height: SH } = Dimensions.get('window');
const IMAGE_PREVIEW_HEIGHT = SH * 0.55;

type Corner = { x: number; y: number };
type CornerKey = 'tl' | 'tr' | 'bl' | 'br';

const CORNER_LABELS: Record<CornerKey, string> = {
  tl: 'TL',
  tr: 'TR',
  bl: 'BL',
  br: 'BR',
};

const DEFAULT_CORNERS: Record<CornerKey, Corner> = {
  tl: { x: 0.15, y: 0.2 },
  tr: { x: 0.85, y: 0.2 },
  bl: { x: 0.05, y: 0.8 },
  br: { x: 0.95, y: 0.8 },
};

type RouteParams = { room_id: string; image_url: string };

export function RoomCalibrationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const { room_id, image_url } = route.params ?? {};
  const { user } = useAppStore();

  const [corners, setCorners] = useState<Record<CornerKey, Corner>>(DEFAULT_CORNERS);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);
  const [dimensions, setDims] = useState({ w: 14, d: 12, h: 9 });
  const [saving, setSaving] = useState(false);

  const containerRef = useRef<View>(null);
  const containerLayout = useRef({ x: 0, y: 0, width: SW, height: IMAGE_PREVIEW_HEIGHT });

  const toPixel = (c: Corner) => ({
    x: c.x * containerLayout.current.width,
    y: c.y * containerLayout.current.height,
  });

  const toFraction = (px: number, py: number): Corner => ({
    x: Math.max(0, Math.min(1, px / containerLayout.current.width)),
    y: Math.max(0, Math.min(1, py / containerLayout.current.height)),
  });

  const findClosestCorner = (tx: number, ty: number): CornerKey => {
    let best: CornerKey = 'tl';
    let bestDist = Infinity;
    (Object.keys(corners) as CornerKey[]).forEach((k) => {
      const p = toPixel(corners[k]);
      const d = Math.hypot(tx - p.x, ty - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    });
    return best;
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      const closest = findClosestCorner(locationX, locationY);
      setActiveCorner(closest);
    },
    onPanResponderMove: (e) => {
      if (!activeCorner) return;
      const { locationX, locationY } = e.nativeEvent;
      setCorners((prev) => ({
        ...prev,
        [activeCorner]: toFraction(locationX, locationY),
      }));
    },
    onPanResponderRelease: () => setActiveCorner(null),
  });

  const saveCalibration = async () => {
    if (!room_id) {
      Alert.alert('Error', 'Missing room_id');
      return;
    }
    setSaving(true);
    try {
      const { width: iw, height: ih } = containerLayout.current;
      const calibration_data = {
        corner_tl: corners.tl,
        corner_tr: corners.tr,
        corner_bl: corners.bl,
        corner_br: corners.br,
        floor_line_y: (corners.bl.y + corners.br.y) / 2,
        image_width: iw,
        image_height: ih,
      };
      const room_dimensions = {
        width_ft: dimensions.w,
        depth_ft: dimensions.d,
        height_ft: dimensions.h,
      };
      const { error } = await supabase
        .from('rooms')
        .update({ calibration_data, room_dimensions })
        .eq('id', room_id);
      if (error) throw error;
      navigation.navigate('RoomViewer3D', { room_id, image_url });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save calibration');
    } finally {
      setSaving(false);
    }
  };

  const cw = containerLayout.current.width || SW;
  const ch = containerLayout.current.height || IMAGE_PREVIEW_HEIGHT;
  const pts = {
    tl: toPixel(corners.tl),
    tr: toPixel(corners.tr),
    bl: toPixel(corners.bl),
    br: toPixel(corners.br),
  };
  const polygonPoints = `${pts.tl.x},${pts.tl.y} ${pts.tr.x},${pts.tr.y} ${pts.br.x},${pts.br.y} ${pts.bl.x},${pts.bl.y}`;

  return (
    <ScrollView style={s.container} scrollEnabled={false}>
      <Text style={s.title}>Mark Your Room Corners</Text>
      <Text style={s.subtitle}>
        Drag the handles to the four corners of your room's walls
      </Text>

      <View
        ref={containerRef}
        style={[s.imageContainer, { height: IMAGE_PREVIEW_HEIGHT }]}
        onLayout={(e) => {
          containerLayout.current = {
            x: e.nativeEvent.layout.x,
            y: e.nativeEvent.layout.y,
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          };
        }}
        {...panResponder.panHandlers}
      >
        <Image source={{ uri: image_url }} style={s.image} resizeMode="cover" />
        <Svg style={StyleSheet.absoluteFill} width={cw} height={ch}>
          <Polygon
            points={polygonPoints}
            fill="rgba(201,168,76,0.15)"
            stroke="#C9A84C"
            strokeWidth={2}
            strokeDasharray="8,4"
          />
          {(Object.keys(corners) as CornerKey[]).map((k) => (
            <React.Fragment key={k}>
              <Circle
                cx={toPixel(corners[k]).x}
                cy={toPixel(corners[k]).y}
                r={activeCorner === k ? 22 : 16}
                fill={activeCorner === k ? '#C9A84C' : 'rgba(201,168,76,0.8)'}
                stroke="white"
                strokeWidth={2}
              />
              <SvgText
                x={toPixel(corners[k]).x}
                y={toPixel(corners[k]).y + 5}
                fill="white"
                fontSize={10}
                fontWeight="bold"
                textAnchor="middle"
              >
                {CORNER_LABELS[k]}
              </SvgText>
            </React.Fragment>
          ))}
        </Svg>
      </View>

      <Text style={s.dimsLabel}>Room size (approx. ft)</Text>
      <View style={s.dimsRow}>
        {(['Width', 'Depth', 'Height'] as const).map((label, i) => {
          const key = label === 'Width' ? 'w' : label === 'Depth' ? 'd' : 'h';
          return (
            <View key={key} style={s.dimItem}>
              <Text style={s.dimLabel}>{label}</Text>
              <View style={s.dimButtons}>
                <TouchableOpacity
                  style={s.dimBtn}
                  onPress={() =>
                    setDims((d) => ({ ...d, [key]: Math.max(6, d[key] - 1) }))
                  }
                >
                  <Text style={s.dimBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={s.dimValue}>{dimensions[key]}′</Text>
                <TouchableOpacity
                  style={s.dimBtn}
                  onPress={() =>
                    setDims((d) => ({ ...d, [key]: Math.min(40, d[key] + 1) }))
                  }
                >
                  <Text style={s.dimBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={s.cta}
        onPress={saveCalibration}
        disabled={saving}
      >
        <Text style={s.ctaText}>
          {saving ? 'Saving...' : 'View My Room in 3D →'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1729' },
  title: {
    color: '#FAF7F2',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 24,
    marginHorizontal: 20,
  },
  subtitle: {
    color: '#8A8070',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    marginHorizontal: 20,
  },
  imageContainer: {
    position: 'relative',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  dimsLabel: { color: '#C9A84C', fontSize: 13, fontWeight: '700', paddingHorizontal: 16 },
  dimsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    flexWrap: 'wrap',
  },
  dimItem: { flex: 1, minWidth: 80, alignItems: 'center' },
  dimLabel: { color: '#8A8070', fontSize: 12, marginBottom: 4 },
  dimButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dimBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(201,168,76,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimBtnText: { color: '#C9A84C', fontSize: 18, fontWeight: '700' },
  dimValue: {
    color: '#FAF7F2',
    fontSize: 16,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  cta: {
    margin: 20,
    backgroundColor: '#C9A84C',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  ctaText: { color: '#0B1729', fontSize: 18, fontWeight: '900' },
});
