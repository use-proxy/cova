import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Share,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SIZE = (SCREEN_WIDTH - 48) / 2;

interface RenderItem {
  id: string;
  image_url: string;
  created_at: string;
  status: string;
}

function BackChevron() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18L9 12L15 6" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#C4A45A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={4} stroke="#C4A45A" strokeWidth={1.5} />
    </Svg>
  );
}

export default function RenderGalleryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAppStore((s) => s.user);

  const [renders, setRenders] = useState<RenderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRender, setSelectedRender] = useState<RenderItem | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('renders')
        .select('id, image_url, created_at, status')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      setRenders((data as RenderItem[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const handleSave = async (imageUrl: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
      await MediaLibrary.saveToLibraryAsync(imageUrl);
    } catch {
      // silently fail
    }
  };

  const handleShare = async (imageUrl: string) => {
    try {
      await Share.share({ url: imageUrl, message: 'Check out my room design from Cova' });
    } catch {
      // silently fail
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <BackChevron />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Render Gallery</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#C4A45A" />
        </View>
      ) : (
        <FlatList
          data={renders}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.gridItem}
              onPress={() => setSelectedRender(item)}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri: item.image_url }}
                style={styles.gridImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <CameraIcon />
              <Text style={styles.emptyTitle}>No renders yet</Text>
              <Text style={styles.emptySubtext}>
                Complete your first room design to see renders here
              </Text>
            </View>
          }
        />
      )}

      {/* Full screen preview modal */}
      <Modal visible={selectedRender !== null} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          {selectedRender && (
            <Image
              source={{ uri: selectedRender.image_url }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            style={[styles.modalCloseBtn, { top: insets.top + 16 }]}
            onPress={() => setSelectedRender(null)}
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>

          {selectedRender && (
            <View style={[styles.modalActions, { bottom: insets.bottom + 24 }]}>
              <TouchableOpacity
                style={styles.modalActionBtn}
                onPress={() => handleSave(selectedRender.image_url)}
              >
                <Text style={styles.modalActionText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalActionBtn}
                onPress={() => handleShare(selectedRender.image_url)}
              >
                <Text style={styles.modalActionText}>Share</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    backgroundColor: '#0A1628',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  backBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '400',
    letterSpacing: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  columnWrapper: {
    gap: 8,
    marginBottom: 8,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '400',
    color: '#0A1628',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.45)',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  modalCloseBtn: {
    position: 'absolute',
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalCloseText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  modalActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  modalActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  modalActionText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
  },
});
