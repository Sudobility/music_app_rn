import { useRef, useState } from 'react';
import {
  Alert,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { MIN_TOUCH_TARGET, Text } from '@sudobility/components-rn';
import { useTranslation } from 'react-i18next';
import { SpeakerWaveIcon } from 'react-native-heroicons/solid';
import {
  outputDevices,
  selectedOutputDevice,
  setOutputDevice,
} from '@sudobility/music_synth_rn';
import { IconButton } from '@/components/layout/IconButton';
import { useNotationInk } from '@/components/icons/notation-ink';

type OutputDevice = { id: string; name: string };
type PopupMenu = {
  show(
    items: Array<{ key: string; label: string; selected: boolean }>,
    x: number,
    y: number,
  ): Promise<string | null>;
};

/** The desktop synths route to a chosen CoreAudio or WASAPI output. */
export function AudioOutputSelect() {
  const { t } = useTranslation();
  const ink = useNotationInk();
  const anchor = useRef<View>(null);
  const { width, height } = useWindowDimensions();
  const [devices, setDevices] = useState<OutputDevice[]>([]);
  const [selected, setSelected] = useState(selectedOutputDevice);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  if (Platform.OS !== 'macos' && Platform.OS !== 'windows') return null;

  const choose = async (id: string) => {
    setOpen(false);
    if (id === selectedOutputDevice()) return;
    try {
      await setOutputDevice(id);
      setSelected(id);
    } catch {
      Alert.alert(t('transport.audioOutput'), t('transport.outputUnavailable'));
    }
  };

  const show = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const available = (await outputDevices()).map(device =>
        device.id === 'default'
          ? { ...device, name: t('transport.systemDefault') }
          : device,
      );
      setDevices(available);
      const current = selectedOutputDevice();
      setSelected(current);
      anchor.current?.measureInWindow((x, y, anchorWidth) => {
        const menu = NativeModules.PopupMenuModule as PopupMenu | undefined;
        if (Platform.OS === 'macos' && menu) {
          void menu
            .show(
              available.map(device => ({
                key: device.id,
                label: device.name,
                selected: device.id === current,
              })),
              x,
              y + 30,
            )
            .then(id => {
              if (id !== null) void choose(id);
            })
            .catch(() =>
              Alert.alert(
                t('transport.audioOutput'),
                t('transport.outputUnavailable'),
              ),
            );
        } else {
          const menuWidth = Math.min(300, width - 16);
          const menuHeight = Math.min(available.length * MIN_TOUCH_TARGET, 320);
          setPosition({
            x: Math.max(
              8,
              Math.min(x + anchorWidth - menuWidth, width - menuWidth - 8),
            ),
            y: Math.max(
              8,
              Math.min(y - menuHeight - 4, height - menuHeight - 8),
            ),
          });
          setOpen(true);
        }
      });
    } catch {
      Alert.alert(t('transport.audioOutput'), t('transport.outputUnavailable'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <IconButton
          label={t('transport.audioOutput')}
          onPress={() => void show()}
          loading={busy}
        >
          <SpeakerWaveIcon size={18} color={ink.foreground} />
        </IconButton>
      </View>
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable className="flex-1" onPress={() => setOpen(false)}>
          <View
            className="bg-card border-border rounded-md border shadow-lg"
            style={{
              position: 'absolute',
              left: position.x,
              top: position.y,
              width: Math.min(300, width - 16),
              maxHeight: 320,
            }}
          >
            <ScrollView>
              {devices.map(device => (
                <Pressable
                  key={device.id}
                  accessibilityRole="menuitem"
                  accessibilityLabel={device.name}
                  accessibilityState={{ selected: device.id === selected }}
                  onPress={() => void choose(device.id)}
                  className="border-border flex-row items-center border-b px-3 py-2"
                  style={{ minHeight: MIN_TOUCH_TARGET }}
                >
                  <Text className="text-foreground flex-1" numberOfLines={1}>
                    {device.name}
                  </Text>
                  {device.id === selected ? (
                    <Text className="text-primary">✓</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
