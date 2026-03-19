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
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Room, RoomType } from '@cova/shared';

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'living_room', label: 'Living Room' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'dining_room', label: 'Dining Room' },
  { value: 'home_office', label: 'Home Office' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'entryway', label: 'Entryway' },
];

export default function NewRoomScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const user = useAppStore((s) => s.user);

  const [roomName, setRoomName] = useState('');
  const [selectedType, setSelectedType] = useState<RoomType | null>(null);
  const [budget, setBudget] = useState(2500);
  const [creating, setCreating] = useState(false);

  const formatBudget = (val: number) => `$${val.toLocaleString()}`;

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
    navigation.navigate('Room', {});
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Room</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Room Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="My Living Room"
            placeholderTextColor="#888888"
            value={roomName}
            onChangeText={setRoomName}
          />

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Room Type</Text>
          <View style={styles.typeGrid}>
            {ROOM_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.typePill,
                  selectedType === type.value && styles.typePillActive,
                ]}
                onPress={() => setSelectedType(type.value)}
              >
                <Text
                  style={[
                    styles.typePillText,
                    selectedType === type.value && styles.typePillTextActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Budget</Text>
          <Text style={styles.budgetValue}>{formatBudget(budget)}</Text>
          <Slider
            style={styles.slider}
            minimumValue={500}
            maximumValue={10000}
            step={500}
            value={budget}
            onValueChange={setBudget}
            minimumTrackTintColor="#C47B3C"
            maximumTrackTintColor="rgba(27,58,45,0.2)"
            thumbTintColor="#C47B3C"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>$500</Text>
            <Text style={styles.sliderLabelText}>$10,000</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.createButton, (!roomName || !selectedType) && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={creating || !roomName || !selectedType}
        >
          {creating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createButtonText}>Create Room</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B3A2D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  headerSpacer: {
    width: 40,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  formCard: {
    backgroundColor: '#F5F0E8',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B3A2D',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 28,
    backgroundColor: 'rgba(27,58,45,0.08)',
  },
  typePillActive: {
    backgroundColor: '#C47B3C',
  },
  typePillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B3A2D',
  },
  typePillTextActive: {
    color: '#FFFFFF',
  },
  budgetValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#C47B3C',
    marginBottom: 8,
  },
  slider: {
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabelText: {
    fontSize: 12,
    color: '#888888',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: 24,
  },
  createButton: {
    backgroundColor: '#C47B3C',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
