import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Rect, Line } from 'react-native-svg';
import type { Room, RoomType } from '@cova/shared';

const ROOM_TYPES: { value: RoomType; label: string; icon: string }[] = [
  { value: 'living_room', label: 'Living Room', icon: 'house' },
  { value: 'bedroom', label: 'Bedroom', icon: 'bed' },
  { value: 'dining_room', label: 'Dining Room', icon: 'utensils' },
  { value: 'home_office', label: 'Home Office', icon: 'monitor' },
  { value: 'kitchen', label: 'Kitchen', icon: 'knife' },
  { value: 'bathroom', label: 'Bathroom', icon: 'droplet' },
  { value: 'entryway', label: 'Entryway', icon: 'door' },
];

function formatBudget(value: number) {
  if (value >= 10000) return `$${(value / 1000).toFixed(0)}k+`;
  if (value >= 1000) return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `$${value}`;
}

function RoomIcon({ type, active }: { type: string; active: boolean }) {
  const color = active ? '#C4A45A' : 'white';
  switch (type) {
    case 'house':
      return (
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Polyline points="9,22 9,12 15,12 15,22" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      );
    case 'bed':
      return (
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path d="M2 4v16" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M2 8h18a2 2 0 0 1 2 2v10" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M2 17h20" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M6 8v9" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'utensils':
      return (
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M7 2v20" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'monitor':
      return (
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Rect x={2} y={3} width={20} height={14} rx={2} ry={2} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Line x1={8} y1={21} x2={16} y2={21} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Line x1={12} y1={17} x2={12} y2={21} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'knife':
      return (
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path d="M2 18h6a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H2v9z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M10 11l11-11" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M19 2l3 3" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'droplet':
      return (
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'door':
      return (
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M2 20h20" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M14 12v.01" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    default:
      return null;
  }
}

export default function NewRoomScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const user = useAppStore((s) => s.user);

  const [roomName, setRoomName] = useState('');
  const [selectedType, setSelectedType] = useState<RoomType>('living_room');
  const [budget, setBudget] = useState(3000);
  const [creating, setCreating] = useState(false);

  const isValid = roomName.trim().length > 0;

  const handleCreate = async () => {
    if (!roomName || !selectedType) return Alert.alert('Missing info', 'Please add a room name and type.');
    setCreating(true);
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        user_id: user!.id,
        name: roomName,
        room_type: selectedType,
        budget,
        style_blend: { coastal: 0.2, japandi: 0.2, bohemian: 0.2, mid_century: 0.2, minimalist: 0.2 },
        dimensions_json: { width: 16, depth: 14, height: 9, unit: 'ft' },
      })
      .select()
      .single();
    setCreating(false);
    if (error) return Alert.alert('Error', error.message);
    useAppStore.getState().addRoom(data as Room);
    useAppStore.getState().setCurrentRoom(data as Room);

    const blend = (user as any)?.style_blend;
    const hasStyle = blend && Object.values(blend).some((v: any) => v > 0.21);

    if (hasStyle) {
      Alert.alert('Style Preference', 'Would you like to use your previous style or discover a new one?', [
        { text: 'Use my previous style', onPress: () => navigation.navigate('Room', {}) },
        { text: 'Discover new style', onPress: () => navigation.navigate('Room', { initialRoute: 'StyleQuiz' }) },
      ]);
    } else {
      navigation.navigate('Room', { initialRoute: 'StyleQuiz' });
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Polyline points="15,18 9,12 15,6" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Room</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {/* Room Name */}
        <View>
          <Text style={styles.sectionLabel}>ROOM NAME</Text>
          <TextInput
            style={styles.textInput}
            value={roomName}
            onChangeText={setRoomName}
            placeholder="e.g. Living Room"
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoCapitalize="words"
          />
        </View>

        {/* Room Type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ROOM TYPE</Text>
          <View style={styles.typeGrid}>
            {ROOM_TYPES.map((type) => {
              const isActive = selectedType === type.value;
              return (
                <TouchableOpacity
                  key={type.value}
                  style={[styles.typeCard, isActive && styles.typeCardActive]}
                  onPress={() => setSelectedType(type.value)}
                  activeOpacity={0.7}
                >
                  <RoomIcon type={type.icon} active={isActive} />
                  <Text style={[styles.typeLabel, isActive && styles.typeLabelActive]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Budget */}
        <View style={styles.section}>
          <View style={styles.budgetHeader}>
            <Text style={styles.sectionLabel}>BUDGET</Text>
            <Text style={styles.budgetValue}>{formatBudget(budget)}</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={500}
            maximumValue={15000}
            step={500}
            value={budget}
            onValueChange={(v) => setBudget(Math.round(v))}
            minimumTrackTintColor="#C4A45A"
            maximumTrackTintColor="rgba(255,255,255,0.12)"
            thumbTintColor="#C4A45A"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>{formatBudget(500)}</Text>
            <Text style={styles.sliderLabelText}>{formatBudget(15000)}</Text>
          </View>
        </View>

        {/* Next Button */}
        <View style={styles.nextBtnWrap}>
          <TouchableOpacity
            style={[styles.nextBtn, !isValid && styles.nextBtnDisabled]}
            onPress={handleCreate}
            disabled={!isValid || creating}
            activeOpacity={0.85}
          >
            {creating ? (
              <ActivityIndicator color="#0A1628" />
            ) : (
              <View style={styles.nextBtnInner}>
                <Text style={styles.nextBtnText}>Next: Capture Room</Text>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Polyline points="9,6 15,12 9,18" stroke="#0A1628" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </Svg>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingTop: 32,
    paddingBottom: 40,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    color: 'white',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  section: {
    marginTop: 28,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 16,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  typeCardActive: {
    backgroundColor: 'rgba(196,164,90,0.15)',
    borderColor: '#C4A45A',
  },
  typeLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
  },
  typeLabelActive: {
    color: '#C4A45A',
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  budgetValue: {
    color: '#C4A45A',
    fontSize: 18,
    fontWeight: '500',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sliderLabelText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  nextBtnWrap: {
    marginTop: 40,
  },
  nextBtn: {
    backgroundColor: '#C4A45A',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nextBtnText: {
    color: '#0A1628',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
