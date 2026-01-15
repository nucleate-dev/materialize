import { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../lib/ThemeContext';
import { BodyText, Label } from '../ui';
import { spacing, borderRadius, typography } from '../../lib/theme';
import { useChatStore, type UploadedImage } from '../../stores/chatStore';

interface ChatInputProps {
  onSend: (message: string, images: UploadedImage[]) => void;
  onInterrupt: () => void;
  isProcessing: boolean;
  isConnected: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onInterrupt,
  isProcessing,
  isConnected,
  placeholder = 'Message...',
}: ChatInputProps) {
  const { theme } = useTheme();
  const textInputRef = useRef<TextInput>(null);

  const inputValue = useChatStore((state) => state.inputValue);
  const setInputValue = useChatStore((state) => state.setInputValue);
  const uploadedImages = useChatStore((state) => state.uploadedImages);
  const addUploadedImage = useChatStore((state) => state.addUploadedImage);
  const removeUploadedImage = useChatStore((state) => state.removeUploadedImage);
  const clearUploadedImages = useChatStore((state) => state.clearUploadedImages);

  const [isPickingImage, setIsPickingImage] = useState(false);

  const canSend = (inputValue.trim().length > 0 || uploadedImages.length > 0) && isConnected;

  const handleSend = () => {
    if (!canSend || isProcessing) return;

    const message = inputValue.trim();
    const images = [...uploadedImages];

    // Clear input
    setInputValue('');
    clearUploadedImages();
    Keyboard.dismiss();

    // Send message
    onSend(message, images);
  };

  const handleInterrupt = () => {
    onInterrupt();
  };

  const handlePickImage = async () => {
    try {
      setIsPickingImage(true);

      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access media library denied');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true,
        exif: false,
      });

      if (!result.canceled && result.assets) {
        for (const asset of result.assets) {
          if (asset.base64) {
            const image: UploadedImage = {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              base64: asset.base64,
              mediaType: asset.mimeType || 'image/jpeg',
              name: asset.fileName || 'image.jpg',
              uri: asset.uri,
            };
            addUploadedImage(image);
          }
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
    } finally {
      setIsPickingImage(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      setIsPickingImage(true);

      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access camera denied');
        return;
      }

      // Take photo
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        base64: true,
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const image: UploadedImage = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            base64: asset.base64,
            mediaType: asset.mimeType || 'image/jpeg',
            name: 'photo.jpg',
            uri: asset.uri,
          };
          addUploadedImage(image);
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
    } finally {
      setIsPickingImage(false);
    }
  };

  return (
    <View style={[styles.container, { borderTopColor: theme.colors.border }]}>
      {/* Image previews */}
      {uploadedImages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.imagePreviewContainer}
          contentContainerStyle={styles.imagePreviewContent}
        >
          {uploadedImages.map((image) => (
            <View key={image.id} style={styles.imagePreviewWrapper}>
              <Image source={{ uri: image.uri }} style={styles.imagePreview} />
              <Pressable
                style={[styles.removeImageButton, { backgroundColor: theme.colors.destructive }]}
                onPress={() => removeUploadedImage(image.id)}
                hitSlop={8}
              >
                <BodyText size="xs" color="#fff">
                  ✕
                </BodyText>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Input row */}
      <View style={styles.inputRow}>
        {/* Attachment button */}
        <Pressable
          style={[styles.attachButton, { backgroundColor: theme.colors.muted }]}
          onPress={handlePickImage}
          disabled={isPickingImage}
        >
          {isPickingImage ? (
            <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
          ) : (
            <BodyText size="lg">📎</BodyText>
          )}
        </Pressable>

        {/* Text input */}
        <TextInput
          ref={textInputRef}
          style={[
            styles.textInput,
            {
              backgroundColor: theme.colors.card,
              color: theme.colors.foreground,
              borderColor: theme.colors.border,
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.mutedForeground}
          value={inputValue}
          onChangeText={setInputValue}
          multiline
          maxLength={10000}
          editable={!isProcessing}
        />

        {/* Send or Stop button */}
        {isProcessing ? (
          <Pressable
            style={[styles.sendButton, { backgroundColor: theme.colors.destructive }]}
            onPress={handleInterrupt}
          >
            <BodyText color={theme.colors.destructiveForeground}>■</BodyText>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.sendButton,
              {
                backgroundColor: canSend ? theme.colors.primary : theme.colors.muted,
              },
            ]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <BodyText
              color={canSend ? theme.colors.primaryForeground : theme.colors.mutedForeground}
            >
              ➤
            </BodyText>
          </Pressable>
        )}
      </View>

      {/* Connection status */}
      {!isConnected && (
        <View style={styles.connectionWarning}>
          <BodyText size="xs" color={theme.colors.warning}>
            Connecting...
          </BodyText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingTop: spacing[2],
  },
  imagePreviewContainer: {
    maxHeight: 80,
    marginBottom: spacing[2],
  },
  imagePreviewContent: {
    paddingHorizontal: spacing[3],
    gap: spacing[2],
  },
  imagePreviewWrapper: {
    position: 'relative',
  },
  imagePreview: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[2],
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2.5],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    fontSize: typography.fontSize.base,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionWarning: {
    alignItems: 'center',
    paddingBottom: spacing[2],
  },
});
