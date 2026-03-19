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
  beforeImageUri: string;
  afterImageUri: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_X = 20;
const MAX_X = SCREEN_WIDTH - 20;

export default function BeforeAfterSlider({ beforeImageUri, afterImageUri, onClose }: BeforeAfterSliderProps) {
  const sliderX = useRef(new Animated.Value(SCREEN_WIDTH / 2)).current;
  const dividerLeft = useRef(Animated.subtract(sliderX, new Animated.Value(1))).current;
  const handleLeft = useRef(Animated.subtract(sliderX, new Animated.Value(22))).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const currentX = useRef(SCREEN_WIDTH / 2);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

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
    <Animated.View style={[styles.container, { opacity }]}>
      {/* After image (full background) */}
      <Image source={{ uri: afterImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />

      {/* Before image (clipped to left of slider) */}
      <Animated.View style={[StyleSheet.absoluteFill, { width: sliderX, overflow: 'hidden' }]}>
        <Image source={{ uri: beforeImageUri }} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }} resizeMode="cover" />
      </Animated.View>

      {/* Divider line */}
      <Animated.View style={[styles.divider, { left: dividerLeft }]} />

      {/* Draggable handle */}
      <Animated.View
        style={[styles.handle, { left: handleLeft }]}
        {...panResponder.panHandlers}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M15 18l-6-6 6-6" stroke="#0A1628" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M9 18l6-6-6-6" stroke="#0A1628" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>

      {/* Labels */}
      <View style={styles.labelLeft}>
        <Text style={styles.labelText}>BEFORE</Text>
      </View>
      <View style={styles.labelRight}>
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
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  handle: {
    position: 'absolute',
    top: SCREEN_HEIGHT / 2 - 22,
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
    top: 20,
    left: 20,
  },
  labelRight: {
    position: 'absolute',
    top: 20,
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
    top: 60,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
});
