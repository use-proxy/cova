import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RoomStackParamList } from '../../navigation/RoomNavigator';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';

const BG = '#0A1628';
const GOLD = '#B8860B';
const SCREEN_WIDTH = Dimensions.get('window').width;

function formatBudget(value: number): string {
  if (value >= 10000) return '$10,000+';
  return `$${value.toLocaleString()}`;
}

export default function BudgetSliderScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RoomStackParamList>>();
  const currentRoom = useAppStore((s) => s.currentRoom);
  const user = useAppStore((s) => s.user);

  // Pre-fill from room budget or user default budget or $5000
  const initialBudget = currentRoom?.budget ?? 5000;
  const [budget, setBudget] = useState(initialBudget);

  const handleContinue = async () => {
    if (currentRoom) {
      useAppStore.getState().updateRoom(currentRoom.id, { budget });
      await supabase.from('rooms').update({ budget }).eq('id', currentRoom.id);
    }
    navigation.navigate('RoomCapture');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Set Your Budget</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.budgetValue}>{formatBudget(budget)}</Text>
          <Text style={styles.budgetLabel}>Total room budget</Text>

          <View style={styles.sliderWrap}>
            <Slider
              style={styles.slider}
              minimumValue={500}
              maximumValue={10000}
              step={100}
              value={budget}
              onValueChange={setBudget}
              minimumTrackTintColor={GOLD}
              maximumTrackTintColor="rgba(255,255,255,0.15)"
              thumbTintColor={GOLD}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>$500</Text>
              <Text style={styles.sliderLabel}>$10,000+</Text>
            </View>
          </View>

          <Text style={styles.hint}>
            This helps us recommend products within your range
          </Text>
        </View>

        {/* Continue button */}
        <TouchableOpacity style={styles.continueBtn} activeOpacity={0.85} onPress={handleContinue}>
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtn: { width: 40 },
  backText: { color: GOLD, fontSize: 22 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  budgetValue: {
    color: GOLD,
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: 2,
  },
  budgetLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    marginTop: 8,
  },
  sliderWrap: {
    width: SCREEN_WIDTH - 64,
    marginTop: 48,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 20,
  },
  continueBtn: {
    backgroundColor: GOLD,
    marginHorizontal: 24,
    marginBottom: 16,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnText: {
    color: BG,
    fontSize: 16,
    fontWeight: '700',
  },
});
