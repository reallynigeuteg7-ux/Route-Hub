import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

type AppIntroOverlayProps = {
  visible: boolean;
  onFinish: () => void;
};

const lightIntroSource = require('../assets/intro-light.mp4');
const darkIntroSource = require('../assets/intro-dark.mov');

const INTRO_FALLBACK_MS = 4200;

export function AppIntroOverlay({ visible, onFinish }: AppIntroOverlayProps) {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);
  const videoOffsetX = colorScheme === 'dark' ? -10 : -10;

  const source = useMemo(
    () => (colorScheme === 'dark' ? darkIntroSource : lightIntroSource),
    [colorScheme]
  );

  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.play();
  });

  useEffect(() => {
    if (!visible) {
      player.pause();
      return;
    }

    setIsReady(false);
    player.currentTime = 0;
    player.play();

    const fallbackTimer = setTimeout(() => {
      onFinish();
    }, INTRO_FALLBACK_MS);

    const endSubscription = player.addListener('playToEnd', () => {
      clearTimeout(fallbackTimer);
      onFinish();
    });

    const statusSubscription = player.addListener('statusChange', ({ error }) => {
      if (error) {
        clearTimeout(fallbackTimer);
        onFinish();
      }
    });

    return () => {
      clearTimeout(fallbackTimer);
      endSubscription.remove();
      statusSubscription.remove();
      player.pause();
    };
  }, [onFinish, player, source, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: videoOffsetX }] }]}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        playsInline
        onFirstFrameRender={() => setIsReady(true)}
      />

      {!isReady && (
        <View style={styles.loaderLayer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020617',
    zIndex: 999,
  },
  loaderLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.35)',
  },
});
