import React, { useRef, useEffect } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface BeforeAfterSliderProps {
  testID?: string;
  beforeImageUri: string;
  afterImageUri?: string; // kept for API compat but right side shows through to underlying viewer
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_X = 20;
const MAX_X = SCREEN_WIDTH - 20;
// Divider starts at 30% so user immediately sees mostly the AI render
const INITIAL_X = SCREEN_WIDTH * 0.3;
// Touch zone: 40px on each side of the divider line = 80px wide hit area
const HIT_ZONE_WIDTH = 80;

export default function BeforeAfterSlider({ testID, beforeImageUri, onClose }: BeforeAfterSliderProps) {
  const sliderX = useRef(new Animated.Value(INITIAL_X)).current;
  // zoneLeft = sliderX - 40 (40px to the left of the divider line)
  const zoneLeft = useRef(Animated.subtract(sliderX, new Animated.Value(HIT_ZONE_WIDTH / 2))).current;
  const dividerLeft = useRef(Animated.subtract(sliderX, new Animated.Value(1))).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const currentX = useRef(INITIAL_X);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  // PanResponder lives on the full-height hit zone (80px wide) — not the handle circle.
  // Only touches within 40px of the divider line are captured; everything else passes
  // through to the sphere viewer or flat image behind this overlay.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(MIN_X, Math.min(MAX_X, currentX.current + gestureState.dx));
        sliderX.setValue(newX);
      },

      onPanResponderRelease: (_, gestureState) => {
        currentX.current = Math.max(MIN_X, Math.min(MAX_X, currentX.current + gestureState.dx));
      },
    }),
  ).current;

  return (
    // box-none: container passes touches through; only the hit zone and close button capture
    <Animated.View testID={testID} style={[styles.container, { opacity }]} pointerEvents="box-none">

      {/* Before image — clipped to left of divider */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { width: sliderX, overflow: 'hidden' }]}
        pointerEvents="none"
      >
        <Image
          source={{ uri: beforeImageUri }}
          style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
          resizeMode="cover"
        />
      </Animated.View>

      {/* Static divider line (visual only) */}
      <Animated.View style={[styles.divider, { left: dividerLeft }]} pointerEvents="none" />

      {/* Full-height hit zone — 80px wide, centered on divider line */}
      <Animated.View
        style={[styles.hitZone, { left: zoneLeft }]}
        {...panResponder.panHandlers}
      >
        {/* Handle circle centered within the hit zone */}
        <View style={styles.handle}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 18l-6-6 6-6" stroke="#0A1628" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M9 18l6-6-6-6" stroke="#0A1628" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </Animated.View>

      {/* Labels */}
      <View style={styles.labelLeft} pointerEvents="none">
        <Text style={styles.labelText}>BEFORE</Text>
      </View>
      <View style={styles.labelRight} pointerEvents="none">
        <Text style={styles.labelText}>AFTER</Text>
      </View>

      {/* Close button */}
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    // No background color — right side is transparent, showing the sphere or flat image behind
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  hitZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HIT_ZONE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  labelLeft: {
    position: 'absolute',
    top: 60,
    left: 20,
  },
  labelRight: {
    position: 'absolute',
    top: 60,
    right: 20,
  },
  labelText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});
